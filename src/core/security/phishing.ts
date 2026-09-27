import type { Asset } from '../types';
import { fingerprint, wordFingerprint } from '../keys/encode';

/**
 * Phishing / poisoning heuristics — the "Secure Send" brain.
 *
 * Everything runs locally. No address, domain or balance ever leaves the device
 * to be checked, because phoning a third party with your destination is itself a
 * privacy leak. These are heuristics: they catch the patterns that actually drain
 * wallets (clipboard hijacks, homoglyph domains, address poisoning, unlimited
 * approvals), not every conceivable scam.
 */

export type PhishingLevel = 'clean' | 'suspicious' | 'dangerous';

export interface PhishingFinding {
  code: string;
  label: string;
  detail: string;
  severity: 'info' | 'warn' | 'critical';
}

export interface PhishingVerdict {
  level: PhishingLevel;
  /** 0 = clean, 100 = near-certain attack. */
  score: number;
  findings: PhishingFinding[];
  recommendation: string;
  /** Out-of-band confirmation material shown to the operator. */
  fingerprint: string;
  words: string;
}

/* --------------------------------------------------------------- unicode */

/** Common confusables used to fake Latin domains and addresses. */
const CONFUSABLE_GROUPS: Record<string, string> = {
  а: 'a', // Cyrillic
  е: 'e',
  о: 'o',
  р: 'p',
  с: 'c',
  у: 'y',
  х: 'x',
  і: 'i',
  ј: 'j',
  ѕ: 's',
  ԁ: 'd',
  һ: 'h',
  ɡ: 'g',
  ԛ: 'q',
  ԝ: 'w',
  ο: 'o', // Greek
  ν: 'v',
  ρ: 'p',
  τ: 't',
  μ: 'u',
  α: 'a',
  ε: 'e',
  ι: 'i',
  κ: 'k',
  ϲ: 'c',
  ɑ: 'a', // Latin extensions
  ᴛ: 't',
  ı: 'i',
  ѐ: 'e',
};

export function hasConfusables(input: string): boolean {
  for (const ch of input) {
    if (CONFUSABLE_GROUPS[ch]) return true;
    const cp = ch.codePointAt(0)!;
    // zero-width, bidi controls, combining marks and other invisible trickery
    if (cp === 0x200b || cp === 0x200c || cp === 0x200d || cp === 0xfeff) return true;
    if (cp >= 0x202a && cp <= 0x202e) return true;
    if (cp >= 0x0300 && cp <= 0x036f) return true;
  }
  return false;
}

export function isMixedScript(input: string): boolean {
  const scripts = new Set<string>();
  for (const ch of input) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80) scripts.add('latin');
    else if (cp >= 0x400 && cp <= 0x4ff) scripts.add('cyrillic');
    else if (cp >= 0x370 && cp <= 0x3ff) scripts.add('greek');
    else if (cp >= 0x530 && cp <= 0x58f) scripts.add('armenian');
    else if (cp >= 0x10a0 && cp <= 0x10ff) scripts.add('georgian');
  }
  return scripts.size > 1;
}

/* ---------------------------------------------------------------- distance */

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = new Array(b.length + 1);
  const cur = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
  }
  return prev[b.length];
}

export function similarity(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  if (max === 0) return 1;
  return 1 - levenshtein(a, b) / max;
}

/* ------------------------------------------------------------------ domains */

const BRANDS = [
  'blackvault', 'metamask', 'ledger', 'trezor', 'phantom', 'uniswap', 'aave', 'curve', 'thorchain',
  'changenow', 'fixedfloat', 'stealthex', 'binance', 'coinbase', 'kraken', 'blockchain', 'exodus',
  'electrum', 'sparrow', 'cakewallet', 'monero', 'zcash', 'bitcoin', 'etherscan', 'mempool',
];

const SUSPICIOUS_TLDS = ['zip', 'mov', 'xyz', 'top', 'click', 'cam', 'rest', 'country', 'stream', 'gq', 'cf', 'tk', 'ml', 'loan', 'work'];

export interface DomainVerdict {
  host: string;
  level: PhishingLevel;
  findings: PhishingFinding[];
  /** Set when the host looks like a misspelling of a known brand. */
  impersonating?: string;
}

