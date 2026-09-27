import type { RuleId } from '../types';

export type ParamType = 'usd' | 'number' | 'minutes' | 'hours' | 'seconds' | 'percent' | 'bool' | 'addresses' | 'wallet';

export interface ParamDef {
  key: string;
  label: string;
  type: ParamType;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  help?: string;
}

export type RuleCategory = 'limits' | 'destination' | 'identity' | 'timing' | 'privacy' | 'automation' | 'duress';

export interface RuleMeta {
  id: RuleId;
  label: string;
  blurb: string;
  category: RuleCategory;
  /** 'defensive' rules protect; 'aggressive' rules let the wallet act hard. */
  risk: 'defensive' | 'neutral' | 'aggressive';
  params: ParamDef[];
}

export const RULE_CATEGORY_LABEL: Record<RuleCategory, string> = {
  limits: 'Spend limits',
  destination: 'Destination control',
  identity: 'Identity & approvals',
  timing: 'Timing',
  privacy: 'Privacy',
  automation: 'Automation',
  duress: 'Duress',
};

export const RULE_META: Record<RuleId, RuleMeta> = {
  maxPerTx: {
    id: 'maxPerTx',
    label: 'Per-transaction ceiling',
    blurb: 'Hard USD ceiling for a single transaction originating from this wallet.',
    category: 'limits',
    risk: 'defensive',
    params: [{ key: 'limitUsd', label: 'Max per transaction', type: 'usd', min: 0, max: 5_000_000, step: 500, help: '0 means every transaction must be approved by higher-order rules.' }],
  },
  dailyVelocity: {
    id: 'dailyVelocity',
    label: 'Daily velocity cap',
    blurb: 'Rolling 24-hour outflow ceiling. Breaching it holds the transaction instead of rejecting it.',
    category: 'limits',
    risk: 'defensive',
    params: [{ key: 'limitUsd', label: 'Max per 24h', type: 'usd', min: 0, max: 10_000_000, step: 1_000 }],
  },
  hourlyVelocity: {
    id: 'hourlyVelocity',
    label: 'Hourly transaction rate',
    blurb: 'Maximum number of outgoing transactions per hour — a brake on drainer scripts.',
    category: 'limits',
    risk: 'defensive',
    params: [{ key: 'maxTxs', label: 'Max transactions/hour', type: 'number', min: 1, max: 200, step: 1 }],
  },
  allowlist: {
    id: 'allowlist',
    label: 'Destination allowlist',
    blurb: 'Addresses this wallet may pay freely. Above the threshold, allowlisting is mandatory.',
    category: 'destination',
    risk: 'defensive',
    params: [
      { key: 'addresses', label: 'Allowlisted addresses', type: 'addresses' },
      { key: 'requireForLargeUsd', label: 'Require allowlist above', type: 'usd', min: 0, max: 5_000_000, step: 1_000, help: '0 = allowlist always required.' },
    ],
  },
  denylist: {
    id: 'denylist',
    label: 'Destination denylist',
    blurb: 'Never send here. Populated automatically by the phishing shield and by you.',
    category: 'destination',
    risk: 'defensive',
    params: [{ key: 'addresses', label: 'Blocked addresses', type: 'addresses' }],
  },
  newAddressCooldown: {
    id: 'newAddressCooldown',
    label: 'First-contact cool-down',
    blurb: 'A destination this vault has never paid waits this long before it can be paid — the single cheapest defence against clipboard hijacking.',
    category: 'timing',
    risk: 'defensive',
    params: [
      { key: 'minutes', label: 'Cool-down', type: 'minutes', min: 0, max: 2880, step: 5 },
      { key: 'requirePasskey', label: 'Require passkey to release early', type: 'bool' },
    ],
  },
  timelock: {
    id: 'timelock',
    label: 'Cancellable time-lock',
    blurb: 'Queue the transaction for N seconds. It stays cancellable the whole time — your window to notice a mistake.',
    category: 'timing',
    risk: 'defensive',
    params: [
      { key: 'seconds', label: 'Hold for', type: 'seconds', min: 0, max: 604_800, step: 60 },
      { key: 'aboveUsd', label: 'Apply above', type: 'usd', min: 0, max: 5_000_000, step: 1_000 },
    ],
  },
  timeWindow: {
    id: 'timeWindow',
    label: 'Signing window',
    blurb: 'Only allow signing inside a UTC window — e.g. your working hours, when you can notice an alert.',
    category: 'timing',
    risk: 'defensive',
    params: [
      { key: 'startHour', label: 'From (UTC hour)', type: 'hours', min: 0, max: 23, step: 1 },
      { key: 'endHour', label: 'Until (UTC hour)', type: 'hours', min: 0, max: 24, step: 1 },
      { key: 'enforceAboveUsd', label: 'Enforce above', type: 'usd', min: 0, max: 5_000_000, step: 1_000 },
    ],
  },
  shardQuorum: {
    id: 'shardQuorum',
    label: 'Horcrux shard quorum',
    blurb: 'Require m-of-n Horcrux shards before signing above the threshold. Turns a coerced operator into a dead end.',
    category: 'identity',
    risk: 'defensive',
    params: [
      { key: 'm', label: 'Shards required', type: 'number', min: 2, max: 9, step: 1 },
      { key: 'aboveUsd', label: 'Require above', type: 'usd', min: 0, max: 5_000_000, step: 1_000 },
    ],
  },
  passkeyThreshold: {
    id: 'passkeyThreshold',
    label: 'Passkey re-authentication',
    blurb: 'Re-authenticate with the platform passkey above this amount.',
    category: 'identity',
    risk: 'defensive',
    params: [{ key: 'aboveUsd', label: 'Require above', type: 'usd', min: 0, max: 5_000_000, step: 500 }],
  },
  secondDevice: {
    id: 'secondDevice',
    label: 'Second-device co-signature',
    blurb: 'Above the threshold, an independently enrolled device must approve.',
    category: 'identity',
    risk: 'defensive',
    params: [{ key: 'aboveUsd', label: 'Require above', type: 'usd', min: 0, max: 5_000_000, step: 1_000 }],
  },
  phishingShield: {
    id: 'phishingShield',
    label: 'Phishing shield',
    blurb: 'Block homoglyph domains, address-poisoning lookalikes and unverified drainer contracts before they reach the signer.',
    category: 'destination',
    risk: 'defensive',
    params: [
      { key: 'blockHomoglyph', label: 'Block homoglyph / punycode destinations', type: 'bool' },
      { key: 'blockPoisoning', label: 'Block address-poisoning lookalikes', type: 'bool' },
      { key: 'blockUnverifiedContract', label: 'Block unverified contract interactions', type: 'bool' },
    ],
  },
  secureSend: {
    id: 'secureSend',
    label: 'Secure Send verification',
    blurb: 'Confirm the destination out-of-band (fingerprint + three words) before signing. Defeats man-in-the-middle address swaps.',
    category: 'identity',
    risk: 'defensive',
    params: [
      { key: 'requireForNew', label: 'Always require for new destinations', type: 'bool' },
      { key: 'aboveUsd', label: 'Require above', type: 'usd', min: 0, max: 5_000_000, step: 500 },
    ],
  },
  duressTrigger: {
    id: 'duressTrigger',
    label: 'Duress response',
    blurb: 'While duress mode is active, real wallets freeze and decoys are served. Silent; nothing is logged to the screen.',
    category: 'duress',
    risk: 'defensive',
    params: [{ key: 'freezeMinutes', label: 'Freeze real wallets for', type: 'minutes', min: 5, max: 10_080, step: 5 }],
  },
  allowanceHygiene: {
    id: 'allowanceHygiene',
    label: 'Token allowance hygiene',
    blurb: 'Cap approvals and refuse unlimited ones — the most common drainer primitive.',
    category: 'destination',
    risk: 'defensive',
    params: [
      { key: 'maxApprovalUsd', label: 'Max approval', type: 'usd', min: 0, max: 5_000_000, step: 500 },
      { key: 'blockUnlimited', label: 'Block unlimited approvals', type: 'bool' },
    ],
  },
  privacyFloor: {
    id: 'privacyFloor',
    label: 'Privacy floor',
    blurb: 'Warn or block movements that materially reduce the privacy of the funds involved (e.g. shielded → transparent).',
    category: 'privacy',
    risk: 'neutral',
    params: [{ key: 'minScore', label: 'Minimum privacy score', type: 'percent', min: 0, max: 100, step: 5 }],
  },
  autoSweep: {
    id: 'autoSweep',
    label: 'Consolidation sweep',
    blurb:
      'Automatically consolidate sources you own (old devices, paper backups, your own shard sets) into this vault once they sit idle. Never touches third-party keys.',
    category: 'automation',
    risk: 'aggressive',
    params: [
      { key: 'thresholdUsd', label: 'Sweep sources above', type: 'usd', min: 0, max: 1_000_000, step: 100 },
      { key: 'minIdleDays', label: 'After idle days', type: 'number', min: 0, max: 2_190, step: 1 },
      { key: 'destinationWalletId', label: 'Destination vault', type: 'wallet' },
    ],
  },
};

export const RULE_ORDER: RuleId[] = [
  'denylist',
  'phishingShield',
  'duressTrigger',
  'maxPerTx',
  'dailyVelocity',
  'hourlyVelocity',
  'allowlist',
  'newAddressCooldown',
  'timelock',
  'timeWindow',
  'secureSend',
  'passkeyThreshold',
  'shardQuorum',
  'secondDevice',
  'allowanceHygiene',
  'privacyFloor',
  'autoSweep',
];
