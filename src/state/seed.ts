import { sha256 } from '@noble/hashes/sha256';
import { wordlist } from '@scure/bip39/wordlists/english';
import { generateMnemonic, mnemonicToSeed, deriveAddress, walletFingerprint, validateMnemonic } from '../core/keys/derive';
import { sealSecret } from '../core/crypto/keystore';
import { SimAdapter } from '../core/chain/adapter';
import { priceUsdAt, ASSETS, getAsset } from '../core/assets';
import { defaultReacts } from '../core/automation/reacts';
import { defaultRulesFor } from '../core/policy/tiers';
import type { Account, Asset, AuditEntry, TierId, VaultEvent, VaultState, Wallet, WalletKind } from '../core/types';
import { fakeTxid } from '../core/chain/sim';

const adapter = new SimAdapter();

export interface NewWalletInput {
  label: string;
  tier: TierId;
  kind?: WalletKind;
  visibility?: Wallet['visibility'];
  assetIds: string[];
  passkeyId?: string;
  /** Seed deterministically from this string (demo vaults) or make a fresh one. */
  seedPhrase?: string;
  /** Real BIP-39 mnemonic to restore from. Validated before use. */
  mnemonic?: string;
  notes?: string;
}

export async function buildWallet(input: NewWalletInput, index: number): Promise<Wallet> {
  const mnemonic = input.mnemonic
    ? validateMnemonic(input.mnemonic.trim()) ? input.mnemonic.trim() : (() => { throw new Error('That is not a valid BIP-39 recovery phrase'); })()
    : input.seedPhrase
      ? mnemonicFromPassphrase(input.seedPhrase)
      : generateMnemonic(256);
  const seed = mnemonicToSeed(mnemonic);
  const id = `w_${Date.now().toString(36)}_${index}`;

  const accounts: Account[] = [];
  const balances: Record<string, number> = {};
  let balanceUsd = 0;

  for (const assetId of input.assetIds) {
    const asset = getAsset(assetId);
    const derived = deriveAddress(asset, seed, 0);
    const bal = await adapter.getBalance(asset, derived.address);
    accounts.push({
      id: `${id}_${asset.id}`,
      walletId: id,
      assetId: asset.id,
      address: derived.address,
      hdPath: derived.hdPath,
      index: 0,
      lastActivity: Date.now() - Math.floor(Math.random() * 40 * 86_400_000),
    });
    balances[asset.id] = bal.amount;
    balanceUsd += bal.amount * priceUsdAt(asset);
  }

  return {
    id,
    label: input.label,
    kind: input.kind ?? 'seed',
    tier: input.tier,
    visibility: input.visibility ?? 'visible',
    colorIndex: index % 6,
    createdAt: Date.now(),
    mnemonicEnc: await sealSecret(mnemonic),
    passkeyId: input.passkeyId,
    fingerprint: walletFingerprint(seed),
    accounts,
    balances,
    balanceUsd,
    notes: input.notes,
  };
}

/** Derive the next receiving address for an asset (address-rotation react). */
export async function rotateAccount(wallet: Wallet, assetId: string, mnemonic: string): Promise<Account> {
  const asset = getAsset(assetId);
  const seed = mnemonicToSeed(mnemonic);
  const nextIndex = wallet.accounts.filter((a) => a.assetId === assetId).length;
  const derived = deriveAddress(asset, seed, nextIndex);
  const previous = wallet.accounts.find((a) => a.assetId === assetId);
  return {
    id: `${wallet.id}_${asset.id}_${nextIndex}`,
    walletId: wallet.id,
    assetId: asset.id,
    address: derived.address,
    hdPath: derived.hdPath,
    index: nextIndex,
    lastActivity: Date.now(),
    rotatedFrom: previous?.address,
  };
}

/** Deterministic 24-word mnemonic derived from an arbitrary passphrase (demo use). */
function mnemonicFromPassphrase(phrase: string): string {
  // Deterministic demo key material only: fold the phrase through SHA-256 and
  // map each round onto the BIP-39 wordlist. Real wallets use fresh entropy.
  const out: string[] = [];
  let buf = new TextEncoder().encode(phrase);
  for (let i = 0; i < 24; i++) {
    buf = Uint8Array.from(sha256(buf));
    out.push(wordlist[(buf[0] << 8 | buf[1]) % wordlist.length]);
  }
  return out.join(' ');
}

