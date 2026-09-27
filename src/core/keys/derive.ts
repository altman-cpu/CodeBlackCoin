import { HDKey } from '@scure/bip32';
import { generateMnemonic as genMnemonic, mnemonicToSeedSync, validateMnemonic as validateMnemonicScure } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { ed25519 } from '@noble/curves/ed25519';
import { secp256k1 } from '@noble/curves/secp256k1';
import type { Asset } from '../types';
import {
  base58,
  base58xmr,
  bech32,
  b58check,
  concat,
  eip55,
  hex,
  keccak,
  leBigInt,
  p2pkh,
  p2wpkh,
  sha256b,
  utf8ToBytes,
  zcashTransparent,
} from './encode';

export const validateMnemonic = (mnemonic: string): boolean =>
  validateMnemonicScure(mnemonic.trim(), wordlist);

export function generateMnemonic(strength: 128 | 160 | 192 | 224 | 256 = 256): string {
  return genMnemonic(wordlist, strength);
}

export function mnemonicToSeed(mnemonic: string, passphrase = ''): Uint8Array {
  return mnemonicToSeedSync(mnemonic.trim(), passphrase);
}

export interface DerivedAccount {
  address: string;
  hdPath: string;
  /** False for families whose derivation is not implemented (never show a QR). */
  verified: boolean;
}

/* ------------------------------------------------------------- Monero (XMR) */

const ED25519_L: bigint = BigInt(ed25519.CURVE.n as bigint);
const MONERO_MAINNET_PRIMARY = 0x12;

/** Monero's sc_reduce: little-endian scalar reduced modulo the group order. */
export function scReduce(bytes: Uint8Array): bigint {
  return leBigInt(bytes) % ED25519_L;
}

/** Monero keys are NOT RFC-8032 expanded: the seed IS the scalar (sc_reduced). */
export function moneroKeys(accountSeed: Uint8Array): { spend: Uint8Array; view: Uint8Array } {
  const spendScalar = scReduce(accountSeed);
  const viewScalar = scReduce(keccak(accountSeed));
  const spend = ed25519.Point.BASE.multiply(spendScalar).toBytes();
  const view = ed25519.Point.BASE.multiply(viewScalar).toBytes();
  return { spend, view };
}

/**
 * Standard (primary) Monero address:
 *   netbyte || pubSpend || pubView || keccak256(payload)[0..4]  → base58xmr
 *
 * Integrated addresses and subaddresses are deliberately out of scope.
 * Validate against `monero-wallet-cli --address` before trusting mainnet funds.
 */
export function moneroAddress(accountSeed: Uint8Array, netbyte: number = MONERO_MAINNET_PRIMARY): string {
  const { spend, view } = moneroKeys(accountSeed);
  const payload = concat(new Uint8Array([netbyte]), spend, view);
  const checksum = keccak(payload).slice(0, 4);
  return base58xmr.encode(concat(payload, checksum));
}

/* -------------------------------------------------------------- address gen */

const BTC_FAMILY_HRP: Record<string, string> = { btc: 'bc', ltc: 'ltc' };
const BTC_FAMILY_P2PKH: Record<string, number> = { dash: 0x4c };

export function deriveAddress(asset: Asset, seed: Uint8Array, index: number): DerivedAccount {
  const path = asset.path.replace('{i}', String(index));

  switch (asset.family) {
    case 'bitcoin': {
      const node = HDKey.fromMasterSeed(seed).derive(path);
      if (!node.privateKey) throw new Error('derivation failed');
      const pub = secp256k1.getPublicKey(node.privateKey, true);
      const hrp = BTC_FAMILY_HRP[asset.chain];
      const p2pkhVersion = BTC_FAMILY_P2PKH[asset.chain];
      const address = hrp ? p2wpkh(hrp, pub) : p2pkh(p2pkhVersion ?? 0x00, pub);
      return { address, hdPath: path, verified: true };
    }
    case 'zcash': {
      const node = HDKey.fromMasterSeed(seed).derive(path);
      if (!node.privateKey) throw new Error('derivation failed');
      const pub = secp256k1.getPublicKey(node.privateKey, true);
      // t1 = P2PKH on the Zcash network (two-byte address prefix 0x1CB8).
      return { address: zcashTransparent([0x1c, 0xb8], pub), hdPath: path, verified: true };
    }
    case 'ethereum': {
      const node = HDKey.fromMasterSeed(seed).derive(path);
      if (!node.privateKey) throw new Error('derivation failed');
      const pub = secp256k1.getPublicKey(node.privateKey, false).slice(1);
      return { address: eip55(keccak(pub).slice(-20)), hdPath: path, verified: true };
    }
    case 'solana': {
      const node = HDKey.fromMasterSeed(seed).derive(path);
      if (!node.privateKey) throw new Error('derivation failed');
      // Solana uses standard RFC-8032 Ed25519 keys from a 32-byte seed.
      return { address: base58.encode(ed25519.getPublicKey(node.privateKey)), hdPath: path, verified: true };
    }
    case 'monero': {
      const accountSeed = sha256b(seed, utf8ToBytes(`monero/${index}`));
      return { address: moneroAddress(accountSeed), hdPath: `monero-account/${index}`, verified: true };
    }
    default: {
      // No derivation implemented for this asset: emit an obviously-fake
      // address so it can never be mistaken for a real deposit destination.
      const pseudo = sha256b(seed, utf8ToBytes(`${asset.id}/${index}`));
      return { address: `SIM-${asset.symbol}-${hex.encode(pseudo).slice(0, 24)}`, hdPath: path, verified: false };
    }
  }
}

