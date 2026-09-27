import type {
  Asset,
  Decision,
  DecisionOutcome,
  Policy,
  RuleConfig,
  RuleId,
  RuleOutcome,
  RuleTrace,
  TierId,
  TxClass,
} from '../types';
import type { PhishingVerdict } from '../security/phishing';
import { cleanVerdict } from '../security/phishing';
import { defaultRulesFor, getTier } from './tiers';
import { RULE_META } from './rules';

/**
 * The single gate every outgoing action passes through.
 *
 * Pure function: same context in, same decision out. That makes it testable and
 * makes the audit log meaningful — a recorded decision can be replayed and
 * re-derived from the policy that was in force at the time.
 */

export interface PolicyContext {
  tier: TierId;
  rules: RuleConfig[];
  asset: Asset;
  amountUsd: number;
  amount: number;
  address: string;
  txClass: TxClass;
  /** Destination never seen by this vault before. */
  isNewAddress: boolean;
  /** Destination is an address this vault controls (intra-vault movement). */
  destinationOwnedByVault: boolean;
  spent24hUsd: number;
  txCountLastHour: number;
  now: number;
  phishing: PhishingVerdict;
  /** Operator has completed out-of-band fingerprint confirmation. */
  secureSendVerified: boolean;
  duressActive: boolean;
  frozen: boolean;
  /** Horcrux shard set available to this wallet, when one exists. */
  shards?: { m: number; n: number };
  /** Set when evaluating a consolidation sweep rather than a payment. */
  sweepContext?: boolean;
  /** Sweep source sat idle this long (days). */
  sweepIdleDays?: number;
  approval?: { spender: string; unlimited: boolean; amountUsd: number };
}

const SEVERITY_ORDER: Record<RuleOutcome, number> = { pass: 0, challenge: 1, delay: 2, quorum: 3, deny: 4 };
const OUTCOME_LABEL: Record<DecisionOutcome, string> = {
  allow: 'Allowed by policy',
  challenge: 'Additional verification required',
  delay: 'Held by policy',
  quorum: 'Horcrux shard quorum required',
  deny: 'Blocked by policy',
};

const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const bool = (v: unknown, fallback = false): boolean => (typeof v === 'boolean' ? v : fallback);
const list = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : []);

export function ruleOf(rules: RuleConfig[], id: RuleId): RuleConfig | undefined {
  return rules.find((r) => r.id === id);
}

/**
 * Rules in force for a wallet:
 *   wallet tier defaults  →  vault-wide edits (`custom`)  →  per-wallet overrides
 *
 * The wallet's tier is the base, so moving a wallet to tier 0 immediately makes
 * it behave like tier 0 even if nobody edited a rule. Vault-wide edits ride on
 * top so a single change can harden every wallet at once.
 */
export function effectiveRules(policy: Policy, walletId: string, walletTier?: TierId): RuleConfig[] {
  const byId = new Map(defaultRulesFor(walletTier ?? policy.tier).map((r) => [r.id, r]));
  for (const r of policy.rules) if (r.custom) byId.set(r.id, r);
  const override = policy.overrides[walletId];
  if (override) for (const r of override) byId.set(r.id, r);
  return [...byId.values()];
}

/** Rules the tier forbids turning off — the guardrail under the guardrails. */
export function isLocked(tier: TierId, id: RuleId): boolean {
  return getTier(tier).lockedRules.includes(id);
}

function trace(
  id: RuleId,
  outcome: RuleOutcome,
  detail: string,
  severity: RuleTrace['severity'] = 'info',
  remediation?: string,
): RuleTrace {
  return { ruleId: id, label: RULE_META[id].label, outcome, detail, severity, remediation };
}

function utcHour(now: number): number {
  return new Date(now).getUTCHours();
}

const insideWindow = (hour: number, start: number, end: number): boolean =>
  start === end ? true : start < end ? hour >= start && hour < end : hour >= start || hour < end;