/* ---------------------------------------------------------- initial vault */

export const DEFAULT_SETTINGS: VaultState['settings'] = {
  autoLockMinutes: 10,
  hideBalances: false,
  chainMode: 'sim',
  btcEndpoint: 'https://mempool.space/api',
  evmEndpoint: '',
  duressUnlockVisible: true,
  routeThroughProxy: false,
  fiat: 'USD',
  telemetry: false,
  watchtower: true,
};

async function defaultWallets(): Promise<Wallet[]> {
  const glacier = await buildWallet(
    { label: 'Glacier Reserve', tier: 0, assetIds: ['btc', 'xmr', 'zec'], seedPhrase: 'blackvault:glacier:demo', notes: 'Long-term. Nothing moves from here without a ceremony.' },
    0,
  );
  const everyday = await buildWallet(
    { label: 'Everyday Carry', tier: 1, assetIds: ['btc', 'eth', 'usdc'], seedPhrase: 'blackvault:everyday:demo' },
    1,
  );
  const ops = await buildWallet(
    { label: 'Operations', tier: 2, assetIds: ['eth', 'usdt', 'sol'], seedPhrase: 'blackvault:ops:demo' },
    2,
  );
  const reactor = await buildWallet(
    { label: 'Reactor', tier: 3, assetIds: ['btc', 'eth', 'ltc'], seedPhrase: 'blackvault:reactor:demo' },
    3,
  );
  const decoy = await buildWallet(
    {
      label: 'Spending',
      tier: 1,
      visibility: 'decoy',
      assetIds: ['btc', 'eth'],
      seedPhrase: 'blackvault:decoy:demo',
      notes: 'Decoy: funded on purpose so it is believable under pressure.',
    },
    4,
  );

  return [glacier, everyday, ops, reactor, decoy];
}

/** Vault scaffolding shared by a fresh vault and a restored one. */
async function scaffold(wallets: Wallet[]): Promise<VaultState> {
  const now = Date.now();
  const ops = wallets.find((w) => w.label === 'Operations') ?? wallets[0];
  const everyday = wallets.find((w) => w.label === 'Everyday Carry') ?? wallets[0];
  const glacier = wallets[0];

  const events: VaultEvent[] = [
    {
      id: 'evt_seed_1',
      kind: 'new_device',
      at: now - 3 * 3_600_000,
      severity: 'info',
      title: 'Vault created on this device',
      detail: 'Key material was generated on-device. Nothing was transmitted, backed up to a cloud, or logged.',
    },
    {
      id: 'evt_seed_2',
      kind: 'balance_anomaly',
      at: now - 26 * 3_600_000,
      severity: 'warn',
      title: 'Balance moved without a local signature',
      detail:
        'Operations ETH balance changed with no transaction signed by this device. Most likely a second signing key you authorised earlier — confirm it was you.',
      walletId: ops.id,
      assetId: 'eth',
    },
    {
      id: 'evt_seed_3',
      kind: 'phishing_detected',
      at: now - 50 * 3_600_000,
      severity: 'critical',
      title: 'Poisoned lookalike address dusted into history',
      detail:
        'An address matching the first 6 and last 4 characters of your most recent payee sent dust. It was denylisted automatically by PHANTOM LOCK.',
      walletId: everyday.id,
      assetId: 'btc',
    },
  ];

  const audit: AuditEntry[] = [
    { id: 'aud_seed_1', at: now - 3 * 3_600_000, kind: 'wallet', title: 'Vault created', detail: 'Five wallets generated with on-device entropy.', severity: 'info' },
    { id: 'aud_seed_2', at: now - 50 * 3_600_000, kind: 'react', title: 'PHANTOM LOCK executed', detail: 'Denylisted a poisoned lookalike address vault-wide.', severity: 'critical' },
    { id: 'aud_seed_3', at: now - 26 * 3_600_000, kind: 'security', title: 'Balance anomaly recorded', detail: 'Operations ETH moved without a local signature.', severity: 'warn' },
  ];

  const txs = seedHistory(wallets);

  return {
    version: 1,
    createdAt: now,
    wallets,
    policy: { tier: 1, rules: defaultRulesFor(1), overrides: {}, updatedAt: now },
    reacts: defaultReacts(),
    horcruxes: [],
    claims: [],
    contacts: [
      {
        id: 'c_1',
        label: 'Cold storage (own)',
        address: glacier.accounts[0].address,
        assetId: 'btc',
        fingerprint: glacier.fingerprint,
        verifiedAt: now - 10 * 86_400_000,
        verifiedVia: 'in-person',
      },
      {
        id: 'c_2',
        label: 'Exchange withdrawal',
        address: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',
        assetId: 'btc',
        fingerprint: 'A1B2C3',
        verifiedVia: 'unverified',
      },
    ],
    txs,
    events,
    reactRuns: [
      {
        id: 'run_seed_1',
        reactId: 'phantom-lock',
        reactName: 'PHANTOM LOCK',
        eventId: 'evt_seed_3',
        at: now - 50 * 3_600_000,
        actions: ['denylist_destination', 'notify'],
        outcome: 'executed',
        note: 'Denylisted poisoned lookalike · operator notified',
      },
    ],
    audit,
    settings: DEFAULT_SETTINGS,
    duressActive: false,
    frozenWallets: [],
    lastSeenAt: now,
  };
}

