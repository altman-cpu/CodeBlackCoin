import { describe, expect, it } from 'vitest';
import { evaluatePolicy, effectiveRules, formatDuration, secondsUntilWindow, simContext } from './evaluate';
import { defaultRulesFor, getTier } from './tiers';
import { cleanVerdict } from '../security/phishing';
import { getAsset } from '../assets';
import type { Policy, RuleConfig, RuleId } from '../types';

const BTC = getAsset('btc');
const XMR = getAsset('xmr');
const NOW = Date.UTC(2026, 8, 26, 2, 15); // 02:15 UTC — outside a 13:00–18:00 window


const policyOf = (tier: 0 | 1 | 2 | 3 | 4, overrides: Partial<Record<RuleId, Partial<RuleConfig>>> = {}): Policy => {
  const rules = defaultRulesFor(tier).map((r) => {
    const o = overrides[r.id];
    return o ? { ...r, ...o, params: { ...r.params, ...(o.params ?? {}) } } : r;
  });
  return { tier, rules, overrides: {}, updatedAt: NOW };
};

const ctx = (
  policy: Policy,
  extra: Partial<Parameters<typeof simContext>[0]> = {},
): ReturnType<typeof simContext> =>
  simContext({
    tier: policy.tier,
    rules: policy.rules,
    asset: BTC,
    amountUsd: 1_000,
    amount: 0.008,
    address: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
    isNewAddress: true,
    now: NOW,
    ...extra,
  });

describe('tier defaults', () => {
  it('gives every tier a coherent, non-empty rule set', () => {
    for (const tier of [0, 1, 2, 3, 4] as const) {
      const def = getTier(tier);
      expect(def.defaultRules.length).toBeGreaterThan(8);
      expect(def.name.length).toBeGreaterThan(0);
      for (const locked of def.lockedRules) {
        const rule = def.defaultRules.find((r) => r.id === locked);
        expect(rule, `${def.codename} locks ${locked} but does not define it`).toBeTruthy();
        expect(rule!.locked, `${def.codename}/${locked} should be marked locked`).toBe(true);
      }
    }
  });

  it('keeps consolidation switched off and locked for the cold tiers', () => {
    for (const tier of [0, 1, 2] as const) {
      const sweep = defaultRulesFor(tier).find((r) => r.id === 'autoSweep')!;
      expect(sweep.enabled).toBe(false);
      expect(sweep.locked).toBe(true);
    }
    expect(defaultRulesFor(3).find((r) => r.id === 'autoSweep')!.enabled).toBe(true);
  });

  it('locks destination control on for the aggressive tier', () => {
    const t4 = getTier(4);
    expect(t4.lockedRules).toContain('allowlist');
    expect(t4.lockedRules).toContain('secureSend');
    expect(t4.lockedRules).toContain('shardQuorum');
  });
});

