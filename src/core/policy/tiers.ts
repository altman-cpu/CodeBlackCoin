import type { RuleConfig, RuleId, TierId } from '../types';

export interface TierCapability {
  id: string;
  label: string;
}

export interface TierDef {
  id: TierId;
  codename: string;
  name: string;
  blurb: string;
  /** One-line summary of what this tier is for. */
  purpose: string;
  risk: 'defensive' | 'balanced' | 'aggressive';
  color: string;
  capabilities: string[];
  /** Rules that default ON and cannot be disabled at this tier. */
  lockedRules: RuleId[];
  defaultRules: RuleConfig[];
}

const usd = (n: number) => n;

/**
 * Tier 0 is deliberately hostile to spending: it is the deep-cold tier where
 * every movement is a ceremony. Tier 4 is deliberately hostile to *destinations*:
 * it can move fast and aggressively, but only into addresses this vault owns and
 * only with an owner attestation on file. Aggression is aimed at consolidation,
 * never at discovery of other people's keys.
 */
export const TIERS: TierDef[] = [
  {
    id: 0,
    codename: 'GLACIER',
    name: 'Deep Cold',
    blurb: 'Every movement is a ceremony. 48-hour timelock, 2-of-3 shard quorum, second device required.',
    purpose: 'Long-term treasure. Assume you will be coerced, not hacked.',
    risk: 'defensive',
    color: '#5eead4',
    capabilities: ['view', 'receive', 'sign_airgapped'],
    lockedRules: ['timelock', 'shardQuorum', 'secondDevice', 'phishingShield', 'denylist'],
    defaultRules: [
      { id: 'maxPerTx', enabled: true, locked: true, params: { limitUsd: 0 } },
      { id: 'dailyVelocity', enabled: true, locked: true, params: { limitUsd: 0 } },
      { id: 'timelock', enabled: true, locked: true, params: { seconds: 172800, aboveUsd: 0 } },
      { id: 'shardQuorum', enabled: true, locked: true, params: { m: 2, aboveUsd: 0 } },
      { id: 'secondDevice', enabled: true, locked: true, params: { aboveUsd: 0 } },
      { id: 'phishingShield', enabled: true, locked: true, params: { blockHomoglyph: true, blockPoisoning: true, blockUnverifiedContract: true } },
      { id: 'denylist', enabled: true, locked: true, params: { addresses: [] } },
      { id: 'allowlist', enabled: true, params: { addresses: [], requireForLargeUsd: 0 } },
      { id: 'secureSend', enabled: true, params: { requireForNew: true, aboveUsd: 0 } },
      { id: 'duressTrigger', enabled: true, locked: true, params: { freezeMinutes: 1440 } },
      { id: 'privacyFloor', enabled: true, params: { minScore: 40 } },
      { id: 'passkeyThreshold', enabled: true, params: { aboveUsd: 0 } },
      { id: 'newAddressCooldown', enabled: true, params: { minutes: 1440, requirePasskey: true } },
      { id: 'hourlyVelocity', enabled: true, params: { maxTxs: 1 } },
      { id: 'timeWindow', enabled: false, params: { startHour: 13, endHour: 18, enforceAboveUsd: 0 } },
      { id: 'allowanceHygiene', enabled: true, params: { maxApprovalUsd: 0, blockUnlimited: true } },
      { id: 'autoSweep', enabled: false, locked: true, params: { thresholdUsd: 0, minIdleDays: 365, destinationWalletId: '' } },
    ],
  },
  {
    id: 1,
    codename: 'SENTINEL',
    name: 'Guarded',
    blurb: 'Daily spending with hard rails: per-tx and velocity caps, cool-down on new destinations, phishing shield.',
    purpose: 'Everyday custody where mistakes must be cheap.',
    risk: 'defensive',
    color: '#38bdf8',
    capabilities: ['view', 'receive', 'send_capped', 'swap'],
    lockedRules: ['phishingShield', 'denylist'],
    defaultRules: [
      { id: 'maxPerTx', enabled: true, params: { limitUsd: usd(5_000) } },
      { id: 'dailyVelocity', enabled: true, params: { limitUsd: usd(10_000) } },
      { id: 'hourlyVelocity', enabled: true, params: { maxTxs: 3 } },
      { id: 'newAddressCooldown', enabled: true, params: { minutes: 30, requirePasskey: true } },
      { id: 'passkeyThreshold', enabled: true, params: { aboveUsd: usd(1_000) } },
      { id: 'shardQuorum', enabled: true, params: { m: 2, aboveUsd: usd(25_000) } },
      { id: 'phishingShield', enabled: true, locked: true, params: { blockHomoglyph: true, blockPoisoning: true, blockUnverifiedContract: true } },
      { id: 'secureSend', enabled: true, params: { requireForNew: true, aboveUsd: usd(1_000) } },
      { id: 'allowlist', enabled: false, params: { addresses: [], requireForLargeUsd: usd(10_000) } },
      { id: 'denylist', enabled: true, locked: true, params: { addresses: [] } },
      { id: 'timelock', enabled: false, params: { seconds: 900, aboveUsd: usd(25_000) } },
      { id: 'timeWindow', enabled: false, params: { startHour: 13, endHour: 18, enforceAboveUsd: usd(10_000) } },
      { id: 'secondDevice', enabled: false, params: { aboveUsd: usd(50_000) } },
      { id: 'allowanceHygiene', enabled: true, params: { maxApprovalUsd: usd(5_000), blockUnlimited: true } },
      { id: 'privacyFloor', enabled: true, params: { minScore: 30 } },
      { id: 'duressTrigger', enabled: true, params: { freezeMinutes: 720 } },
      { id: 'autoSweep', enabled: false, locked: true, params: { thresholdUsd: usd(1_000), minIdleDays: 180, destinationWalletId: '' } },
    ],
  },
  {
    id: 2,
    codename: 'OPERATOR',
    name: 'Operational',
    blurb: 'Working balance. Higher caps, instant for allowlisted destinations, passkey above the threshold.',
    purpose: 'Money you actually move, with the rails set where you can feel them.',
    risk: 'balanced',
    color: '#a78bfa',
    capabilities: ['view', 'receive', 'send_capped', 'swap', 'allowlist_instant'],
    lockedRules: ['phishingShield', 'denylist'],
    defaultRules: [
      { id: 'maxPerTx', enabled: true, params: { limitUsd: usd(50_000) } },
      { id: 'dailyVelocity', enabled: true, params: { limitUsd: usd(250_000) } },
      { id: 'hourlyVelocity', enabled: true, params: { maxTxs: 10 } },
      { id: 'newAddressCooldown', enabled: true, params: { minutes: 10, requirePasskey: true } },
      { id: 'passkeyThreshold', enabled: true, params: { aboveUsd: usd(10_000) } },
      { id: 'shardQuorum', enabled: true, params: { m: 2, aboveUsd: usd(100_000) } },
      { id: 'phishingShield', enabled: true, locked: true, params: { blockHomoglyph: true, blockPoisoning: true, blockUnverifiedContract: true } },
      { id: 'secureSend', enabled: true, params: { requireForNew: true, aboveUsd: usd(25_000) } },
      { id: 'allowlist', enabled: true, params: { addresses: [], requireForLargeUsd: usd(50_000) } },
      { id: 'denylist', enabled: true, locked: true, params: { addresses: [] } },
      { id: 'timelock', enabled: false, params: { seconds: 600, aboveUsd: usd(100_000) } },
      { id: 'timeWindow', enabled: false, params: { startHour: 6, endHour: 23, enforceAboveUsd: usd(100_000) } },
      { id: 'secondDevice', enabled: false, params: { aboveUsd: usd(250_000) } },
      { id: 'allowanceHygiene', enabled: true, params: { maxApprovalUsd: usd(50_000), blockUnlimited: true } },
      { id: 'privacyFloor', enabled: false, params: { minScore: 20 } },
      { id: 'duressTrigger', enabled: true, params: { freezeMinutes: 480 } },
      { id: 'autoSweep', enabled: false, locked: true, params: { thresholdUsd: usd(5_000), minIdleDays: 90, destinationWalletId: '' } },
    ],
  },
  {
    id: 3,
    codename: 'REACTOR',
    name: 'Automated',
    blurb: 'Policy drives the wallet: auto-consolidation, address rotation, allowance revocation, allowance caps.',
    purpose: 'Defensive automation that reacts faster than you can open a laptop.',
    risk: 'balanced',
    color: '#fbbf24',
    capabilities: ['view', 'receive', 'send_capped', 'swap', 'allowlist_instant', 'automation', 'auto_sweep_owned'],
    lockedRules: ['phishingShield', 'denylist', 'allowanceHygiene'],
    defaultRules: [
      { id: 'maxPerTx', enabled: true, params: { limitUsd: usd(100_000) } },
      { id: 'dailyVelocity', enabled: true, params: { limitUsd: usd(500_000) } },
      { id: 'hourlyVelocity', enabled: true, params: { maxTxs: 25 } },
      { id: 'newAddressCooldown', enabled: true, params: { minutes: 5, requirePasskey: false } },
      { id: 'passkeyThreshold', enabled: true, params: { aboveUsd: usd(50_000) } },
      { id: 'shardQuorum', enabled: true, params: { m: 2, aboveUsd: usd(250_000) } },
      { id: 'phishingShield', enabled: true, locked: true, params: { blockHomoglyph: true, blockPoisoning: true, blockUnverifiedContract: true } },
      { id: 'secureSend', enabled: true, params: { requireForNew: false, aboveUsd: usd(50_000) } },
      { id: 'allowlist', enabled: true, params: { addresses: [], requireForLargeUsd: usd(100_000) } },
      { id: 'denylist', enabled: true, locked: true, params: { addresses: [] } },
      { id: 'timelock', enabled: true, params: { seconds: 300, aboveUsd: usd(250_000) } },
      { id: 'timeWindow', enabled: false, params: { startHour: 0, endHour: 24, enforceAboveUsd: usd(250_000) } },
      { id: 'secondDevice', enabled: false, params: { aboveUsd: usd(500_000) } },
      { id: 'allowanceHygiene', enabled: true, locked: true, params: { maxApprovalUsd: usd(100_000), blockUnlimited: true } },
      { id: 'privacyFloor', enabled: false, params: { minScore: 20 } },
      { id: 'duressTrigger', enabled: true, params: { freezeMinutes: 240 } },
      { id: 'autoSweep', enabled: true, params: { thresholdUsd: usd(5_000), minIdleDays: 90, destinationWalletId: '' } },
    ],
  },
  {
    id: 4,
    codename: 'RECLAIMER',
    name: 'Recovery',
    blurb: 'Aggressive consolidation tier. Moves fast and pays for priority, but only into addresses this vault owns.',
    purpose: 'Reclaim key material you already hold: old devices, paper backups, your own shard sets.',
    risk: 'aggressive',
    color: '#fb7185',
    capabilities: ['view', 'receive', 'send_capped', 'swap', 'automation', 'aggressive_sweep_owned', 'priority_fees'],
    lockedRules: ['phishingShield', 'denylist', 'allowlist', 'secureSend', 'shardQuorum'],
    defaultRules: [
      { id: 'maxPerTx', enabled: true, params: { limitUsd: usd(1_000_000) } },
      { id: 'dailyVelocity', enabled: true, params: { limitUsd: usd(2_500_000) } },
      { id: 'hourlyVelocity', enabled: true, params: { maxTxs: 50 } },
      { id: 'newAddressCooldown', enabled: false, params: { minutes: 0, requirePasskey: false } },
      { id: 'passkeyThreshold', enabled: true, params: { aboveUsd: usd(100_000) } },
      { id: 'shardQuorum', enabled: true, locked: true, params: { m: 2, aboveUsd: usd(50_000) } },
      { id: 'phishingShield', enabled: true, locked: true, params: { blockHomoglyph: true, blockPoisoning: true, blockUnverifiedContract: true } },
      { id: 'secureSend', enabled: true, locked: true, params: { requireForNew: true, aboveUsd: 0 } },
      { id: 'allowlist', enabled: true, locked: true, params: { addresses: [], requireForLargeUsd: 0 } },
      { id: 'denylist', enabled: true, locked: true, params: { addresses: [] } },
      { id: 'timelock', enabled: false, params: { seconds: 60, aboveUsd: usd(500_000) } },
      { id: 'timeWindow', enabled: false, params: { startHour: 0, endHour: 24, enforceAboveUsd: usd(1_000_000) } },
      { id: 'secondDevice', enabled: false, params: { aboveUsd: usd(1_000_000) } },
      { id: 'allowanceHygiene', enabled: true, params: { maxApprovalUsd: usd(250_000), blockUnlimited: true } },
      { id: 'privacyFloor', enabled: false, params: { minScore: 10 } },
      { id: 'duressTrigger', enabled: true, params: { freezeMinutes: 120 } },
      { id: 'autoSweep', enabled: true, params: { thresholdUsd: usd(1_000), minIdleDays: 30, destinationWalletId: '' } },
    ],
  },
];

export const TIER_MAP: Record<TierId, TierDef> = Object.fromEntries(TIERS.map((t) => [t.id, t])) as Record<
  TierId,
  TierDef
>;

export const getTier = (id: TierId): TierDef => TIER_MAP[id] ?? TIER_MAP[1];

export function defaultRulesFor(tier: TierId): RuleConfig[] {
  return getTier(tier).defaultRules.map((r) => ({
    ...r,
    params: { ...r.params },
  }));
}

export const TIER_CAPABILITY_LABELS: Record<string, string> = {
  view: 'View balances',
  receive: 'Receive',
  send_capped: 'Send within caps',
  swap: 'No-KYC swap',
  allowlist_instant: 'Instant send to allowlist',
  automation: 'Run defensive reacts',
  auto_sweep_owned: 'Auto-consolidate your own sources',
  aggressive_sweep_owned: 'Priority-fee consolidation',
  priority_fees: 'Pay priority fees',
  sign_airgapped: 'Air-gapped signing ceremony',
};
