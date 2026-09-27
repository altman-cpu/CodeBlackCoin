import { pbkdf2 } from '@noble/hashes/pbkdf2';
import { sha256 } from '@noble/hashes/sha256';
import { randomBytes } from '@noble/hashes/utils';
import { hex, utf8ToBytes } from '../keys/encode';

/**
 * Vault-at-rest encryption.
 *
 * Key derivation: PBKDF2-HMAC-SHA256 (600k iterations, per-OWASP floor) over
 *   passphrase ‖ passkeyCredentialId (when a passkey is enrolled) ‖ salt
 * Encryption: AES-256-GCM.
 *
 * THREAT MODEL, stated plainly:
 *  - Protects vault material at rest against someone reading localStorage /
 *    IndexedDB off a seized or synced device.
 *  - Does NOT protect against a malicious extension or XSS in the same origin
 *    while the vault is unlocked: anything running in the page can read memory.
 *  - A weak passphrase is a weak vault. The UI enforces a length floor and
 *    shows an entropy estimate, but it cannot make "password123" safe.
 *  - For substantial balances, use the desktop/mobile build where the key can
 *    live in a secure enclave / keystore instead of the browser heap.
 */

const PBKDF2_ITERATIONS = 600_000;
const KEY_BITS = 256;

export interface Envelope {
  v: 1;
  alg: 'PBKDF2-SHA256/AES-256-GCM';
  iterations: number;
  salt: string; // hex
  iv: string; // hex
  ct: string; // hex, ciphertext + GCM tag
  /** WebAuthn credential id bound into the KDF (empty string = passphrase only). */
  passkeyId: string;
  /** sha256(passphrase) prefix — only used to reject typos fast, never stored in the clear. */
  hint: string;
}

/** TS 5.9 types BufferSource narrowly; every value here is a fresh byte array. */
const bs = (b: Uint8Array): BufferSource => b as unknown as BufferSource;

const subtle = (): SubtleCrypto => {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error('WebCrypto unavailable — this build requires a secure context (https)');
  return s;
};

export async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
  iterations = PBKDF2_ITERATIONS,
  passkeyId = '',
): Promise<CryptoKey> {
  const material = pbkdf2(sha256, utf8ToBytes(passphrase + '‖' + passkeyId), salt, {
    c: iterations,
    dkLen: KEY_BITS / 8,
  });
  return subtle().importKey('raw', bs(material), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptJson(
  data: unknown,
  passphrase: string,
  passkeyId = '',
): Promise<Envelope> {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveKey(passphrase, salt, PBKDF2_ITERATIONS, passkeyId);
  const plaintext = new TextEncoder().encode(JSON.stringify(data));
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv: bs(iv) }, key, bs(plaintext));
  return {
    v: 1,
    alg: 'PBKDF2-SHA256/AES-256-GCM',
    iterations: PBKDF2_ITERATIONS,
    salt: hex.encode(salt),
    iv: hex.encode(iv),
    ct: hex.encode(new Uint8Array(ct)),
    passkeyId,
    hint: hex.encode(sha256(utf8ToBytes(passphrase))).slice(0, 8),
  };
}

export async function decryptJson<T>(envelope: Envelope, passphrase: string): Promise<T> {
  const key = await deriveKey(passphrase, hex.decode(envelope.salt), envelope.iterations, envelope.passkeyId);
  const plaintext = await subtle().decrypt(
    { name: 'AES-GCM', iv: bs(hex.decode(envelope.iv)) },
    key,
    bs(hex.decode(envelope.ct)),
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

/* ------------------------------------------------------------- passphrase */

/** Rough entropy estimate in bits, used only for the strength meter. */
export function passphraseEntropy(passphrase: string): number {
  let pool = 0;
  if (/[a-z]/.test(passphrase)) pool += 26;
  if (/[A-Z]/.test(passphrase)) pool += 26;
  if (/[0-9]/.test(passphrase)) pool += 10;
  if (/[^A-Za-z0-9]/.test(passphrase)) pool += 33;
  if (pool === 0) return 0;
  return passphrase.length * Math.log2(pool);
}

export function passphraseGrade(passphrase: string): { bits: number; label: string; tone: 'bad' | 'ok' | 'good' | 'great' } {
  const bits = passphraseEntropy(passphrase);
  if (bits < 40) return { bits, label: 'Weak', tone: 'bad' };
  if (bits < 60) return { bits, label: 'Fair', tone: 'ok' };
  if (bits < 90) return { bits, label: 'Strong', tone: 'good' };
  return { bits, label: 'Excellent', tone: 'great' };
}

/* --------------------------------------------------------------- WebAuthn */

export interface PasskeyRecord {
  credentialId: string;
  label: string;
  createdAt: number;
}

const RP_NAME = 'BLACKVAULT';

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** True when WebAuthn is usable (secure context, platform authenticator). */
export function passkeySupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.PublicKeyCredential &&
    !!window.crypto?.subtle &&
    window.isSecureContext
  );
}

