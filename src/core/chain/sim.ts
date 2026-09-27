import { sha256 } from '@noble/hashes/sha256';
import { hex, utf8ToBytes } from '../keys/encode';
import type { Asset, TriggerKind, VaultEvent } from '../types';

/**
 * Deterministic simulated ledger.
 *
 * The wallet's UI, policy engine and automation are identical whether the
 * balances come from here or from a live adapter — only `getBalance` changes.
 * That is the point: switching `chainMode` to 'live' exercises the same code paths
 * against real chain data.
 */

const hash = (s: string): Uint8Array => sha256(utf8ToBytes(s));

/** Stable 32-bit integer from a string. */
export function seedInt(input: string): number {
  const h = hash(input);
  return ((h[0] << 24) | (h[1] << 16) | (h[2] << 8) | h[3]) >>> 0;
}

/** Deterministic balance in whole units, heavy-tailed so most accounts are small. */
export function simulatedBalance(address: string, asset: Asset): number {
  const s = seedInt(address + asset.id);
  const r1 = (s % 10_000) / 10_000;
  const r2 = ((s >>> 8) % 10_000) / 10_000;
  if (r1 > 0.93) return 0; // most freshly derived accounts are empty
  const magnitude = Math.pow(r2, 3.2); // heavy tail
  const scaleForAsset = asset.priceUsd > 10_000 ? 1.2 : asset.priceUsd > 1_000 ? 12 : asset.priceUsd > 10 ? 180 : 9_000;
  const raw = magnitude * scaleForAsset;
  const decimals = Math.min(asset.decimals, 8);
  return Number(raw.toFixed(decimals));
}

/** UTXO-ish coin set for an account, used by the sweep planner. */
export interface SimUtxo {
  id: string;
  amount: number;
  /** Block height at which it last moved. */
  height: number;
  /** Days since it last moved — drives the "dormant" heuristics. */
  idleDays: number;
}

export function simulatedUtxos(address: string, asset: Asset, total: number): SimUtxo[] {
  const count = Math.max(1, Math.min(9, 1 + (seedInt(address + 'n') % 6)));
  const weights = Array.from({ length: count }, (_, i) => 0.3 + ((seedInt(address + i) % 100) / 100));
  const sum = weights.reduce((a, b) => a + b, 0);
  const decimals = Math.min(asset.decimals, 8);
  return weights.map((w, i) => {
    const amount = Number(((w / sum) * total).toFixed(decimals));
    const idleDays = seedInt(address + 'idle' + i) % 1_500;
    return {
      id: `${address.slice(0, 6)}:${i}`,
      amount,
      height: 900_000 - idleDays * 144,
      idleDays,
    };
  });
}

export function fakeTxid(seedInput: string): string {
  return hex.encode(hash('txid:' + seedInput)).repeat(2).slice(0, 64);
}

/** Fee in whole units of the asset for a given priority (sat/vB style). */
export function estimateFee(asset: Asset, feeRate: number, inputs = 1, outputs = 2): number {
  const vbytes = asset.model === 'utxo' ? 58 + inputs * 68 + outputs * 31 : 21_000 + (outputs - 1) * 12_000;
  const rate = asset.model === 'utxo' ? feeRate : feeRate * 1e-9;
  const fee = (vbytes * rate) / 1e8;
  return Number(fee.toFixed(Math.min(asset.decimals, 8)));
}

export const FEE_PRESETS: { id: 'economy' | 'normal' | 'priority' | 'emergency'; label: string; rate: number; blurb: string; etaMin: number }[] = [
  { id: 'economy', label: 'Economy', rate: 2, blurb: 'Cheapest. May sit for hours.', etaMin: 180 },
  { id: 'normal', label: 'Normal', rate: 8, blurb: 'Next few blocks.', etaMin: 30 },
  { id: 'priority', label: 'Priority', rate: 25, blurb: 'Next block or two.', etaMin: 10 },
  { id: 'emergency', label: 'Emergency', rate: 80, blurb: 'Overpay to get out now. Use when under duress or racing a drainer.', etaMin: 3 },
];

/** Dust threshold: below this, sweeping costs more than it protects. */
export const dustThreshold = (asset: Asset, feeRate: number): number => estimateFee(asset, feeRate) * 3;