/** Short public identifier for a wallet (first 8 hex of sha256(master pubkey)). */
export function walletFingerprint(seed: Uint8Array): string {
  const master = HDKey.fromMasterSeed(seed);
  if (!master.publicKey) throw new Error('derivation failed');
  return hex.encode(sha256b(master.publicKey)).slice(0, 8).toUpperCase();
}

/* ----------------------------------------------------------- verification */

/** Structural validation of an address without network access. */
export function validateAddress(asset: Asset, address: string): { ok: boolean; reason?: string } {
  const a = address.trim();
  if (!a) return { ok: false, reason: 'Address is empty' };

  if (asset.family === 'bitcoin' || asset.chain === 'btc' || asset.chain === 'ltc') {
    const hrp = BTC_FAMILY_HRP[asset.chain] ?? 'bc';
    if (a.toLowerCase().startsWith(hrp + '1')) {
      try {
        const { prefix, words } = bech32.decode(a as `${string}1${string}`, 90);
        if (prefix !== hrp) return { ok: false, reason: `Wrong network prefix (expected ${hrp})` };
        const bytes = bech32.fromWords(words);
        if (bytes.length !== 21) return { ok: false, reason: 'Witness program must be 21 bytes' };
        return { ok: true };
      } catch {
        return { ok: false, reason: 'Bech32 checksum failed' };
      }
    }
    try {
      b58check.decode(a);
      return { ok: true };
    } catch {
      return { ok: false, reason: 'Base58Check checksum failed' };
    }
  }

  if (asset.family === 'ethereum') {
    if (!/^0x[0-9a-fA-F]{40}$/.test(a)) return { ok: false, reason: 'Expected 0x + 40 hex characters' };
    // EIP-55: if the address is mixed-case, the checksum must validate.
    if (a !== a.toLowerCase() && a !== a.toUpperCase() && a !== eip55(hex.decode(a.slice(2)))) {
      return { ok: false, reason: 'EIP-55 checksum failed — address may be corrupted' };
    }
    return { ok: true };
  }

  if (asset.family === 'monero') {
    if (a.length !== 95 && a.length !== 106) return { ok: false, reason: 'Monero addresses are 95 (standard) or 106 (integrated) characters' };
    try {
      const bytes = base58xmr.decode(a);
      if (bytes.length !== 69 && bytes.length !== 77) return { ok: false, reason: 'Decoded length is wrong for a Monero address' };
      const payload = bytes.slice(0, -4);
      const checksum = bytes.slice(-4);
      if (hex.encode(keccak(payload).slice(0, 4)) !== hex.encode(checksum)) {
        return { ok: false, reason: 'Monero address checksum failed' };
      }
      return { ok: true };
    } catch {
      return { ok: false, reason: 'Base58 (Monero block encoding) decode failed' };
    }
  }

  if (asset.family === 'solana') {
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a)) return { ok: false, reason: 'Expected a base58-encoded 32-byte public key' };
    try {
      const bytes = base58.decode(a);
      if (bytes.length !== 32) return { ok: false, reason: 'Solana public keys are 32 bytes' };
      return { ok: true };
    } catch {
      return { ok: false, reason: 'Base58 decode failed' };
    }
  }

  if (asset.family === 'zcash') {
    try {
      const bytes = b58check.decode(a);
      if (bytes.length !== 22) return { ok: false, reason: 'Unexpected transparent address length' };
      return { ok: true };
    } catch {
      return { ok: false, reason: 'Base58Check checksum failed' };
    }
  }

  return { ok: false, reason: `No local validator for ${asset.symbol} yet — verify with the node` };
}

/** Mixed-case detection used by the phishing shield. */
export function addressLooksChecksummed(address: string): boolean {
  const body = address.replace(/^0x/, '');
  return body !== body.toLowerCase() && body !== body.toUpperCase();
}
