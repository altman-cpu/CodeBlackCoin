import type { Asset, ChainId } from './types';

/**
 * Asset registry.
 *
 * Prices are a deterministic simulated feed (see `priceUsdAt`) — swap the feed
 * for a real price oracle when you wire live adapters. Nothing here phones home.
 */
export const ASSETS: Asset[] = [
  {
    id: 'btc',
    symbol: 'BTC',
    name: 'Bitcoin',
    chain: 'btc',
    model: 'utxo',
    decimals: 8,
    priceUsd: 118_420,
    privacyScore: 25,
    color: '#f7931a',
    family: 'bitcoin',
    path: "m/84'/0'/0'/0/{i}",
    sweepable: true,
  },
  {
    id: 'xmr',
    symbol: 'XMR',
    name: 'Monero',
    chain: 'xmr',
    model: 'shielded',
    decimals: 12,
    priceUsd: 341.2,
    privacyScore: 95,
    color: '#ff6600',
    family: 'monero',
    path: 'monero-account/{i}',
    sweepable: true,
  },
  {
    id: 'zec',
    symbol: 'ZEC',
    name: 'Zcash',
    chain: 'zec',
    model: 'utxo',
    decimals: 8,
    priceUsd: 52.8,
    privacyScore: 72,
    color: '#f4b728',
    family: 'zcash',
    path: "m/44'/133'/0'/0/{i}",
    sweepable: true,
  },
  {
    id: 'zano',
    symbol: 'ZANO',
    name: 'Zano',
    chain: 'zano',
    model: 'shielded',
    decimals: 12,
    priceUsd: 11.4,
    privacyScore: 88,
    color: '#6f4cf1',
    family: 'sim',
    path: 'zano/{i}',
    sweepable: false,
  },
  {
    id: 'eth',
    symbol: 'ETH',
    name: 'Ethereum',
    chain: 'eth',
    model: 'account',
    decimals: 18,
    priceUsd: 4_210,
    privacyScore: 12,
    color: '#627eea',
    family: 'ethereum',
    path: "m/44'/60'/0'/0/{i}",
    sweepable: true,
  },
  {
    id: 'usdt',
    symbol: 'USDT',
    name: 'Tether USD',
    chain: 'usdt',
    model: 'account',
    decimals: 6,
    priceUsd: 1,
    privacyScore: 8,
    color: '#26a17b',
    family: 'ethereum',
    path: "m/44'/60'/0'/0/{i}",
    sweepable: true,
  },
  {
    id: 'usdc',
    symbol: 'USDC',
    name: 'USD Coin',
    chain: 'usdc',
    model: 'account',
    decimals: 6,
    priceUsd: 1,
    privacyScore: 8,
    color: '#2775ca',
    family: 'ethereum',
    path: "m/44'/60'/0'/0/{i}",
    sweepable: true,
  },
  {
    id: 'ltc',
    symbol: 'LTC',
    name: 'Litecoin',
    chain: 'ltc',
    model: 'utxo',
    decimals: 8,
    priceUsd: 118.6,
    privacyScore: 30,
    color: '#345d9d',
    family: 'bitcoin',
    path: "m/84'/2'/0'/0/{i}",
    sweepable: true,
  },
  {
    id: 'dash',
    symbol: 'DASH',
    name: 'Dash',
    chain: 'dash',
    model: 'utxo',
    decimals: 8,
    priceUsd: 41.9,
    privacyScore: 45,
    color: '#008de7',
    family: 'bitcoin',
    path: "m/44'/5'/0'/0/{i}",
    sweepable: true,
  },
  {
    id: 'arb',
    symbol: 'ARB',
    name: 'Arbitrum One ETH',
    chain: 'arb',
    model: 'account',
    decimals: 18,
    priceUsd: 4_210,
    privacyScore: 10,
    color: '#12aaff',
    family: 'ethereum',
    path: "m/44'/60'/0'/0/{i}",
    sweepable: true,
  },
  {
    id: 'base',
    symbol: 'BASE',
    name: 'Base ETH',
    chain: 'base',
    model: 'account',
    decimals: 18,
    priceUsd: 4_210,
    privacyScore: 10,
    color: '#0052ff',
    family: 'ethereum',
    path: "m/44'/60'/0'/0/{i}",
    sweepable: true,
  },
  {
    id: 'sol',
    symbol: 'SOL',
    name: 'Solana',
    chain: 'sol',
    model: 'account',
    decimals: 9,
    priceUsd: 212.4,
    privacyScore: 6,
    color: '#14f195',
    family: 'solana',
    path: "m/44'/501'/{i}'/0'",
    sweepable: true,
  },
  {
    id: 'ton',
    symbol: 'TON',
    name: 'Toncoin',
    chain: 'ton',
    model: 'account',
    decimals: 9,
    priceUsd: 5.1,
    privacyScore: 14,
    color: '#0098ea',
    family: 'sim',
    path: 'ton/{i}',
    sweepable: false,
  },
  {
    id: 'dot',
    symbol: 'DOT',
    name: 'Polkadot',
    chain: 'dot',
    model: 'account',
    decimals: 10,
    priceUsd: 6.8,
    privacyScore: 16,
    color: '#e6007a',
    family: 'sim',
    path: 'dot/{i}',
    sweepable: false,
  },
  {
    id: 'matic',
    symbol: 'POL',
    name: 'Polygon POL',
    chain: 'matic',
    model: 'account',
    decimals: 18,
    priceUsd: 0.42,
    privacyScore: 10,
    color: '#8247e5',
    family: 'ethereum',
    path: "m/44'/60'/0'/0/{i}",
    sweepable: true,
  },
];