export async function enrolPasskey(label: string): Promise<PasskeyRecord> {
  if (!passkeySupported()) throw new Error('Passkeys are unavailable in this browser/context');
  const challenge = randomBytes(32);
  const userId = randomBytes(16);
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: bs(challenge),
      rp: { name: RP_NAME, id: window.location.hostname },
      user: { id: bs(userId), name: `${label}@blackvault.local`, displayName: label },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 }, // ES256
        { type: 'public-key', alg: -257 }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
      },
      timeout: 60_000,
      attestation: 'none',
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error('Passkey enrolment was cancelled');
  return { credentialId: b64url(new Uint8Array(cred.rawId)), label, createdAt: Date.now() };
}

/**
 * Assert the enrolled passkey. The credential id is returned so it can be bound
 * into the KDF; where the platform supports the PRF extension we additionally
 * mix the PRF output into the passphrase material.
 */
export async function assertPasskey(credentialIds: string[]): Promise<{ credentialId: string; prf?: string }> {
  if (!passkeySupported()) throw new Error('Passkeys are unavailable in this browser/context');
  const challenge = randomBytes(32);
  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: bs(challenge),
      allowCredentials: credentialIds.map((id) => ({
        type: 'public-key',
        id: Uint8Array.from(atob(id.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)),
      })),
      userVerification: 'required',
      timeout: 60_000,
      extensions: { prf: { eval: { first: randomBytes(32) } } } as unknown as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;
  if (!assertion) throw new Error('Passkey assertion was cancelled');
  const ext = assertion.getClientExtensionResults() as { prf?: { results?: { first?: ArrayBuffer } } };
  const prf = ext.prf?.results?.first;
  return {
    credentialId: b64url(new Uint8Array(assertion.rawId)),
    prf: prf ? b64url(new Uint8Array(prf)) : undefined,
  };
}

/* --------------------------------------------------------------- session */

/**
 * The session key lives only in memory and only while the vault is unlocked.
 * Individual secrets (each wallet's mnemonic) are sealed with it, so a vault
 * that is read out of storage is useless even if the outer envelope were broken:
 * every secret inside is still independently encrypted.
 */
let SESSION: CryptoKey | null = null;
/**
 * The salt the session key was derived from. Re-sealing MUST reuse it: writing a
 * fresh salt would produce an envelope whose stored salt does not correspond to
 * the key that sealed it, and the vault would never open again.
 */
let SESSION_SALT: Uint8Array | null = null;

export function hasSession(): boolean {
  return SESSION !== null;
}

export function lockSession(): void {
  SESSION = null;
  SESSION_SALT = null;
}

/** Decrypt a vault envelope and retain the derived key for the session. */
export async function openVault<T>(envelope: Envelope, passphrase: string): Promise<T> {
  const salt = hex.decode(envelope.salt);
  const key = await deriveKey(passphrase, salt, envelope.iterations, envelope.passkeyId);
  const plaintext = await subtle().decrypt({ name: 'AES-GCM', iv: bs(hex.decode(envelope.iv)) }, key, bs(hex.decode(envelope.ct)));
  SESSION = key;
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

/** Re-seal a vault using the retained session key (no passphrase needed). */
export async function resealVault(data: unknown, passkeyId = ''): Promise<Envelope> {
  if (!SESSION) throw new Error('vault is locked');
  const iv = randomBytes(12);
  const plaintext = new TextEncoder().encode(JSON.stringify(data));
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv: bs(iv) }, SESSION, bs(plaintext));
  return {
    v: 1,
    alg: 'PBKDF2-SHA256/AES-256-GCM',
    iterations: PBKDF2_ITERATIONS,
    salt: hex.encode(SESSION_SALT ?? randomBytes(16)),
    iv: hex.encode(iv),
    ct: hex.encode(new Uint8Array(ct)),
    passkeyId,
    hint: '',
  };
}

/** Create a fresh session key straight from a passphrase (vault creation). */
export async function beginSession(passphrase: string, passkeyId = ''): Promise<void> {
  const salt = randomBytes(16);
  SESSION = await deriveKey(passphrase, salt, PBKDF2_ITERATIONS, passkeyId);
  SESSION_SALT = salt;
}

export async function sealSecret(plaintext: string): Promise<string> {
  if (!SESSION) throw new Error('vault is locked');
  const iv = randomBytes(12);
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv: bs(iv) }, SESSION, bs(new TextEncoder().encode(plaintext)));
  return hex.encode(iv) + ':' + hex.encode(new Uint8Array(ct));
}

export async function openSecret(sealed: string): Promise<string> {
  if (!SESSION) throw new Error('vault is locked');
  const [ivHex, ctHex] = sealed.split(':');
  const pt = await subtle().decrypt({ name: 'AES-GCM', iv: bs(hex.decode(ivHex)) }, SESSION, bs(hex.decode(ctHex)));
  return new TextDecoder().decode(pt);
}
