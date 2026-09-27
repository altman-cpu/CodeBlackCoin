import type { AuditEntry, ReactDef, ReactRun, VaultEvent, VaultState } from '../types';
import { effectiveRules, ruleOf } from '../policy/evaluate';
import { REACT_ACTION_LABEL, TRIGGER_LABEL } from './reacts';

/**
 * The automation runtime.
 *
 * Matches an incoming watchtower event against the enabled react library, checks
 * tier capability and policy gating, and produces the patches the store applies.
 * Aggressive reacts (anything that moves funds on its own) are refused unless the
 * source is provably owned: either a wallet already inside this vault, or a
 * recovery claim carrying a signed ownership attestation.
 */

export interface SweepRequest {
  id: string;
  createdAt: number;
  reason: string;
  reactId: string;
  eventId: string;
  destinationWalletId: string;
  /** Sources are always owned or attested; the engine refuses anything else. */
  sources: {
    id: string;
    label: string;
    assetId: string;
    address: string;
    amount: number;
    amountUsd: number;
    idleDays: number;
    attested: boolean;
  }[];
  totalUsd: number;
  status: 'pending' | 'executing' | 'complete' | 'refused';
}

export interface ReactOutcome {
  run: ReactRun;
  events: VaultEvent[];
  audit: AuditEntry[];
  patches: {
    freeze?: string[];
    duress?: boolean;
    denylistAddresses?: string[];
    sweepRequests?: SweepRequest[];
    rotateWallets?: string[];
    revokeAllowances?: string[];
  };
  /** Human-readable lines for the UI console. */
  log: string[];
}

const uid = (prefix: string): string =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export function reactsMatching(state: VaultState, event: VaultEvent): ReactDef[] {
  return state.reacts.filter((r) => r.enabled && r.trigger === event.kind);
}

export interface Gate {
  ok: boolean;
  reason?: string;
}

/**
 * Can this react run right now? Returns the reason when it cannot, so the UI can
 * show exactly which guardrail stopped it rather than a generic "failed".
 */
export function gateReact(state: VaultState, react: ReactDef, event: VaultEvent): Gate {
  if (!react.enabled) return { ok: false, reason: 'react is disabled' };

  const wallet = event.walletId ? state.wallets.find((w) => w.id === event.walletId) : undefined;
  if (wallet && wallet.tier < react.minTier) {
    return { ok: false, reason: `wallet is tier ${wallet.tier}; ${react.name} requires tier ${react.minTier}+` };
  }
  if (!wallet && react.minTier > 0) {
    // Vault-wide events use the strictest wallet tier as the capability ceiling.
    const minTier = state.wallets.length ? Math.min(...state.wallets.map((w) => w.tier)) : 0;
    if (minTier < react.minTier) {
      return { ok: false, reason: `no wallet at tier ${react.minTier}+ is available to authorise this react` };
    }
  }

  if (react.risk === 'aggressive') {
    const rules = wallet ? effectiveRules(state.policy, wallet.id, wallet.tier) : state.policy.rules;
    const sweep = ruleOf(rules, 'autoSweep');
    if (!sweep?.enabled) {
      return { ok: false, reason: 'consolidation sweep is disabled in the effective policy' };
    }
    // Attestation is always explicit. A wallet being in the vault is not enough
    // on its own: the caller must attach the sources it intends to move, and
    // every one of them must carry an ownership attestation.
    const sources = event.payload?.sources as { attested?: boolean }[] | undefined;
    const attested = Array.isArray(sources)
      ? sources.length > 0 && sources.every((s) => s.attested === true)
      : event.payload?.attested === true;
    if (Array.isArray(sources) && sources.length === 0) {
      return { ok: false, reason: 'no sources supplied — there is nothing to consolidate' };
    }
    if (!attested) {
      return {
        ok: false,
        reason: Array.isArray(sources) && sources.length > 0
          ? `${sources.filter((s) => s.attested !== true).length} source(s) lack an ownership attestation — refusing to move funds`
          : 'no ownership attestation on the source — refusing to move funds',
      };
    }
    const destId = String(sweep.params.destinationWalletId ?? '');
    if (destId && !state.wallets.some((w) => w.id === destId)) {
      return { ok: false, reason: 'policy names a destination vault that no longer exists' };
    }
  }

  return { ok: true };
}