/** Seconds until the next opening of the [startHour, endHour) UTC window. */
export function secondsUntilWindow(now: number, startHour: number, endHour: number): number {
  if (startHour === endHour) return 0;
  const d = new Date(now);
  const hour = d.getUTCHours();
  if (insideWindow(hour, startHour, endHour)) return 0;
  // Outside a window we always wait for the next opening, which is startHour —
  // including windows that wrap midnight (start > end).
  const hoursAhead = (startHour - hour + 24) % 24 || 24;
  return Math.max(60, hoursAhead * 3600 - d.getUTCMinutes() * 60 - d.getUTCSeconds());
}

export function evaluatePolicy(ctx: PolicyContext): Decision {
  const traces: RuleTrace[] = [];
  const requiredSteps = new Set<Decision['requiredSteps'][number]>();
  let holdSeconds = 0;
  let quorum: Decision['quorum'];
  const address = ctx.address.trim();

  /* Frozen wallets (a react fired) short-circuit everything else. */
  if (ctx.frozen) {
    return {
      outcome: 'deny',
      headline: 'Wallet is frozen by a defensive react',
      traces: [
        {
          ruleId: 'denylist',
          label: 'Outbound freeze',
          outcome: 'deny',
          detail: 'An automation react froze this wallet. Unfreeze from the Reacts console after reviewing the event.',
          severity: 'critical',
          remediation: 'Review the triggering event, then unfreeze.',
        },
      ],
      holdSeconds: 0,
      requiredSteps: [],
      evaluatedAt: ctx.now,
    };
  }

  const rule = (id: RuleId): RuleConfig | undefined => ruleOf(ctx.rules, id);
  const on = (id: RuleId): boolean => !!rule(id)?.enabled;

  /* --------------------------------------------------------- destination */

  if (on('denylist')) {
    const blocked = list(rule('denylist')!.params.addresses).map((a) => a.trim().toLowerCase());
    if (blocked.includes(address.toLowerCase())) {
      traces.push(
        trace('denylist', 'deny', 'Destination is on the denylist for this wallet.', 'critical', 'Remove only if you can prove who controls it.'),
      );
    }
  }

  if (on('phishingShield')) {
    const p = ctx.phishing;
    const critical = p.findings.filter((f) => f.severity === 'critical');
    if (p.level === 'dangerous') {
      traces.push(
        trace(
          'phishingShield',
          'deny',
          critical[0]?.detail ?? p.recommendation,
          'critical',
          'Abandon this payment. Report the source and rotate the address you were given.',
        ),
      );
    } else if (p.level === 'suspicious') {
      traces.push(
        trace('phishingShield', 'challenge', p.recommendation, 'warn', 'Confirm the full address with the payee over a second channel.'),
      );
      requiredSteps.add('secureSend');
    }
  }

  /* --------------------------------------------------------------- duress */

  if (on('duressTrigger') && ctx.duressActive) {
    const mins = num(rule('duressTrigger')!.params.freezeMinutes, 240);
    traces.push(
      trace(
        'duressTrigger',
        'deny',
        `Duress mode is active: real wallets are frozen for ${mins >= 1440 ? `${Math.round(mins / 60)}h` : `${mins}m`}. Nothing is being logged to the screen.`,
        'critical',
        'Exit duress mode from the lock screen to restore access.',
      ),
    );
  }

  /* ---------------------------------------------------------------- limits */

  if (on('maxPerTx')) {
    const limit = num(rule('maxPerTx')!.params.limitUsd);
    if (ctx.amountUsd > limit) {
      const canExcept = !!ctx.shards || ctx.tier >= 3;
      traces.push(
        trace(
          'maxPerTx',
          canExcept ? 'quorum' : 'deny',
          limit === 0
            ? 'This tier has no standing spending authority — every movement is an exception that must be approved.'
            : `$${Math.round(ctx.amountUsd).toLocaleString()} exceeds the $${limit.toLocaleString()} per-transaction ceiling.`,
          'warn',
          canExcept ? 'Approve a one-time exception with a shard quorum.' : 'Use a higher tier or split across days (and accept the extra linkage).',
        ),
      );
      if (canExcept) {
        requiredSteps.add('shards');
        quorum ??= { m: ctx.shards?.m ?? 2, n: ctx.shards?.n ?? 3, purpose: 'One-time policy exception' };
      }
    }
  }

  if (on('dailyVelocity')) {
    const limit = num(rule('dailyVelocity')!.params.limitUsd);
    const projected = ctx.spent24hUsd + ctx.amountUsd;
    if (projected > limit) {
      traces.push(
        trace(
          'dailyVelocity',
          limit === 0 ? 'quorum' : 'delay',
          limit === 0
            ? 'This tier has no daily spending authority.'
            : `With this transaction the wallet would move $${Math.round(projected).toLocaleString()} in 24h against a $${limit.toLocaleString()} cap.`,
          'warn',
          limit === 0 ? 'Approve with a shard quorum.' : 'Wait for the rolling window to free capacity, or approve with a shard quorum.',
        ),
      );
      if (limit === 0) {
        requiredSteps.add('shards');
        quorum ??= { m: ctx.shards?.m ?? 2, n: ctx.shards?.n ?? 3, purpose: 'Standing authority exception' };
      } else {
        holdSeconds = Math.max(holdSeconds, 3600);
      }
    }
  }

  if (on('hourlyVelocity')) {
    const max = num(rule('hourlyVelocity')!.params.maxTxs, 10);
    if (ctx.txCountLastHour >= max) {
      traces.push(
        trace('hourlyVelocity', 'delay', `${ctx.txCountLastHour} transactions in the last hour against a limit of ${max}.`, 'warn', 'Rate limit cools down in 15 minutes.'),
      );
      holdSeconds = Math.max(holdSeconds, 900);
    }
  }

  /* ---------------------------------------------------------- destination */

  if (on('allowlist')) {
    const allowed = list(rule('allowlist')!.params.addresses).map((a) => a.trim().toLowerCase());
    const threshold = num(rule('allowlist')!.params.requireForLargeUsd);
    const tierLocksAllowlist = getTier(ctx.tier).lockedRules.includes('allowlist');
    const isAllowed = allowed.includes(address.toLowerCase()) || ctx.destinationOwnedByVault;
    if (!isAllowed && (threshold === 0 || ctx.amountUsd >= threshold)) {
      traces.push(
        trace(
          'allowlist',
          tierLocksAllowlist ? 'deny' : 'challenge',
          tierLocksAllowlist
            ? 'Reclaimer tier only pays destinations this vault owns, or addresses explicitly allowlisted with a shard quorum.'
            : `Destination is not allowlisted${
                threshold === 0 ? '' : ` and this transaction is above the $${threshold.toLocaleString()} allowlist threshold`
              }.`,
          'warn',
          'Allowlist the destination (requires shard quorum) and re-verify out-of-band.',
        ),
      );
      if (!tierLocksAllowlist) requiredSteps.add('shards');
    }
  }

  if (on('newAddressCooldown') && ctx.isNewAddress) {
    const minutes = num(rule('newAddressCooldown')!.params.minutes);
    if (minutes > 0) {
      traces.push(
        trace(
          'newAddressCooldown',
          'delay',
          `First contact with this destination: policy holds the transaction for ${minutes >= 1440 ? `${Math.round(minutes / 60)}h` : `${minutes}m`} so a clipboard hijack has time to be noticed.`,
          'warn',
          bool(rule('newAddressCooldown')!.params.requirePasskey) ? 'Release early with a passkey assertion.' : 'Wait out the cool-down.',
        ),
      );
      holdSeconds = Math.max(holdSeconds, minutes * 60);
      if (bool(rule('newAddressCooldown')!.params.requirePasskey)) requiredSteps.add('passkey');
    }
  }

  /* --------------------------------------------------------------- timing */

  if (on('timelock')) {
    const seconds = num(rule('timelock')!.params.seconds);
    const above = num(rule('timelock')!.params.aboveUsd);
    if (seconds > 0 && ctx.amountUsd >= above) {
      traces.push(
        trace('timelock', 'delay', `Queued for ${formatDuration(seconds)}; stays cancellable the whole time.`, 'info', 'Cancel any time before release.'),
      );
      holdSeconds = Math.max(holdSeconds, seconds);
    }
  }

  if (on('timeWindow')) {
    const start = num(rule('timeWindow')!.params.startHour, 0);
    const end = num(rule('timeWindow')!.params.endHour, 24);
    const above = num(rule('timeWindow')!.params.enforceAboveUsd);
    if (end > start && ctx.amountUsd >= above) {
      const hour = utcHour(ctx.now);
      if (hour < start || hour >= end) {
        const wait = secondsUntilWindow(ctx.now, start, end);
        traces.push(
          trace(
            'timeWindow',
            'delay',
            `Signing is only permitted between ${pad(start)}:00 and ${pad(end)}:00 UTC. Now ${pad(hour)}:xx UTC.`,
            'info',
            `Window opens in ${formatDuration(wait)}.`,
          ),
        );
        holdSeconds = Math.max(holdSeconds, wait);
      }
    }
  }

  /* ------------------------------------------------------------- identity */

  if (on('secureSend')) {
    const above = num(rule('secureSend')!.params.aboveUsd);
    const requireForNew = bool(rule('secureSend')!.params.requireForNew);
    if ((requireForNew && ctx.isNewAddress) || ctx.amountUsd >= above) {
      if (!ctx.secureSendVerified) {
        traces.push(
          trace(
            'secureSend',
            'challenge',
            `Out-of-band verification required: read the fingerprint to the payee over a second channel and confirm they see the same one.`,
            'warn',
            'Complete Secure Send verification.',
          ),
        );
        requiredSteps.add('secureSend');
      }
    }
  }

  if (on('passkeyThreshold')) {
    const above = num(rule('passkeyThreshold')!.params.aboveUsd);
    if (above <= 0 || ctx.amountUsd >= above) {
      traces.push(
        trace(
          'passkeyThreshold',
          'challenge',
          above <= 0
            ? 'Passkey re-authentication is required for every movement at this tier.'
            : `Passkey re-authentication required above $${above.toLocaleString()}.`,
          'info',
        ),
      );
      requiredSteps.add('passkey');
    }
  }

  if (on('shardQuorum')) {
    const m = num(rule('shardQuorum')!.params.m, 2);
    const above = num(rule('shardQuorum')!.params.aboveUsd);
    if (ctx.amountUsd >= above) {
      const n = ctx.shards?.n ?? 3;
      traces.push(
        trace(
          'shardQuorum',
          'quorum',
          `Requires ${m}-of-${n} Horcrux shards${above > 0 ? ` above $${above.toLocaleString()}` : ''}. A single coerced operator cannot move these funds.`,
          'warn',
          `Collect ${m} shards and complete the reconstruction ceremony.`,
        ),
      );
      quorum = { m, n, purpose: above > 0 ? `Spend above $${above.toLocaleString()}` : 'Standing authority' };
      requiredSteps.add('shards');
    }
  }

  if (on('secondDevice')) {
    const above = num(rule('secondDevice')!.params.aboveUsd);
    if (above <= 0 || ctx.amountUsd >= above) {
      traces.push(
        trace(
          'secondDevice',
          'challenge',
          above <= 0
            ? 'A second enrolled device must co-sign every movement at this tier.'
            : `A second enrolled device must co-sign above $${above.toLocaleString()}.`,
          'warn',
        ),
      );
      requiredSteps.add('secondDevice');
    }
  }

  /* ------------------------------------------------------------ approvals */

  if (ctx.approval && on('allowanceHygiene')) {
    const cap = num(rule('allowanceHygiene')!.params.maxApprovalUsd);
    const blockUnlimited = bool(rule('allowanceHygiene')!.params.blockUnlimited);
    if (ctx.approval.unlimited && blockUnlimited) {
      traces.push(
        trace('allowanceHygiene', 'deny', 'Unlimited approvals are blocked by policy. This is the primitive most drainers use.', 'critical', 'Approve an exact amount instead.'),
      );
    } else if (ctx.approval.amountUsd > cap) {
      traces.push(
        trace('allowanceHygiene', 'quorum', `Approval of $${Math.round(ctx.approval.amountUsd).toLocaleString()} exceeds the $${cap.toLocaleString()} cap.`, 'warn', 'Reduce the amount or approve with a shard quorum.'),
      );
      requiredSteps.add('shards');
    }
  }

  /* -------------------------------------------------------------- privacy */

  if (on('privacyFloor')) {
    const minScore = num(rule('privacyFloor')!.params.minScore, 0);
    if (minScore > 0 && ctx.asset.privacyScore >= minScore && ctx.txClass === 'send') {
      traces.push(
        trace(
          'privacyFloor',
          'challenge',
          `${ctx.asset.symbol} sits at privacy score ${ctx.asset.privacyScore}; moving it on a transparent rail publishes the link between these funds and the destination.`,
          'warn',
          'Use the shielded pool, or route through a no-KYC swap if the destination needs a different asset.',
        ),
      );
    }
  }

  /* ----------------------------------------------------------- automation */

  if (ctx.sweepContext && on('autoSweep')) {
    const threshold = num(rule('autoSweep')!.params.thresholdUsd);
    const minIdle = num(rule('autoSweep')!.params.minIdleDays);
    const idle = ctx.sweepIdleDays ?? 0;
    if (ctx.amountUsd < threshold) {
      traces.push(
        trace('autoSweep', 'challenge', `$${Math.round(ctx.amountUsd).toLocaleString()} is below the $${threshold.toLocaleString()} consolidation threshold — sweeping it would cost more in fees and linkage than it protects.`, 'info', 'Raise the threshold or sweep manually.'),
      );
    } else if (idle < minIdle) {
      traces.push(
        trace('autoSweep', 'challenge', `Source has been idle ${idle} days; policy waits ${minIdle} days before consolidating.`, 'info', 'Sweep manually if you are consolidating now.'),
      );
    } else {
      traces.push(trace('autoSweep', 'pass', `Consolidation authorised: $${Math.round(ctx.amountUsd).toLocaleString()} idle ${idle} days, above the $${threshold.toLocaleString()} threshold.`, 'info'));
    }
  }

  /* --------------------------------------------------------- aggregation */

  const worst = traces.reduce<RuleOutcome>(
    (acc, t) => (SEVERITY_ORDER[t.outcome] > SEVERITY_ORDER[acc] ? t.outcome : acc),
    'pass',
  );
  const outcome: DecisionOutcome = worst === 'pass' ? 'allow' : worst;
  const headline = outcome === 'allow' ? OUTCOME_LABEL.allow : headlineFor(outcome, traces);

  return {
    outcome,
    headline,
    traces,
    holdSeconds,
    quorum,
    requiredSteps: [...requiredSteps],
    evaluatedAt: ctx.now,
  };
}