describe('policy evaluation', () => {
  it('allows a small payment to a known, clean destination on tier 2', () => {
    const d = evaluatePolicy(ctx(policyOf(2), { isNewAddress: false, secureSendVerified: true, amountUsd: 500 }));
    expect(d.outcome).toBe('allow');
    expect(d.holdSeconds).toBe(0);
    expect(d.requiredSteps).toEqual([]);
  });

  it('holds first-contact payments for the cool-down window', () => {
    const d = evaluatePolicy(ctx(policyOf(1), { amountUsd: 500 }));
    expect(d.outcome).toBe('delay');
    expect(d.holdSeconds).toBe(30 * 60);
    expect(d.requiredSteps).toContain('secureSend');
    expect(d.requiredSteps).toContain('passkey');
  });

  it('denies spend above the per-transaction ceiling when no shard set exists', () => {
    const d = evaluatePolicy(ctx(policyOf(1), { amountUsd: 6_000, isNewAddress: false, secureSendVerified: true }));
    expect(d.outcome).toBe('deny');
    expect(d.traces.some((t) => t.ruleId === 'maxPerTx')).toBe(true);
  });

  it('escalates an over-ceiling spend to a shard quorum when shards exist', () => {
    const d = evaluatePolicy(
      ctx(policyOf(1), { amountUsd: 6_000, isNewAddress: false, secureSendVerified: true, shards: { m: 2, n: 3 } }),
    );
    expect(d.outcome).toBe('quorum');
    expect(d.quorum?.m).toBe(2);
    expect(d.requiredSteps).toContain('shards');
  });

  it('treats any movement from tier 0 as a quorum-approved ceremony with a long hold', () => {
    const d = evaluatePolicy(ctx(policyOf(0), { amountUsd: 100, shards: { m: 2, n: 3 } }));
    expect(d.outcome).toBe('quorum');
    expect(d.holdSeconds).toBe(48 * 3600);
    expect(d.requiredSteps).toContain('secondDevice');
  });

  it('blocks denylisted destinations outright', () => {
    const addr = 'bc1qdenylisted00000000000000000000000000000';
    const d = evaluatePolicy(
      ctx(policyOf(2, { denylist: { params: { addresses: [addr] } } }), {
        address: addr,
        isNewAddress: false,
        secureSendVerified: true,
      }),
    );
    expect(d.outcome).toBe('deny');
    expect(d.headline).toMatch(/Blocked by policy/);
  });

  it('blocks a destination flagged dangerous by the phishing shield', () => {
    const d = evaluatePolicy(
      ctx(policyOf(2), {
        isNewAddress: false,
        secureSendVerified: true,
        phishing: {
          level: 'dangerous',
          score: 90,
          findings: [
            { code: 'poisoning', label: 'Address-poisoning lookalike', detail: 'Matches the head and tail of a recent payee.', severity: 'critical' },
          ],
          recommendation: 'Do not send.',
          fingerprint: 'ABC123',
          words: 'ka-mar-ith',
        },
      }),
    );
    expect(d.outcome).toBe('deny');
    expect(d.traces.find((t) => t.ruleId === 'phishingShield')?.severity).toBe('critical');
  });

  it('freezes everything while duress mode is active', () => {
    const d = evaluatePolicy(ctx(policyOf(2), { duressActive: true, isNewAddress: false, secureSendVerified: true }));
    expect(d.outcome).toBe('deny');
    expect(d.traces.some((t) => t.ruleId === 'duressTrigger')).toBe(true);
  });

  it('short-circuits when a react has frozen the wallet', () => {
    const d = evaluatePolicy(ctx(policyOf(2), { frozen: true, isNewAddress: false, secureSendVerified: true }));
    expect(d.outcome).toBe('deny');
    expect(d.headline).toMatch(/frozen/i);
  });

  it('refuses unlimited token approvals', () => {
    const d = evaluatePolicy(
      ctx(policyOf(2), {
        isNewAddress: false,
        secureSendVerified: true,
        approval: { spender: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef', unlimited: true, amountUsd: 999_999 },
      }),
    );
    expect(d.outcome).toBe('deny');
    expect(d.traces.some((t) => t.ruleId === 'allowanceHygiene')).toBe(true);
  });

  it('enforces the signing window and computes the wait', () => {
    const d = evaluatePolicy(
      ctx(policyOf(2, { timeWindow: { enabled: true, params: { startHour: 13, endHour: 18, enforceAboveUsd: 0 } } }), {
        isNewAddress: false,
        secureSendVerified: true,
        now: NOW,
      }),
    );
    expect(d.outcome).toBe('delay');
    // 02:15 UTC -> opens at 13:00 UTC
    expect(d.holdSeconds).toBeGreaterThan(10 * 3600);
    expect(d.holdSeconds).toBeLessThan(11 * 3600);
  });

  it('does not hold when already inside the signing window', () => {
    const inside = Date.UTC(2026, 8, 26, 14, 0);
    const d = evaluatePolicy(
      ctx(policyOf(2, { timeWindow: { enabled: true, params: { startHour: 13, endHour: 18, enforceAboveUsd: 0 } } }), {
        isNewAddress: false,
        secureSendVerified: true,
        now: inside,
      }),
    );
    expect(d.traces.some((t) => t.ruleId === 'timeWindow')).toBe(false);
  });

  it('requires shard quorum above the tier-2 threshold', () => {
    const d = evaluatePolicy(
      ctx(policyOf(2), { amountUsd: 150_000, isNewAddress: false, secureSendVerified: true, shards: { m: 2, n: 3 } }),
    );
    expect(d.outcome).toBe('quorum');
    expect(d.quorum?.purpose).toMatch(/100,000/);
    expect(d.quorum?.m).toBe(2);
  });

  it('warns when a privacy coin leaves the shielded world', () => {
    const d = evaluatePolicy(
      ctx(policyOf(1), { asset: XMR, amountUsd: 500, isNewAddress: false, secureSendVerified: true }),
    );
    expect(d.traces.some((t) => t.ruleId === 'privacyFloor')).toBe(true);
  });

  it('gates consolidation on threshold and idle time', () => {
    const policy = policyOf(3);
    const belowThreshold = evaluatePolicy(
      ctx(policy, { sweepContext: true, amountUsd: 100, sweepIdleDays: 200, isNewAddress: false, secureSendVerified: true }),
    );
    expect(belowThreshold.traces.find((t) => t.ruleId === 'autoSweep')?.outcome).toBe('challenge');

    const tooFresh = evaluatePolicy(
      ctx(policy, { sweepContext: true, amountUsd: 50_000, sweepIdleDays: 10, isNewAddress: false, secureSendVerified: true }),
    );
    expect(tooFresh.traces.find((t) => t.ruleId === 'autoSweep')?.outcome).toBe('challenge');

    const ok = evaluatePolicy(
      ctx(policy, { sweepContext: true, amountUsd: 50_000, sweepIdleDays: 200, isNewAddress: false, secureSendVerified: true }),
    );
    expect(ok.traces.find((t) => t.ruleId === 'autoSweep')?.outcome).toBe('pass');
  });

  it('is deterministic — replaying a recorded decision reproduces it', () => {
    const c = ctx(policyOf(1), { amountUsd: 2_500 });
    const a = evaluatePolicy(c);
    const b = evaluatePolicy({ ...c, now: c.now });
    expect(JSON.stringify(a.traces)).toBe(JSON.stringify(b.traces));
  });
});

describe('helpers', () => {
  it('merges per-wallet overrides over the tier defaults', () => {
    const policy: Policy = {
      tier: 2,
      rules: defaultRulesFor(2),
      overrides: {
        'wallet-1': [{ id: 'maxPerTx', enabled: true, params: { limitUsd: 123 } }],
      },
      updatedAt: NOW,
    };
    const merged = effectiveRules(policy, 'wallet-1');
    expect(merged.find((r) => r.id === 'maxPerTx')!.params.limitUsd).toBe(123);
    expect(effectiveRules(policy, 'wallet-2').find((r) => r.id === 'maxPerTx')!.params.limitUsd).toBe(50_000);
  });

  it('formats durations for humans', () => {
    expect(formatDuration(0)).toBe('now');
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(1_800)).toBe('30m');
    expect(formatDuration(3_600)).toBe('1h');
    expect(formatDuration(5_400)).toBe('1h 30m');
    expect(formatDuration(2 * 86_400)).toBe('2d');
  });

  it('computes window waits across midnight', () => {
    const at = Date.UTC(2026, 8, 26, 22, 0); // 22:00 UTC -> next opening 13:00 UTC = 15h
    expect(secondsUntilWindow(at, 13, 18)).toBe(15 * 3600);
    // wrapping window 22:00 -> 06:00 is open at 23:00 and closed at 12:00
    expect(secondsUntilWindow(Date.UTC(2026, 8, 26, 23, 0), 22, 6)).toBe(0);
    expect(secondsUntilWindow(Date.UTC(2026, 8, 26, 12, 0), 22, 6)).toBeGreaterThan(9 * 3600);
    expect(secondsUntilWindow(Date.UTC(2026, 8, 26, 15, 0), 13, 18)).toBe(0);
  });

  it('clean verdicts never block', () => {
    const d = evaluatePolicy(ctx(policyOf(2), { isNewAddress: false, secureSendVerified: true, phishing: cleanVerdict('bc1qtest') }));
    expect(d.outcome).toBe('allow');
  });
});