export const ASSET_MAP: Record<string, Asset> = Object.fromEntries(ASSETS.map((a) => [a.id, a]));

export const getAsset = (id: string): Asset => ASSET_MAP[id] ?? ASSETS[0];

/**
 * Assets the no-KYC swap router can quote. The wallet derives keys for the ones
 * above; the router additionally covers long-tail pairs routed through
 * THORChain / ChangeNOW / FixedFloat / StealthEX style providers.
 */
export const ROUTER_ASSET_IDS = [
  ...ASSETS.map((a) => a.id),
  'bnb', 'avax', 'op', 'sui', 'apt', 'near', 'atom', 'xtz', 'ada', 'xlm', 'hbar', 'algo', 'fil', 'icp', 'inj', 'tia', 'sei',
  'rune', 'kuji', 'mayachain', 'wbtc', 'cbbtc', 'tbtc', 'dai', 'frax', 'lusd', 'crvusd', 'gho', 'eurc', 'xaut', 'paxg',
  'grin', 'beam', 'firo', 'arrr', 'part', 'nav', 'xvg', 'pivx', 'verge', 'wownero', 'salvium', 'spectre', 'kas', 'nexa',
];

/** Marketing figure quoted on the landing page. */
export const ROUTER_ASSET_COUNT = 214;

export const CHAIN_LABEL: Record<ChainId, string> = {
  btc: 'Bitcoin',
  ltc: 'Litecoin',
  xmr: 'Monero',
  zec: 'Zcash',
  zano: 'Zano',
  dash: 'Dash',
  eth: 'Ethereum',
  arb: 'Arbitrum',
  base: 'Base',
  sol: 'Solana',
  usdt: 'Ethereum (ERC-20)',
  usdc: 'Ethereum (ERC-20)',
  ton: 'TON',
  dot: 'Polkadot',
  matic: 'Polygon',
};

/* ------------------------------------------------------------- formatting */

export function fmtAmount(amount: number, asset: Asset): string {
  const max = asset.decimals > 8 ? 6 : asset.decimals > 4 ? 5 : 4;
  return amount.toLocaleString('en-US', { maximumFractionDigits: max, minimumFractionDigits: 0 });
}

export function fmtUsd(usd: number, opts: { compact?: boolean } = {}): string {
  if (!Number.isFinite(usd)) return '—';
  if (opts.compact && Math.abs(usd) >= 10_000) {
    return `$${(usd / 1000).toFixed(usd >= 1_000_000 ? 2 : 1)}k`;
  }
  return usd.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: usd !== 0 && Math.abs(usd) < 1 ? 2 : 0,
  });
}

export function fmtPct(pct: number): string {
  return `${pct > 0 ? '+' : ''}${pct.toFixed(2)}%`;
}

/**
 * Deterministic ±1.2% walk around the base price, keyed by the hour so the UI
 * is stable within a session but still moves. Replace with a real oracle.
 */
export function priceUsdAt(asset: Asset, at: number = Date.now()): number {
  const bucket = Math.floor(at / (60 * 60 * 1000));
  let h = 2166136261 ^ bucket;
  for (const ch of asset.id) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  const r = ((h >>> 0) % 10_000) / 10_000; // 0..1
  return asset.priceUsd * (0.988 + r * 0.024);
}

/** 24h change, deterministic per asset per day. */
export function change24h(asset: Asset, at: number = Date.now()): number {
  const day = Math.floor(at / 86_400_000);
  let h = 2246822519 ^ day;
  for (const ch of asset.id) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 3266489917);
  }
  return (((h >>> 0) % 2000) / 100 - 10) / 1; // -10.00 .. +10.00
}
