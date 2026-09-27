import { describe, expect, it } from 'vitest';
import { hex } from '../keys/encode';
import {
  combineShares,
  decodeShare,
  encodeShare,
  seededRng,
  shareChecksum,
  splitSecret,
} from './shamir';

const SECRET = new Uint8Array(32).map((_, i) => (i * 7 + 3) & 0xff);

describe('Shamir secret sharing (Horcrux shards)', () => {
  it('reconstructs with an exact threshold of shares', () => {
    for (const [n, m] of [[3, 2], [5, 3], [6, 4], [2, 2], [9, 5]] as const) {
      const shares = splitSecret(SECRET, n, m, seededRng('ceremony'));
      expect(shares).toHaveLength(n);
      const rebuilt = combineShares(shares.slice(0, m));
      expect(hex.encode(rebuilt)).toBe(hex.encode(SECRET));
    }
  });

  it('reconstructs from any subset of at least m shares', () => {
    const shares = splitSecret(SECRET, 5, 3, seededRng('subset'));
    const subsets = [
      [0, 2, 4],
      [1, 2, 3],
      [3, 4, 0],
      [0, 1, 2, 3, 4],
    ];
    for (const sub of subsets) {
      const rebuilt = combineShares(sub.map((i) => shares[i]));
      expect(hex.encode(rebuilt)).toBe(hex.encode(SECRET));
    }
  });

  it('leaks nothing: below-threshold subsets do not reconstruct', () => {
    const shares = splitSecret(SECRET, 5, 3, seededRng('below'));
    const rebuilt = combineShares([shares[0], shares[1]]);
    expect(hex.encode(rebuilt)).not.toBe(hex.encode(SECRET));
  });

  it('round-trips through the printable hex format', () => {
    const shares = splitSecret(SECRET, 3, 2, seededRng('hex'));
    const encoded = shares.map(encodeShare);
    expect(encoded[0]).toMatch(/^[0-9a-f]+$/);
    const rebuilt = combineShares(encoded.slice(0, 2).map(decodeShare));
    expect(hex.encode(rebuilt)).toBe(hex.encode(SECRET));
  });

  it('is deterministic for a given ceremony seed and unique per shard index', () => {
    const a = splitSecret(SECRET, 4, 2, seededRng('fixed')).map(encodeShare);
    const b = splitSecret(SECRET, 4, 2, seededRng('fixed')).map(encodeShare);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(4);
  });

  it('produces a stable visual checksum that detects transcription errors', () => {
    const enc = encodeShare(splitSecret(SECRET, 3, 2, seededRng('chk'))[0]);
    expect(shareChecksum(enc)).toHaveLength(4);
    expect(shareChecksum(enc)).toBe(shareChecksum(enc));
    const flipped = enc.slice(0, -1) + (enc.slice(-1) === 'a' ? 'b' : 'a');
    expect(shareChecksum(flipped)).not.toBe(shareChecksum(enc));
  });

  it('rejects invalid parameters and mismatched shares', () => {
    expect(() => splitSecret(SECRET, 2, 3)).toThrow(/threshold/);
    expect(() => splitSecret(SECRET, 3, 1)).toThrow(/at least 2/);
    expect(() => splitSecret(new Uint8Array(0), 3, 2)).toThrow(/empty/);
    const shares = splitSecret(SECRET, 3, 2, seededRng('bad'));
    expect(() => combineShares([shares[0], shares[0]])).toThrow(/duplicate/);
    expect(() => combineShares([])).toThrow(/no shares/);
  });

  it('handles single-byte and long secrets', () => {
    const one = new Uint8Array([0xab]);
    expect(hex.encode(combineShares(splitSecret(one, 3, 2, seededRng('one')).slice(0, 2)))).toBe(hex.encode(one));
    const long = new Uint8Array(200).fill(0x5a);
    expect(hex.encode(combineShares(splitSecret(long, 4, 3, seededRng('long')).slice(1)))).toBe(hex.encode(long));
  });
});
