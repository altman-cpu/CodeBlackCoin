import type { Asset, Horcrux, Shard } from '../types';
import { combineShares, decodeShare, encodeShare, shareChecksum, splitSecret } from '../crypto/shamir';
import { deriveAddress, mnemonicToSeed, validateMnemonic } from '../keys/derive';
import { ASSETS } from '../assets';

/**
 * Horcrux: split a secret into shards so that no single location, custodian or
 * moment of coercion can compromise it, and so that your heirs can still get in
 * when you are not there to let them.
 *
 * What a Horcrux protects: your mnemonic, your vault backup, your recovery key.
 * What it never does: give anyone a way into somebody else's money.
 */

export interface Custodian {
  name: string;
  location: string;
}

export interface CreateHorcruxInput {
  label: string;
  purpose: Horcrux['purpose'];
  secret: Uint8Array;
  m: number;
  n: number;
  custodians: Custodian[];
  timelockDays: number;
  beneficiaries?: { name: string; sharePct: number; contact: string }[];
}

export function createHorcrux(input: CreateHorcruxInput): Horcrux {
  const { secret, m, n, custodians } = input;
  if (m > n) throw new Error('threshold cannot exceed the number of shards');
  if (custodians.length !== n) throw new Error('every shard needs a custodian');

  const shares = splitSecret(secret, n, m);
  const shards: Shard[] = shares.map((share, i) => {
    const encoded = encodeShare(share);
    return {
      index: share.index,
      hex: encoded,
      custodian: custodians[i].name,
      location: custodians[i].location,
      checksum: shareChecksum(encoded),
    };
  });

  return {
    id: `hx_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    label: input.label,
    purpose: input.purpose,
    m,
    n,
    shards,
    createdAt: Date.now(),
    timelockDays: input.timelockDays,
    lastHeartbeat: Date.now(),
    beneficiaries: input.beneficiaries ?? [],
  };
}

/** Reconstruct the secret from m shards. Throws if the shards are malformed. */
export function reconstructSecret(encodedShards: string[]): Uint8Array {
  if (encodedShards.length < 2) throw new Error('at least two shards are required');
  return combineShares(encodedShards.map(decodeShare));
}

export function verifyShard(encoded: string, expectedChecksum?: string): { ok: boolean; reason?: string } {
  try {
    const share = decodeShare(encoded);
    if (share.index < 1) return { ok: false, reason: 'shard index is invalid' };
    const checksum = shareChecksum(encoded.trim());
    if (expectedChecksum && checksum !== expectedChecksum) {
      return { ok: false, reason: `checksum ${checksum} does not match the recorded ${expectedChecksum}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'unreadable shard' };
  }
}

export const HEARTBEAT_INTERVAL_DAYS = 90;

export function heartbeatDue(h: Horcrux, now = Date.now()): boolean {
  return now - h.lastHeartbeat > HEARTBEAT_INTERVAL_DAYS * 86_400_000;
}

export function daysSinceHeartbeat(h: Horcrux, now = Date.now()): number {
  return Math.floor((now - h.lastHeartbeat) / 86_400_000);
}

/** When beneficiaries may open a claim: heartbeat overdue + timelock elapsed. */
export function claimOpensAt(h: Horcrux): number {
  return h.lastHeartbeat + (HEARTBEAT_INTERVAL_DAYS + h.timelockDays) * 86_400_000;
}

export function claimStatus(h: Horcrux, now = Date.now()): { label: string; tone: 'ok' | 'warn' | 'critical'; opensInDays: number } {
  const opensAt = claimOpensAt(h);
  const opensInDays = Math.ceil((opensAt - now) / 86_400_000);
  if (opensInDays <= 0) return { label: 'Claim window open', tone: 'critical', opensInDays: 0 };
  if (opensInDays < 30) return { label: `Opens in ${opensInDays} days`, tone: 'warn', opensInDays };
  return { label: `Opens in ${opensInDays} days`, tone: 'ok', opensInDays };
}

/* --------------------------------------------------------- recovery scan */

export interface Finding {
  assetId: string;
  address: string;
  amount: number;
  amountUsd: number;
  hdPath: string;
  /** False when the wallet has no derivation for this asset — never deposit there. */
  derivable: boolean;
}

export interface ScanResult {
  findings: Finding[];
  totalUsd: number;
  scanned: number;
  /** Input was not a valid BIP-39 mnemonic. */
  invalidMnemonic: boolean;
}

/**
 * Read-only scan of key material the operator already possesses.
 *
 * This derives addresses and asks the chain adapter for balances. It never signs,
 * never broadcasts, and never guesses: there is no brute-force, no dictionary, no
 * scanning of key space. If the operator does not hold the secret, nothing here
 * helps them — by design.
 */
export async function scanKeyMaterial(
  mnemonic: string,
  assetIds: string[],
  getBalance: (asset: Asset, address: string) => Promise<{ amount: number; amountUsd: number }>,
  addressesPerAsset = 3,
): Promise<ScanResult> {
  const trimmed = mnemonic.trim().replace(/\s+/g, ' ');
  if (!validateMnemonic(trimmed)) {
    return { findings: [], totalUsd: 0, scanned: 0, invalidMnemonic: true };
  }
  const seed = mnemonicToSeed(trimmed);
  const findings: Finding[] = [];
  let scanned = 0;

  for (const id of assetIds) {
    const asset = ASSETS.find((a) => a.id === id);
    if (!asset) continue;
    for (let i = 0; i < addressesPerAsset; i++) {
      const derived = deriveAddress(asset, seed, i);
      scanned++;
      if (!derived.verified) {
        findings.push({ assetId: asset.id, address: derived.address, amount: 0, amountUsd: 0, hdPath: derived.hdPath, derivable: false });
        continue;
      }
      const bal = await getBalance(asset, derived.address);
      if (bal.amount > 0) {
        findings.push({
          assetId: asset.id,
          address: derived.address,
          amount: bal.amount,
          amountUsd: bal.amountUsd,
          hdPath: derived.hdPath,
          derivable: true,
        });
      }
    }
  }

  return {
    findings: findings.filter((f) => f.amount > 0 || !f.derivable),
    totalUsd: findings.reduce((n, f) => n + f.amountUsd, 0),
    scanned,
    invalidMnemonic: false,
  };
}
