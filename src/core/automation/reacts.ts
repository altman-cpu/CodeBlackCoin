import type { ReactAction, ReactDef, TierId, TriggerKind } from '../types';

export const REACT_ACTION_LABEL: Record<ReactAction, string> = {
  freeze_outbound: 'Freeze outbound',
  require_quorum: 'Require shard quorum',
  notify: 'Notify operator',
  self_sweep: 'Consolidate owned sources',
  hide_wallets: 'Hide real wallets',
  switch_decoy: 'Serve decoy wallets',
  revoke_allowances: 'Revoke token allowances',
  rotate_addresses: 'Rotate receiving addresses',
  rate_limit: 'Rate-limit the wallet',
  wipe_session: 'Wipe session keys',
  denylist_destination: 'Denylist the destination',
  log_only: 'Log only',
};

export const TRIGGER_LABEL: Record<TriggerKind, string> = {
  phishing_detected: 'Phishing / poisoning detected',
  duress_unlock: 'Duress unlock',
  large_outflow: 'Large outflow',
  new_device: 'Unrecognised device',
  drainer_approval: 'Drainer-style approval',
  dormant_breach: 'Owned source went dormant',
  heartbeat_missed: 'Inheritance heartbeat missed',
  key_exposure: 'Key exposure suspected',
  inbound_to_decoy: 'Inbound to a decoy',
  balance_anomaly: 'Balance anomaly',
  sweep_requested: 'Sweep requested',
};

interface ReactSpec extends Omit<ReactDef, 'runCount' | 'lastRun'> {
  /** Which tier capability unlocks this react, stated in words. */
  gating: string;
}

/**
 * The react library.
 *
 * Defensive reacts are available to every tier — freezing your own wallet in a
 * hurry costs nothing and saves everything. Aggressive reacts (anything that
 * moves funds unattended) are gated to tier 3+, require the automation
 * capability, and still stop dead without an ownership attestation.
 */
export const REACT_SPECS: ReactSpec[] = [
  {
    id: 'phantom-lock',
    name: 'PHANTOM LOCK',
    description:
      'When the phishing shield flags a destination, denylist it vault-wide and tell the operator. Catches poisoning lookalikes the moment they appear in history.',
    trigger: 'phishing_detected',
    actions: ['denylist_destination', 'notify'],
    enabled: true,
    minTier: 0,
    risk: 'defensive',
    gating: 'Available on every tier',
  },
  {
    id: 'drainer-break',
    name: 'DRAINER BREAK',
    description:
      'A drainer-style approval request revokes outstanding allowances and freezes the wallet pending review. The most common loss in crypto is an unlimited approval, not a stolen seed.',
    trigger: 'drainer_approval',
    actions: ['revoke_allowances', 'freeze_outbound', 'notify'],
    enabled: true,
    minTier: 0,
    risk: 'defensive',
    gating: 'Available on every tier',
  },
  {
    id: 'sentinel-watch',
    name: 'SENTINEL WATCH',
    description: 'A balance that moves without a local signature freezes the wallet until a human says otherwise.',
    trigger: 'balance_anomaly',
    actions: ['freeze_outbound', 'notify'],
    enabled: true,
    minTier: 0,
    risk: 'defensive',
    gating: 'Available on every tier',
  },
  {
    id: 'quiet-hours',
    name: 'QUIET HOURS',
    description: 'Large outflows are held for shard-quorum approval rather than rejected: slow is survivable, irreversible is not.',
    trigger: 'large_outflow',
    actions: ['require_quorum', 'notify'],
    enabled: true,
    minTier: 0,
    risk: 'defensive',
    gating: 'Available on every tier',
  },
  {
    id: 'ghost-shell',
    name: 'GHOST SHELL',
    description:
      'Duress unlock hides real wallets, serves decoys, and drops session keys. Nothing about the switch is written to the visible screen.',
    trigger: 'duress_unlock',
    actions: ['hide_wallets', 'switch_decoy', 'wipe_session', 'log_only'],
    enabled: true,
    minTier: 0,
    risk: 'defensive',
    gating: 'Available on every tier',
  },
  {
    id: 'stranger-deny',
    name: 'STRANGER DENY',
    description: 'An unattested device asking for vault state raises the bar to a shard quorum instead of refusing outright — so an attacker learns nothing and you are never locked out by a lost device.',
    trigger: 'new_device',
    actions: ['require_quorum', 'notify'],
    enabled: true,
    minTier: 1,
    risk: 'defensive',
    gating: 'Tier 1 and above',
  },
  {
    id: 'dead-man',
    name: 'DEAD MAN',
    description:
      'Missed inheritance heartbeat starts the claim clock and notifies beneficiaries. Funds never move without the shard quorum and the timelock.',
    trigger: 'heartbeat_missed',
    actions: ['notify', 'log_only'],
    enabled: true,
    minTier: 0,
    risk: 'neutral',
    gating: 'Available on every tier',
  },
  {
    id: 'dust-collector',
    name: 'DUST COLLECTOR',
    description: 'Funds arriving at a decoy are logged and left alone. Never sweep a decoy: it may be watched.',
    trigger: 'inbound_to_decoy',
    actions: ['log_only'],
    enabled: true,
    minTier: 0,
    risk: 'defensive',
    gating: 'Available on every tier',
  },
  {
    id: 'exposure-rotate',
    name: 'EXPOSURE ROTATE',
    description:
      'Suspected key exposure consolidates attested-owned sources into the destination vault and rotates receiving addresses. Aggressive: it moves funds without asking.',
    trigger: 'key_exposure',
    actions: ['self_sweep', 'rotate_addresses', 'notify'],
    enabled: false,
    minTier: 3,
    risk: 'aggressive',
    gating: 'Tier 3+ · automation capability · ownership attestation required',
  },
  {
    id: 'dormant-reclaim',
    name: 'DORMANT RECLAIM',
    description:
      'Consolidates sources you own that have sat idle past the tier threshold — old devices, paper backups, your own shard sets. Never scans for, and never touches, keys you do not own.',
    trigger: 'dormant_breach',
    actions: ['self_sweep', 'notify'],
    enabled: false,
    minTier: 3,
    risk: 'aggressive',
    gating: 'Tier 3+ · automation capability · ownership attestation required',
  },
];

export function defaultReacts(): ReactDef[] {
  return REACT_SPECS.map(({ gating: _gating, ...rest }) => ({ ...rest, runCount: 0 }));
}

export function reactsFor(tier: TierId): ReactDef[] {
  return defaultReacts().filter((r) => r.minTier <= tier);
}