export function analyzeDomain(input: string): DomainVerdict {
  const findings: PhishingFinding[] = [];
  let host = input.trim().toLowerCase();
  try {
    if (!/^[a-z]+:\/\//i.test(host)) host = 'https://' + host;
    host = new URL(host).hostname;
  } catch {
    return { host: input, level: 'suspicious', findings: [{ code: 'unparseable', label: 'Not a valid URL', detail: 'The input could not be parsed as a URL.', severity: 'warn' }] };
  }
  host = host.replace(/^www\./, '');

  if (host.startsWith('xn--') || host.includes('.xn--')) {
    findings.push({
      code: 'punycode',
      label: 'Punycode / IDN domain',
      detail: `The hostname is encoded (${host}). IDN homograph attacks render non-Latin characters as their Latin lookalikes.`,
      severity: 'critical',
    });
  }
  if (hasConfusables(host) || isMixedScript(host)) {
    findings.push({
      code: 'homoglyph',
      label: 'Mixed-script or lookalike characters',
      detail: 'The hostname mixes scripts or contains characters that render as Latin letters.',
      severity: 'critical',
    });
  }
  const tld = host.split('.').pop() ?? '';
  if (SUSPICIOUS_TLDS.includes(tld)) {
    findings.push({
      code: 'tld',
      label: `High-abuse TLD (.${tld})`,
      detail: 'This TLD is disproportionately used in short-lived phishing campaigns.',
      severity: 'warn',
    });
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    findings.push({ code: 'ip-host', label: 'Bare IP address', detail: 'Legitimate wallet and exchange services do not serve from raw IPs.', severity: 'critical' });
  }
  const labels = host.split('.');
  if (labels.length > 3) {
    findings.push({
      code: 'deep-subdomain',
      label: 'Deep subdomain chain',
      detail: `${labels.length} labels — subdomain padding is a common way to hide the real registrable domain.`,
      severity: 'warn',
    });
  }

  // Brand impersonation: brand embedded in subdomain/path, or a near-miss spelling.
  const stripped = host.replace(/[^a-z0-9]/g, '');
  let impersonating: string | undefined;
  for (const brand of BRANDS) {
    if (stripped === brand) continue;
    if (stripped.includes(brand) && stripped !== brand) {
      impersonating = brand;
      findings.push({
        code: 'brand-embed',
        label: `Impersonates "${brand}"`,
        detail: `The hostname embeds the brand name "${brand}" but is not that domain.`,
        severity: 'critical',
      });
      break;
    }
    if (brand.length >= 5 && similarity(stripped.replace(/\d/g, ''), brand) >= 0.82) {
      impersonating = brand;
      findings.push({
        code: 'typosquat',
        label: `Typosquat of "${brand}"`,
        detail: `The hostname is a near-miss spelling of "${brand}" (edit distance ${levenshtein(stripped, brand)}).`,
        severity: 'critical',
      });
      break;
    }
  }

  const level: PhishingLevel = findings.some((f) => f.severity === 'critical')
    ? 'dangerous'
    : findings.length
      ? 'suspicious'
      : 'clean';
  return { host, level, findings, impersonating };
}

/* ----------------------------------------------------------------- addresses */

export interface AddressScreeningInput {
  asset: Asset;
  address: string;
  /** Addresses this vault has interacted with recently (poisoning baseline). */
  recentAddresses: string[];
  /** Verified contacts — a lookalike of a contact is a poisoning attempt. */
  contactAddresses: string[];
  /** True when the address failed structural validation. */
  invalid?: boolean;
  invalidReason?: string;
}

/**
 * Screen a destination address.
 *
 * Address poisoning works by generating a vanity address whose first and last
 * characters match one you recently paid, then dusting your history with it so it
 * appears in your clipboard-ready list. We therefore compare *ends*, not middles.
 */
export function screenAddress(input: AddressScreeningInput): PhishingVerdict {
  const { asset, address } = input;
  const findings: PhishingFinding[] = [];
  const trimmed = address.trim();

  if (input.invalid) {
    findings.push({
      code: 'invalid',
      label: 'Address failed validation',
      detail: input.invalidReason ?? `This is not a well-formed ${asset.symbol} address.`,
      severity: 'critical',
    });
  }

  if (hasConfusables(trimmed)) {
    findings.push({
      code: 'invisible',
      label: 'Invisible characters in address',
      detail: 'The address contains zero-width or bidi control characters — a classic clipboard-hijack signature.',
      severity: 'critical',
    });
  }
  if (isMixedScript(trimmed)) {
    findings.push({
      code: 'mixed-script',
      label: 'Mixed writing systems',
      detail: 'The address mixes scripts. Real addresses are single-alphabet.',
      severity: 'critical',
    });
  }

  const norm = trimmed.toLowerCase();
  for (const recent of input.recentAddresses) {
    const r = recent.toLowerCase();
    if (r === norm) continue;
    if (r.length < 12 || norm.length < 12) continue;
    const head = 6;
    const tail = 4;
    if (r.slice(0, head) === norm.slice(0, head) && r.slice(-tail) === norm.slice(-tail)) {
      findings.push({
        code: 'poisoning',
        label: 'Address-poisoning lookalike',
        detail: `This address shares its first ${head} and last ${tail} characters with ${recent.slice(0, 10)}… — the signature of a poisoning attack that mimics your recent history.`,
        severity: 'critical',
      });
      break;
    }
  }

  for (const contact of input.contactAddresses) {
    const c = contact.toLowerCase();
    if (c === norm) continue;
    if (similarity(c, norm) >= 0.9 && c.length === norm.length) {
      findings.push({
        code: 'contact-lookalike',
        label: 'Near-match to a saved contact',
        detail: `This is one or two characters away from a contact you verified (${contact.slice(0, 10)}…). Verify out-of-band before sending.`,
        severity: 'critical',
      });
      break;
    }
  }

  const score = Math.min(
    100,
    findings.reduce((n, f) => n + (f.severity === 'critical' ? 55 : f.severity === 'warn' ? 25 : 5), 0),
  );
  const level: PhishingLevel = score >= 55 ? 'dangerous' : score > 0 ? 'suspicious' : 'clean';

  return {
    level,
    score,
    findings,
      recommendation:
      level === 'dangerous'
        ? 'Do not send. This destination matches a known attack pattern.'
        : level === 'suspicious'
          ? 'Verify the full address out-of-band before signing.'
          : 'No attack pattern detected. Still confirm the fingerprint out-of-band for large amounts.',
    fingerprint: fingerprint(trimmed),
    words: wordFingerprint(trimmed),
  };
}

/** Screen a token approval. Unlimited approvals are the #1 drainer primitive. */
export function screenApproval(spender: string, unlimited: boolean, amountUsd: number, capUsd: number): PhishingVerdict {
  const findings: PhishingFinding[] = [];
  if (unlimited) {
    findings.push({
      code: 'unlimited-approval',
      label: 'Unlimited token approval',
      detail: 'This grants the spender the right to move the entire balance, forever, until revoked.',
      severity: 'critical',
    });
  }
  if (amountUsd > capUsd) {
    findings.push({
      code: 'over-cap',
      label: 'Approval exceeds policy cap',
      detail: `Requested approval ($${Math.round(amountUsd).toLocaleString()}) is above this wallet's cap ($${Math.round(capUsd).toLocaleString()}).`,
      severity: 'warn',
    });
  }
  if (hasConfusables(spender)) {
    findings.push({ code: 'spender-confusable', label: 'Suspicious spender identifier', detail: 'The spender string contains lookalike or invisible characters.', severity: 'critical' });
  }
  const score = Math.min(100, findings.reduce((n, f) => n + (f.severity === 'critical' ? 60 : 25), 0));
  return {
    level: score >= 60 ? 'dangerous' : score > 0 ? 'suspicious' : 'clean',
    score,
    findings,
    recommendation: score >= 60 ? 'Refuse this approval.' : 'Approve only the exact amount needed.',
    fingerprint: fingerprint(spender),
    words: wordFingerprint(spender),
  };
}

/** Clean verdict, used when screening is not applicable. */
export function cleanVerdict(address: string): PhishingVerdict {
  return {
    level: 'clean',
    score: 0,
    findings: [],
    recommendation: 'No attack pattern detected.',
    fingerprint: fingerprint(address),
    words: wordFingerprint(address),
  };
}