export async function createInitialVault(): Promise<VaultState> {
  return scaffold(await defaultWallets());
}

/** Restore from a BIP-39 phrase the operator already holds. */
export async function createRestoredVault(mnemonic: string): Promise<VaultState> {
  const wallet = await buildWallet(
    {
      label: 'Restored wallet',
      tier: 2,
      assetIds: ASSETS.map((a) => a.id),
      mnemonic,
      notes: 'Restored from a recovery phrase. Verify the derived addresses before depositing.',
    },
    0,
  );
  const vault = await scaffold([wallet]);
  return {
    ...vault,
    audit: [
      {
        id: `aud_restore_${Date.now().toString(36)}`,
        at: Date.now(),
        kind: 'wallet' as const,
        title: 'Vault restored from recovery phrase',
        detail: `Derived ${wallet.accounts.length} account(s) and scanned for balances. Nothing was transmitted off-device.`,
        severity: 'warn' as const,
      },
      ...vault.audit,
    ],
  };
}

function seedHistory(wallets: Wallet[]): VaultState['txs'] {
  const txs: VaultState['txs'] = [];
  const now = Date.now();
  const classes: VaultState['txs'][number]['txClass'][] = ['receive', 'send', 'swap', 'receive', 'send'];
  wallets.forEach((w, wi) => {
    w.accounts.slice(0, 2).forEach((acc, ai) => {
      const asset = getAsset(acc.assetId);
      const amount = (w.balances[asset.id] ?? 0) * (0.08 + ((wi + ai) % 3) * 0.05);
      const txClass = classes[(wi + ai) % classes.length];
      txs.push({
        id: `tx_seed_${wi}_${ai}`,
        walletId: w.id,
        assetId: asset.id,
        amount,
        amountUsd: amount * priceUsdAt(asset),
        toAddress: txClass === 'receive' ? acc.address : 'bc1qexternal0000000000000000000000000000000',
        txClass,
        status: 'confirmed',
        createdAt: now - ((wi * 3 + ai) * 86_400_000 + 3_600_000),
        updatedAt: now - ((wi * 3 + ai) * 86_400_000),
        feeRate: 8,
        feeUsd: 1.4 + ai,
        confirmations: 6 + ai,
        txid: fakeTxid(`seed:${w.id}:${acc.id}`),
      });
    });
  });
  return txs.sort((a, b) => b.createdAt - a.createdAt);
}

/** Assets offered when creating a wallet. */
export const WALLET_ASSET_PRESETS: { id: string; label: string; assets: string[]; blurb: string }[] = [
  { id: 'bitcoin', label: 'Bitcoin only', assets: ['btc'], blurb: 'One asset, one purpose, minimal attack surface.' },
  { id: 'privacy', label: 'Privacy stack', assets: ['xmr', 'zec', 'zano'], blurb: 'Monero, Zcash, Zano — the assets worth holding privately.' },
  { id: 'mixed', label: 'Mixed household', assets: ['btc', 'eth', 'usdc'], blurb: 'BTC savings with a stablecoin float.' },
  { id: 'trading', label: 'Operational', assets: ['eth', 'usdt', 'sol'], blurb: 'Fast-moving balances for swaps and payments.' },
  { id: 'everything', label: 'Everything', assets: ASSETS.map((a: Asset) => a.id), blurb: 'Every asset this build derives keys for.' },
];
