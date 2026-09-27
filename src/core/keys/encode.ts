import { sha256 } from '@noble/hashes/sha256';
import { ripemd160 } from '@noble/hashes/ripemd160';
import { keccak_256 } from '@noble/hashes/sha3';
import { base58, base58check, base58xmr, bech32, hex, utf8 } from '@scure/base';

export { hex, utf8, base58, base58xmr, bech32 };

/**
 * @scure/base names these backwards from intuition:
 *   utf8.encode(bytes) -> string, utf8.decode(string) -> bytes
 * These wrappers keep the rest of the codebase unambiguous.
 */
export const utf8ToBytes = (s: string): Uint8Array => utf8.decode(s);
export const bytesToUtf8 = (b: Uint8Array): string => utf8.encode(b);

export const sha256b = (...parts: Uint8Array[]): Uint8Array => {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const buf = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    buf.set(p, off);
    off += p.length;
  }
  return sha256(buf);
};

export const hash160 = (b: Uint8Array): Uint8Array => ripemd160(sha256(b));

export const keccak = (b: Uint8Array): Uint8Array => keccak_256(b);

/** Base58Check with double-SHA256 checksum (Bitcoin family). */
export const b58check = base58check(sha256);

/** EIP-55 mixed-case checksum. */
export function eip55(addrHex20: Uint8Array): string {
  const lower = hex.encode(addrHex20);
  const hash = hex.encode(keccak_256(utf8ToBytes(lower)));
  let out = '0x';
  for (let i = 0; i < lower.length; i++) {
    out += parseInt(hash[i], 16) >= 8 ? lower[i].toUpperCase() : lower[i];
  }
  return out;
}

/** Encode a P2WPKH (native segwit) address. */
export function p2wpkh(hrp: string, pubkey: Uint8Array): string {
  return bech32.encode(hrp as `${string}1${string}`, bech32.toWords(concat(new Uint8Array([0x00]), hash160(pubkey))), 90);
}

/** Encode a P2PKH address. */
export function p2pkh(version: number, pubkey: Uint8Array): string {
  return b58check.encode(concat(new Uint8Array([version]), hash160(pubkey)));
}

/** Encode a Zcash transparent (t1/t3-style P2PKH) address. */
export function zcashTransparent(prefix: [number, number], pubkey: Uint8Array): string {
  return b58check.encode(concat(new Uint8Array(prefix), hash160(pubkey)));
}

export function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const buf = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    buf.set(p, off);
    off += p.length;
  }
  return buf;
}

/** Interpret a little-endian byte array as a BigInt (Monero/Ed25519 scalar form). */
export function leBigInt(bytes: Uint8Array): bigint {
  let out = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) out = (out << 8n) | BigInt(bytes[i]);
  return out;
}

export function beBigInt(bytes: Uint8Array): bigint {
  let out = 0n;
  for (let i = 0; i < bytes.length; i++) out = (out << 8n) | BigInt(bytes[i]);
  return out;
}

export function bigToLe(value: bigint, length = 32): Uint8Array {
  const out = new Uint8Array(length);
  let v = value;
  for (let i = 0; i < length; i++) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

/** Truncate an address for display: first 8 … last 6. */
export function shortAddr(addr: string, head = 8, tail = 6): string {
  if (addr.length <= head + tail + 1) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

/**
 * Short human-checkable fingerprint for an address — used by Secure Send so the
 * operator can confirm a destination out-of-band without reading 40 hex chars.
 */
export function fingerprint(addr: string): string {
  const h = hex.encode(sha256(utf8ToBytes(addr)));
  return h.slice(0, 6).toUpperCase();
}

/** Three memorable words derived from an address (wordlist-free, phonotactic). */
const SYL_A = ['ba', 'ka', 'ro', 'ti', 'zu', 'me', 'va', 'li', 'no', 'sha', 'dra', 'kir'];
const SYL_B = ['len', 'mar', 'tox', 'vin', 'sar', 'pex', 'dul', 'gra', 'nis', 'vor'];
const SYL_C = ['ith', 'ane', 'orr', 'usk', 'ael', 'ion', 'yx', 'ov', 'esh', 'uum'];

export function wordFingerprint(addr: string): string {
  const h = sha256(utf8ToBytes(addr));
  const pick = (arr: string[], i: number) => arr[h[i] % arr.length];
  return [pick(SYL_A, 0), pick(SYL_B, 1), pick(SYL_C, 2)].join('-');
}
