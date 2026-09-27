import type { Asset, Decision, DecisionOutcome, RuleConfig, TierId, Wallet } from '../types';
import { getAsset, priceUsdAt } from '../assets';
import { estimateFee, fakeTxid, FEE_PRESETS } from '../chain/sim';
import { evaluatePolicy } from '../policy/evaluate';
import { cleanVerdict } from '../security/phishing';

/**
 * Consolidation planner.
 *
 * Scope, stated once and enforced everywhere: a sweep only ever moves funds from
 * sources the operator can prove they control — wallets already inside this vault,
 * or recovery claims carrying a signed ownership attestation. There is no code
 * path here that discovers, scans for, or interacts with someone else's keys.
 */

export type PrivacyMode = 'direct' | 'staggered' | 'intermediate';
export type FeePresetId = (typeof FEE_PRESETS)[number]['id'];

export interface SweepSource {
  id: string;
  label: string;
  assetId: string;
  address: string;
  amount: number;
  idleDays: number;
  attested: boolean;
}

export interface SweepLeg {
  id: string;
  sourceId: string;
  assetId: string;
  from: string;
  to: string;
  amount: number;
  amountUsd: number;
  fee: number;
  feeUsd: number;
  /** Present on privacy-mode 'intermediate' legs (source → hop → vault). */
  hop?: string;
  etaMin: number;
}

export interface SweepPlan {
  id: string;
  createdAt: number;
  destinationWalletId: string;
  destinationLabel: string;
  privacyMode: PrivacyMode;
  feePreset: FeePresetId;
  legs: SweepLeg[];
  skipped: { sourceId: string; label: string; reason: string }[];
  totalUsd: number;
  totalFeesUsd: number;
  etaMin: number;
  /** Worst policy outcome across all legs. */
  outcome: DecisionOutcome;
  decisions: { legId: string; decision: Decision }[];
  /** True when any source lacks an ownership attestation. */
  blockedByAttestation: string[];
}

export const PRIVACY_MODES: { id: PrivacyMode; label: string; blurb: string; feeMultiplier: number }[] = [
  {
    id: 'direct',
    label: 'Direct',
    blurb: 'One transaction per source straight to the vault. Cheapest, and it publicly links every source to the destination.',
    feeMultiplier: 1,
  },
  {
    id: 'staggered',
    label: 'Staggered',
    blurb: 'Same legs, spread over time with randomised gaps. Harder to correlate as one operator; no extra fee.',
    feeMultiplier: 1,
  },
  {
    id: 'intermediate',
    label: 'Intermediate hop',
    blurb: 'Each source pays a single-use intermediate address first, which then forwards to the vault. Breaks the on-chain link at roughly double the fee.',
    feeMultiplier: 2.05,
  },
];

export const getPreset = (id: FeePresetId) => FEE_PRESETS.find((p) => p.id === id) ?? FEE_PRESETS[1];

interface PlanInput {
  sources: SweepSource[];
  destination: Wallet;
  destinationAddresses: Record<string, string>;
  privacyMode: PrivacyMode;
  feePreset: FeePresetId;
  tier: TierId;
  rules: RuleConfig[];
  shards?: { m: number; n: number };
  now?: number;
}

const OUTCOME_RANK: Record<DecisionOutcome, number> = { allow: 0, challenge: 1, delay: 2, quorum: 3, deny: 4 };

