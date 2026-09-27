import { describe, expect, it } from 'vitest';
import { sha512 } from '@noble/hashes/sha512';
import { ed25519 } from '@noble/curves/ed25519';
import { hex, utf8ToBytes, base58xmr, keccak, concat, fingerprint, wordFingerprint } from './encode';
import {
  deriveAddress,
  generateMnemonic,
  mnemonicToSeed,
  moneroAddress,
  scReduce,
  validateAddress,
  validateMnemonic,
  walletFingerprint,
} from './derive';
import { getAsset } from '../assets';

const SEED = new Uint8Array(32).fill(7);

describe('BIP-39 seed', () => {
  it('generates a valid 24-word mnemonic', () => {
    const mn = generateMnemonic(256);
    expect(mn.split(' ')).toHaveLength(24);
    expect(validateMnemonic(mn)).toBe(true);
  });

  it('derives a deterministic 64-byte seed and stable fingerprint', () => {
    const seed = mnemonicToSeed(generateMnemonic(128).split(' ').slice(0, 12).join(' '));
    expect(seed.length).toBe(64);
    expect(walletFingerprint(SEED)).toMatch(/^[0-9A-F]{8}$/);
    expect(walletFingerprint(SEED)).toBe(walletFingerprint(SEED));
  });
});

describe('Ed25519 scalar convention (guards the Monero path)', () => {
  it('matches the RFC-8032 test vector when the seed is expanded + clamped', () => {
    // RFC 8032 §7.1 TEST 1
    const sk = hex.decode('9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60');
    const expected = 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a';
    const expanded = sha512(sk).slice(0, 32);
    expanded[0] &= 248;
    expanded[31] &= 127;
    expanded[31] |= 64;
    const pub = ed25519.Point.BASE.multiply(scReduce(expanded)).toBytes();
    expect(hex.encode(pub)).toBe(expected);
  });

  it('produces the canonical Ed25519 basepoint for scalar 1', () => {
    const pub = ed25519.Point.BASE.multiply(1n).toBytes();
    expect(hex.encode(pub)).toBe('5866666666666666666666666666666666666666666666666666666666666666');
  });
});

describe('address derivation', () => {
  it('derives native segwit Bitcoin addresses', () => {
    const { address, verified } = deriveAddress(getAsset('btc'), SEED, 0);
    expect(verified).toBe(true);
    expect(address.startsWith('bc1q')).toBe(true);
    expect(address.length).toBeGreaterThanOrEqual(42);
    expect(validateAddress(getAsset('btc'), address).ok).toBe(true);
    // index changes the address, seed does not
    expect(deriveAddress(getAsset('btc'), SEED, 1).address).not.toBe(address);
  });

  it('derives Litecoin on its own HRP', () => {
    const { address } = deriveAddress(getAsset('ltc'), SEED, 0);
    expect(address.startsWith('ltc1q')).toBe(true);
    expect(validateAddress(getAsset('ltc'), address).ok).toBe(true);
  });

  it('derives Dash P2PKH (X-prefix)', () => {
    const { address } = deriveAddress(getAsset('dash'), SEED, 0);
    expect(address.startsWith('X')).toBe(true);
  });

  it('derives EIP-55 checksummed Ethereum addresses', () => {
    const { address, verified } = deriveAddress(getAsset('eth'), SEED, 0);
    expect(verified).toBe(true);
    expect(address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(validateAddress(getAsset('eth'), address).ok).toBe(true);
    expect(validateAddress(getAsset('eth'), address.toLowerCase()).ok).toBe(true);
    const corrupted = '0x' + address.slice(2, 3) + address.slice(3).toUpperCase().slice(0, 39);
    expect(validateAddress(getAsset('eth'), corrupted).ok).toBe(false);
  });

  it('derives Zcash transparent t-addresses with a valid checksum', () => {
    const { address, verified } = deriveAddress(getAsset('zec'), SEED, 0);
    expect(verified).toBe(true);
    expect(address.startsWith('t1')).toBe(true);
    expect(validateAddress(getAsset('zec'), address).ok).toBe(true);
  });

  it('derives base58 Solana public keys', () => {
    const { address, verified } = deriveAddress(getAsset('sol'), SEED, 0);
    expect(verified).toBe(true);
    expect(address).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
    expect(validateAddress(getAsset('sol'), address).ok).toBe(true);
  });

  it('derives structurally valid Monero primary addresses', () => {
    const { address, verified } = deriveAddress(getAsset('xmr'), SEED, 0);
    expect(verified).toBe(true);
    expect(address).toHaveLength(95);
    expect(address.startsWith('4')).toBe(true); // netbyte 0x12 -> leading base58 char
    expect(validateAddress(getAsset('xmr'), address).ok).toBe(true);

    const bytes = base58xmr.decode(address);
    expect(bytes).toHaveLength(69);
    expect(bytes[0]).toBe(0x12);
    const payload = bytes.slice(0, -4);
    expect(hex.encode(keccak(payload).slice(0, 4))).toBe(hex.encode(bytes.slice(-4)));
    // spend and view keys must differ
    expect(hex.encode(payload.slice(1, 33))).not.toBe(hex.encode(payload.slice(33, 65)));
  });

  it('rejects a Monero address with a flipped checksum', () => {
    const { address } = deriveAddress(getAsset('xmr'), SEED, 3);
    const bytes = base58xmr.decode(address);
    bytes[bytes.length - 1] ^= 0x01;
    expect(validateAddress(getAsset('xmr'), base58xmr.encode(bytes)).ok).toBe(false);
  });

  it('never emits a real-looking address for unimplemented families', () => {
    const { address, verified } = deriveAddress(getAsset('zano'), SEED, 0);
    expect(verified).toBe(false);
    expect(address.startsWith('SIM-')).toBe(true);
  });

  it('is deterministic across calls', () => {
    const a = moneroAddress(SEED);
    const b = moneroAddress(SEED);
    expect(a).toBe(b);
    expect(deriveAddress(getAsset('btc'), SEED, 5).address).toBe(deriveAddress(getAsset('btc'), SEED, 5).address);
  });
});

describe('address validation hardening', () => {
  it('rejects bech32 addresses with a broken checksum', () => {
    const good = deriveAddress(getAsset('btc'), SEED, 0).address;
    const broken = good.slice(0, -1) + (good.slice(-1) === 'q' ? 'p' : 'q');
    expect(validateAddress(getAsset('btc'), broken).ok).toBe(false);
  });

  it('rejects empty and malformed input', () => {
    expect(validateAddress(getAsset('btc'), '').ok).toBe(false);
    expect(validateAddress(getAsset('eth'), '0x123').ok).toBe(false);
  });

  it('fingerprint helpers are stable and short', () => {
    expect(fingerprint('bc1qtest')).toBe(fingerprint('bc1qtest'));
    expect(fingerprint('bc1qtest')).toHaveLength(6);
    expect(fingerprint('bc1qother')).not.toBe(fingerprint('bc1qtest'));
  });

  it('word fingerprints are pronounceable and collision-resistant enough for UI', () => {
    const a = wordFingerprint('bc1qtest');
    expect(a.split('-')).toHaveLength(3);
    expect(wordFingerprint('bc1qtest')).toBe(a);
    expect(wordFingerprint('bc1qtest2')).not.toBe(a);
    expect(utf8ToBytes('x')).toBeInstanceOf(Uint8Array);
    expect(concat(new Uint8Array([1]), new Uint8Array([2]))).toEqual(new Uint8Array([1, 2]));
  });
});
