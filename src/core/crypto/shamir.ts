import { sha256 } from '@noble/hashes/sha256';
import { randomBytes } from '@noble/hashes/utils';
import { hex } from '../keys/encode';

/**
 * Shamir Secret Sharing over GF(256) — the primitive behind Horcrux shards.
 *
 * Layout of a shard: [ 1 byte index ][ secret-length bytes of share data ]
 * The human-facing `checksum` is sha256(shard)[0..1] so a custodian can eyeball
 * that a printed shard was transcribed correctly. It is NOT authentication:
 * anyone holding m shards can reconstruct, by design.
 *
 * Not constant-time: shares are public-by-construction once distributed, so the
 * usual side-channel requirements do not apply to the share arithmetic.
 */

const PRIM = 0x11b; // AES polynomial x^8 + x^4 + x^3 + x + 1

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);

/** Multiply by the field element 0x02 with reduction (AES `xtime`). */
const xtime = (a: number): number => {
  let v = a << 1;
  if (v & 0x100) v ^= PRIM;
  return v & 0xff;
};

(() => {
  // 0x02 has multiplicative order 51 in this field; 0x03 is primitive (order 255),
  // which is what makes LOG a bijection and the log/exp tables sound.
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x = xtime(x) ^ x; // multiply by the generator 0x03
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

const gmul = (a: number, b: number): number => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

/** Invert via the log table: a^-1 = g^(255 - log a). */
const gdiv = (a: number, b: number): number => {
  if (b === 0) throw new Error('division by zero in GF(256)');
  return a === 0 ? 0 : EXP[(LOG[a] + 255 - LOG[b]) % 255];
};

export interface ShamirShare {
  index: number;
  data: Uint8Array;
}

/** Evaluate the polynomial for one byte of the secret at point x. */
function evalPoly(coeffs: number[], x: number): number {
  // Horner's method in GF(256)
  let y = coeffs[coeffs.length - 1];
  for (let i = coeffs.length - 2; i >= 0; i--) {
    y = gmul(y, x) ^ coeffs[i];
  }
  return y;
}

export function splitSecret(
  secret: Uint8Array,
  shares: number,
  threshold: number,
  rng: (len: number) => Uint8Array = randomBytes,
): ShamirShare[] {
  if (threshold < 2) throw new Error('threshold must be at least 2');
  if (shares < threshold) throw new Error('cannot create fewer shares than the threshold');
  if (shares > 254) throw new Error('at most 254 shares are addressable in GF(256)');
  if (secret.length === 0) throw new Error('secret is empty');

  const out: ShamirShare[] = [];
  for (let i = 1; i <= shares; i++) out.push({ index: i, data: new Uint8Array(secret.length) });

  for (let b = 0; b < secret.length; b++) {
    // coeffs[0] is the secret byte, the rest are random (never zero-fill).
    const coeffs = new Array<number>(threshold);
    coeffs[0] = secret[b];
    const rnd = rng(threshold - 1);
    for (let c = 1; c < threshold; c++) coeffs[c] = rnd[c - 1];
    // Guarantee the leading coefficient is non-zero so the degree is exact.
    if (coeffs[threshold - 1] === 0) coeffs[threshold - 1] = 1;

    for (let i = 0; i < shares; i++) out[i].data[b] = evalPoly(coeffs, out[i].index);
  }
  return out;
}

/** Lagrange interpolation at x = 0 over the supplied shares. */
export function combineShares(shares: ShamirShare[]): Uint8Array {
  if (shares.length === 0) throw new Error('no shares supplied');
  const len = shares[0].data.length;
  if (shares.some((s) => s.data.length !== len)) throw new Error('shares have inconsistent lengths');
  const seen = new Set<number>();
  for (const s of shares) {
    if (seen.has(s.index)) throw new Error(`duplicate share index ${s.index}`);
    seen.add(s.index);
  }

  const out = new Uint8Array(len);
  for (let b = 0; b < len; b++) {
    let value = 0;
    for (let i = 0; i < shares.length; i++) {
      let num = 1;
      let den = 1;
      for (let j = 0; j < shares.length; j++) {
        if (i === j) continue;
        num = gmul(num, shares[j].index);
        den = gmul(den, shares[i].index ^ shares[j].index);
      }
      value ^= gmul(shares[i].data[b], gdiv(num, den));
    }
    out[b] = value;
  }
  return out;
}

/* ------------------------------------------------------- wire / print format */

/** `[index][data]` hex — paste this into the vault or print it on paper. */
export const encodeShare = (share: ShamirShare): string =>
  hex.encode(new Uint8Array([share.index, ...share.data]));

export const decodeShare = (encoded: string): ShamirShare => {
  const bytes = hex.decode(encoded.trim().replace(/^0x/, ''));
  if (bytes.length < 2) throw new Error('share is truncated');
  return { index: bytes[0], data: bytes.slice(1) };
};

/** Two-byte visual checksum for transcribed shards. */
export const shareChecksum = (encoded: string): string =>
  hex.encode(sha256(new TextEncoder().encode(encoded))).slice(0, 4).toUpperCase();

/** Deterministic RNG for tests and reproducible ceremonies. */
export function seededRng(seed: number | string) {
  let h = 2166136261;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (len: number): Uint8Array => {
    const out = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      h ^= h << 13;
      h ^= h >>> 17;
      h ^= h << 5;
      h |= 0;
      out[i] = (h >>> 24) & 0xff;
    }
    return out;
  };
}