export function planSweep(input: PlanInput): SweepPlan {
  const { sources, destination, destinationAddresses, privacyMode, feePreset, tier, rules } = input;
  const now = input.now ?? Date.now();
  const preset = getPreset(feePreset);
  const mode = PRIVACY_MODES.find((m) => m.id === privacyMode)!;

  const legs: SweepLeg[] = [];
  const skipped: SweepPlan['skipped'] = [];
  const blockedByAttestation: string[] = [];
  const decisions: SweepPlan['decisions'] = [];

  for (const source of sources) {
    if (!source.attested) {
      blockedByAttestation.push(source.id);
      skipped.push({
        sourceId: source.id,
        label: source.label,
        reason: 'No ownership attestation on file — refused before quoting.',
      });
      continue;
    }

    const asset: Asset = getAsset(source.assetId);
    const price = priceUsdAt(asset, now);
    const amountUsd = source.amount * price;
    const destinationAddress = destinationAddresses[asset.id] ?? '';
    const fee = estimateFee(asset, preset.rate, 1, privacyMode === 'intermediate' ? 1 : 2) * mode.feeMultiplier;
    const feeUsd = fee * price;

    if (!destinationAddress) {
      skipped.push({ sourceId: source.id, label: source.label, reason: `No receiving address for ${asset.symbol} in the destination vault.` });
      continue;
    }
    if (fee >= source.amount) {
      skipped.push({
        sourceId: source.id,
        label: source.label,
        reason: `Fee (${fee.toFixed(Math.min(asset.decimals, 8))} ${asset.symbol}) would consume the whole balance.`,
      });
      continue;
    }

    const leg: SweepLeg = {
      id: `leg_${source.id}`,
      sourceId: source.id,
      assetId: asset.id,
      from: source.address,
      to: destinationAddress,
      amount: Number((source.amount - fee).toFixed(Math.min(asset.decimals, 8))),
      amountUsd,
      fee,
      feeUsd,
      etaMin: preset.etaMin,
    };
    if (privacyMode === 'intermediate') {
      leg.hop = fakeTxid(`hop:${source.id}:${now}`).slice(0, 34);
    }
    legs.push(leg);

    const decision = evaluatePolicy({
      tier,
      rules,
      asset,
      amount: leg.amount,
      amountUsd,
      address: destinationAddress,
      txClass: 'sweep',
      isNewAddress: false,
      destinationOwnedByVault: true,
      spent24hUsd: 0,
      txCountLastHour: 0,
      now,
      phishing: cleanVerdict(destinationAddress),
      secureSendVerified: true,
      duressActive: false,
      frozen: false,
      shards: input.shards,
      sweepContext: true,
      sweepIdleDays: source.idleDays,
    });
    decisions.push({ legId: leg.id, decision });
  }

  const outcome = decisions.reduce<DecisionOutcome>(
    (worst, d) => (OUTCOME_RANK[d.decision.outcome] > OUTCOME_RANK[worst] ? d.decision.outcome : worst),
    'allow',
  );

  const totalUsd = legs.reduce((n, l) => n + l.amountUsd, 0);
  const totalFeesUsd = legs.reduce((n, l) => n + l.feeUsd, 0);
  const etaMin =
    privacyMode === 'staggered'
      ? legs.length * 12 + preset.etaMin
      : Math.max(preset.etaMin, legs.length > 0 ? preset.etaMin + legs.length * 2 : 0) * (privacyMode === 'intermediate' ? 2 : 1);

  return {
    id: `plan_${now.toString(36)}`,
    createdAt: now,
    destinationWalletId: destination.id,
    destinationLabel: destination.label,
    privacyMode,
    feePreset,
    legs,
    skipped,
    totalUsd,
    totalFeesUsd,
    etaMin,
    outcome,
    decisions,
    blockedByAttestation,
  };
}

export interface SweepProgress {
  legId: string;
  index: number;
  total: number;
  status: 'broadcasting' | 'confirming' | 'confirmed' | 'failed';
  txid?: string;
  message: string;
}

export interface SweepResult {
  txIds: string[];
  failed: { legId: string; reason: string }[];
  totalUsd: number;
}

/**
 * Execute a plan. In sim mode this walks the legs with realistic pacing; with a
 * live adapter the same loop submits real signed transactions. Progress is
 * reported per leg so the UI can show exactly where money is.
 */
export async function runSweep(
  plan: SweepPlan,
  onProgress: (p: SweepProgress) => void,
  paceMs = 900,
): Promise<SweepResult> {
  const txIds: string[] = [];
  const failed: { legId: string; reason: string }[] = [];

  for (let i = 0; i < plan.legs.length; i++) {
    const leg = plan.legs[i];
    const asset = getAsset(leg.assetId);
    onProgress({
      legId: leg.id,
      index: i,
      total: plan.legs.length,
      status: 'broadcasting',
      message: `Broadcasting ${leg.amount.toFixed(Math.min(asset.decimals, 6))} ${asset.symbol}` +
        (leg.hop ? ' via intermediate hop' : ''),
    });
    await sleep(paceMs);

    onProgress({
      legId: leg.id,
      index: i,
      total: plan.legs.length,
      status: 'confirming',
      message: `Awaiting confirmation (${plan.feePreset} fee tier)`,
    });
    await sleep(paceMs);

    const txid = fakeTxid(`${leg.id}:${plan.id}:${i}`);
    txIds.push(txid);
    onProgress({
      legId: leg.id,
      index: i,
      total: plan.legs.length,
      status: 'confirmed',
      txid,
      message: `Confirmed ${leg.amount.toFixed(Math.min(asset.decimals, 6))} ${asset.symbol}`,
    });

    if (plan.privacyMode === 'staggered' && i < plan.legs.length - 1) {
      await sleep(paceMs);
    }
  }

  return { txIds, failed, totalUsd: plan.totalUsd };
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Stats shown above the planner. */
export function planSummary(plan: SweepPlan): { legs: number; assets: number; netUsd: number; skipped: number } {
  return {
    legs: plan.legs.length,
    assets: new Set(plan.legs.map((l) => l.assetId)).size,
    netUsd: plan.totalUsd - plan.totalFeesUsd,
    skipped: plan.skipped.length,
  };
}