/* ------------------------------------------------------------- event feed */

interface EventTemplate {
  kind: TriggerKind;
  severity: VaultEvent['severity'];
  title: string;
  detail: string;
  weight: number;
  amountUsd?: [number, number];
  assetId?: string;
}

/**
 * Background events the watchtower can synthesise in demo mode. They are the
 * adversarial weather the reacts are designed for: poisoning dust, drainer
 * approvals, anomalous outflows, missed heartbeats.
 */
const EVENT_TEMPLATES: EventTemplate[] = [
  {
    kind: 'phishing_detected',
    severity: 'critical',
    title: 'Poisoned address dusted into history',
    detail:
      'An address matching the first 6 and last 4 characters of your most recent payee just sent you 0.000001 BTC. This is address poisoning: the attacker wants their lookalike in your clipboard next time you paste.',
    weight: 3,
    assetId: 'btc',
  },
  {
    kind: 'drainer_approval',
    severity: 'critical',
    title: 'Unlimited approval requested',
    detail: 'A newly seen contract requested an unlimited USDC approval while you were browsing. Signature never reached the signer.',
    weight: 2,
    assetId: 'usdc',
  },
  {
    kind: 'large_outflow',
    severity: 'warn',
    title: 'Outflow above the notify threshold',
    detail: 'A transaction above your notification threshold left an operational wallet. Confirm it was you.',
    weight: 2,
    amountUsd: [8_000, 40_000],
  },
  {
    kind: 'balance_anomaly',
    severity: 'warn',
    title: 'Balance moved without a local signature',
    detail: 'An account balance changed with no transaction signed by this device. Check for a second signing key you forgot, or a compromised one you did not.',
    weight: 2,
  },
  {
    kind: 'new_device',
    severity: 'warn',
    title: 'Unrecognised device requested vault state',
    detail: 'A device with no attestation attempted to restore this vault. Restoration was refused; the attempt is logged.',
    weight: 1,
  },
  {
    kind: 'key_exposure',
    severity: 'critical',
    title: 'Key material may be exposed',
    detail: 'A mnemonic-backed wallet has been online and unlocked for an extended session. Consider consolidating into a fresh, passkey-backed vault.',
    weight: 1,
  },
  {
    kind: 'heartbeat_missed',
    severity: 'info',
    title: 'Inheritance heartbeat due',
    detail: 'Your Horcrux inheritance plan expects a heartbeat. Missing it does not move funds — it only starts the claim clock.',
    weight: 2,
  },
  {
    kind: 'dormant_breach',
    severity: 'info',
    title: 'Owned source crossed the dormancy threshold',
    detail: 'A source you attested ownership of has sat idle past the consolidation threshold on its tier.',
    weight: 2,
  },
  {
    kind: 'inbound_to_decoy',
    severity: 'info',
    title: 'Funds arrived at a decoy address',
    detail: 'A decoy wallet received funds. Decoys are funded on purpose; they are what a coerced operator will hand over.',
    weight: 1,
  },
];

let eventCounter = 0;

export function nextSimEvent(now = Date.now(), wallets: { id: string; label: string }[] = []): VaultEvent {
  const total = EVENT_TEMPLATES.reduce((n, t) => n + t.weight, 0);
  let pick = seedInt(`event:${now}:${eventCounter}`) % total;
  eventCounter++;
  let template = EVENT_TEMPLATES[0];
  for (const t of EVENT_TEMPLATES) {
    if (pick < t.weight) {
      template = t;
      break;
    }
    pick -= t.weight;
  }
  const range = template.amountUsd;
  const amountUsd = range ? Math.round(range[0] + ((seedInt(`amt:${now}:${eventCounter}`) % 1000) / 1000) * (range[1] - range[0])) : undefined;
  return {
    id: `evt_${now.toString(36)}_${eventCounter}`,
    kind: template.kind,
    at: now,
    severity: template.severity,
    title: template.title,
    detail: template.detail,
    amountUsd,
    assetId: template.assetId,
    walletId: wallets.length ? wallets[seedInt(`w:${now}`) % wallets.length].id : undefined,
  };
}