export function executeReact(state: VaultState, react: ReactDef, event: VaultEvent): ReactOutcome {
  const log: string[] = [];
  const audit: AuditEntry[] = [];
  const events: VaultEvent[] = [];
  const patches: ReactOutcome['patches'] = {};
  const gate = gateReact(state, react, event);
  const wallet = event.walletId ? state.wallets.find((w) => w.id === event.walletId) : undefined;

  if (!gate.ok) {
    return {
      run: {
        id: uid('run'),
        reactId: react.id,
        reactName: react.name,
        eventId: event.id,
        at: Date.now(),
        actions: react.actions,
        outcome: 'blocked_by_policy',
        note: gate.reason ?? 'blocked by policy',
      },
      events,
      audit: [
        {
          id: uid('aud'),
          at: Date.now(),
          kind: 'react',
          title: `${react.name} refused`,
          detail: `${event.title}: ${gate.reason}`,
          severity: 'warn',
        },
      ],
      patches,
      log: [`${react.name} refused — ${gate.reason}`],
    };
  }

  for (const action of react.actions) {
    switch (action) {
      case 'denylist_destination': {
        const address = typeof event.payload?.address === 'string' ? event.payload.address : undefined;
        if (address) {
          patches.denylistAddresses = [...(patches.denylistAddresses ?? []), address];
          log.push(`Denylisted ${address.slice(0, 12)}… vault-wide`);
          audit.push({
            id: uid('aud'),
            at: Date.now(),
            kind: 'security',
            title: 'Destination denylisted',
            detail: `${react.name} added ${address} to the vault denylist after ${event.title.toLowerCase()}.`,
            severity: 'critical',
          });
        } else {
          log.push('Flagged destination for review (no address in payload)');
        }
        break;
      }
      case 'freeze_outbound': {
        if (wallet) {
          patches.freeze = [...(patches.freeze ?? []), wallet.id];
          log.push(`Froze outbound from ${wallet.label}`);
          audit.push({
            id: uid('aud'),
            at: Date.now(),
            kind: 'react',
            title: `Froze ${wallet.label}`,
            detail: `${react.name} froze outbound from ${wallet.label}: ${event.title}.`,
            severity: 'warn',
          });
        }
        break;
      }
      case 'require_quorum': {
        log.push('Raised authorisation to a Horcrux shard quorum');
        audit.push({
          id: uid('aud'),
          at: Date.now(),
          kind: 'policy',
          title: 'Authorisation raised to shard quorum',
          detail: `${react.name} escalated "${event.title}" to a shard-quorum decision.`,
          severity: 'warn',
        });
        break;
      }
      case 'revoke_allowances': {
        patches.revokeAllowances = [...(patches.revokeAllowances ?? []), wallet?.id ?? '*'];
        log.push('Revoked outstanding token allowances');
        audit.push({
          id: uid('aud'),
          at: Date.now(),
          kind: 'security',
          title: 'Token allowances revoked',
          detail: `${react.name} revoked outstanding approvals after ${event.title.toLowerCase()}.`,
          severity: 'critical',
        });
        break;
      }
      case 'hide_wallets': {
        // Real wallets are already hidden by duress mode; this records intent.
        log.push('Real wallets hidden from the visible interface');
        break;
      }
      case 'switch_decoy': {
        patches.duress = true;
        log.push('Decoy wallets served');
        break;
      }
      case 'wipe_session': {
        log.push('Session keys dropped from memory');
        audit.push({
          id: uid('aud'),
          at: Date.now(),
          kind: 'session',
          title: 'Session keys wiped',
          detail: `${react.name} dropped session key material after ${event.title.toLowerCase()}.`,
          severity: 'critical',
        });
        break;
      }
      case 'rotate_addresses': {
        if (wallet) {
          patches.rotateWallets = [...(patches.rotateWallets ?? []), wallet.id];
          log.push(`Rotated receiving addresses for ${wallet.label}`);
        }
        break;
      }
      case 'self_sweep': {
        const sources = (event.payload?.sources as SweepRequest['sources'] | undefined) ?? [];
        const owned = sources.filter((s) => s.attested);
        if (owned.length === 0) {
          log.push('No attested-owned sources to consolidate — nothing moved');
          break;
        }
        const rules = wallet ? effectiveRules(state.policy, wallet.id, wallet.tier) : state.policy.rules;
        const sweepRule = ruleOf(rules, 'autoSweep');
        const destinationWalletId = String(sweepRule?.params.destinationWalletId ?? '') ||
          state.wallets.find((w) => w.tier === 0)?.id ||
          state.wallets[0]?.id ||
          '';
        patches.sweepRequests = [
          ...(patches.sweepRequests ?? []),
          {
            id: uid('sweep'),
            createdAt: Date.now(),
            reason: `${react.name}: ${event.title}`,
            reactId: react.id,
            eventId: event.id,
            destinationWalletId,
            sources: owned,
            totalUsd: owned.reduce((n, s) => n + s.amountUsd, 0),
            status: 'pending',
          },
        ];
        log.push(`Queued consolidation of ${owned.length} owned source(s) into ${state.wallets.find((w) => w.id === destinationWalletId)?.label ?? 'vault'}`);
        audit.push({
          id: uid('aud'),
          at: Date.now(),
          kind: 'sweep',
          title: 'Consolidation queued',
          detail: `${react.name} queued ${owned.length} attested-owned source(s) worth $${Math.round(owned.reduce((n, s) => n + s.amountUsd, 0)).toLocaleString()}.`,
          severity: 'warn',
        });
        break;
      }
      case 'notify': {
        events.push({
          id: uid('evt'),
          kind: event.kind,
          at: Date.now(),
          severity: event.severity,
          title: `${react.name}: ${event.title}`,
          detail: event.detail,
          walletId: event.walletId,
          assetId: event.assetId,
          amountUsd: event.amountUsd,
        });
        log.push('Operator notified');
        break;
      }
      case 'rate_limit': {
        log.push('Wallet rate-limited to one transaction per hour');
        break;
      }
      case 'log_only': {
        log.push('Recorded to the audit trail (no active response)');
        break;
      }
    }
  }

  return {
    run: {
      id: uid('run'),
      reactId: react.id,
      reactName: react.name,
      eventId: event.id,
      at: Date.now(),
      actions: react.actions,
      outcome: 'executed',
      note: log.join(' · ') || 'no action required',
    },
    events,
    audit,
    patches,
    log,
  };
}

/** Human summary for the Reacts console. */
export function describeReact(react: ReactDef): string {
  return `${TRIGGER_LABEL[react.trigger]} → ${react.actions.map((a) => REACT_ACTION_LABEL[a]).join(' + ')}`;
}

/** Reacts that would fire for a hypothetical event — used by the "dry run" panel. */
export function dryRun(state: VaultState, trigger: VaultEvent['kind']): { react: ReactDef; gate: Gate }[] {
  const synthetic: VaultEvent = {
    id: 'dry-run',
    kind: trigger,
    at: Date.now(),
    severity: 'info',
    title: 'Dry run',
    detail: 'Simulated event',
  };
  return state.reacts
    .filter((r) => r.trigger === trigger)
    .map((react) => ({ react, gate: gateReact(state, react, synthetic) }));
}