function headlineFor(outcome: DecisionOutcome, traces: RuleTrace[]): string {
  const relevant = traces.filter((t) => t.outcome !== 'pass');
  const top = relevant.find((t) => t.outcome === outcome) ?? relevant[0];
  if (!top) return OUTCOME_LABEL[outcome];
  if (outcome === 'delay' && relevant.some((t) => t.outcome === 'delay')) {
    return `${OUTCOME_LABEL.delay} — ${top.label.toLowerCase()}`;
  }
  return `${OUTCOME_LABEL[outcome]} — ${top.label.toLowerCase()}`;
}

export function formatDuration(seconds: number): string {
  if (seconds <= 0) return 'now';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86_400) {
    const h = Math.floor(seconds / 3600);
    const m = Math.round((seconds % 3600) / 60);
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.floor(seconds / 86_400);
  const h = Math.round((seconds % 86_400) / 3600);
  return h ? `${d}d ${h}h` : `${d}d`;
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** Convenience context for the Policy Studio simulator. */
export function simContext(overrides: Partial<PolicyContext> & { tier: TierId; rules: RuleConfig[] }): PolicyContext {
  const { tier, rules } = overrides;
  const { tier: _t, rules: _r, ...rest } = overrides;
  return {
    tier,
    rules,
    asset: overrides.asset ?? {
      id: 'btc', symbol: 'BTC', name: 'Bitcoin', chain: 'btc', model: 'utxo', decimals: 8,
      priceUsd: 118_420, privacyScore: 25, color: '#f7931a', family: 'bitcoin', path: '', sweepable: true,
    },
    amountUsd: 0,
    amount: 0,
    address: '',
    txClass: 'send',
    isNewAddress: false,
    destinationOwnedByVault: false,
    spent24hUsd: 0,
    txCountLastHour: 0,
    now: Date.now(),
    phishing: cleanVerdict(''),
    secureSendVerified: false,
    duressActive: false,
    frozen: false,
    ...rest,
  };
}
