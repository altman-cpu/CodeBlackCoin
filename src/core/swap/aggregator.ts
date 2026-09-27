import type { Asset } from '../types';
import { getAsset, priceUsdAt } from '../assets';

/**
 * No-KYC swap aggregation.
 *
 * Providers are ranked by net output after fees. Privacy-route coins (XMR, ZEC,
 * Zano) are flagged because the whole point of holding them is not to publish
 * your business to a counterparty that keeps records.
 *
 * THORChain quotes are fetched live when `liveQuotes` is enabled and the pair is
 * supported; every other provider is quoted from a deterministic model so the UI
 * is fully explorable offline. No provider here creates an account, and none is
 * sent anything that identifies you.
 */

export type PrivacyTier = 'standard' | 'private';

export interface Quote {
  id: string;
  providerId: string;
  providerLabel: string;
  fromAssetId: string;
  toAssetId: string;
  fromAmount: number;
  toAmount: number;
  rate: number;
  networkFeeUsd: number;
  partnerFeeUsd: number;
  totalFeeUsd: number;
  etaMin: number;
  kyc: 'none';
  privacy: PrivacyTier;
  minAmount: number;
  maxAmount: number;
  expiresAt: number;
  /** True when the number came from a live endpoint rather than the model. */
  live: boolean;
  note: string;
}

export interface Provider {
  id: string;
  label: string;
  blurb: string;
  /** Assets this provider cannot route. */
  excludes?: string[];
  privacy: PrivacyTier;
  partnerFeePct: number;
  networkFeeUsd: number;
  etaMin: number;
  spreadPct: number;
  minUsd: number;
  maxUsd: number;
  live?: (from: Asset, to: Asset, amount: number) => Promise<Partial<Quote> | null>;
}

export const PROVIDERS: Provider[] = [
  {
    id: 'thorchain',
    label: 'THORChain',
    blurb: 'Decentralised, no accounts, native cross-chain. Your coins never become an IOU.',
    excludes: ['xmr', 'zano'],
    privacy: 'standard',
    partnerFeePct: 0,
    networkFeeUsd: 3.2,
    etaMin: 12,
    spreadPct: 0.15,
    minUsd: 25,
    maxUsd: 2_000_000,
    live: thorchainQuote,
  },
  {
    id: 'changenow',
    label: 'ChangeNOW',
    blurb: 'No-account exchange, fixed or floating rate. Broad long-tail coverage.',
    privacy: 'standard',
    partnerFeePct: 0.5,
    networkFeeUsd: 2.4,
    etaMin: 15,
    spreadPct: 0.65,
    minUsd: 15,
    maxUsd: 500_000,
  },
  {
    id: 'fixedfloat',
    label: 'FixedFloat',
    blurb: 'Fixed-rate swaps. No registration, supports Monero routes.',
    privacy: 'private',
    partnerFeePct: 0.5,
    networkFeeUsd: 2.9,
    etaMin: 18,
    spreadPct: 0.45,
    minUsd: 20,
    maxUsd: 250_000,
  },
  {
    id: 'stealthex',
    label: 'StealthEX',
    blurb: 'Accountless swaps with a privacy-coin focus; no order history tied to an identity.',
    privacy: 'private',
    partnerFeePct: 0.4,
    networkFeeUsd: 3.6,
    etaMin: 22,
    spreadPct: 0.8,
    minUsd: 20,
    maxUsd: 300_000,
  },
  {
    id: 'haveno',
    label: 'Haveno-style P2P',
    blurb: 'Peer-to-peer Monero market. Slowest, and the only route with no counterparty holding your coins at all.',
    excludes: ['eth', 'usdt', 'usdc', 'arb', 'base', 'sol', 'matic'],
    privacy: 'private',
    partnerFeePct: 0.9,
    networkFeeUsd: 1.1,
    etaMin: 240,
    spreadPct: 1.4,
    minUsd: 50,
    maxUsd: 50_000,
  },
];

const PRIVACY_ASSETS = new Set(['xmr', 'zec', 'zano']);

const THOR_ASSET: Record<string, string> = {
  btc: 'BTC.BTC',
  eth: 'ETH.ETH',
  ltc: 'LTC.LTC',
  usdt: 'ETH.USDT-0xdac17f958d2ee523a2206206994597c13d831ec7',
  usdc: 'ETH.USDC-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
};

async function thorchainQuote(from: Asset, to: Asset, amount: number): Promise<Partial<Quote> | null> {
  const fromAsset = THOR_ASSET[from.id];
  const toAsset = THOR_ASSET[to.id];
  if (!fromAsset || !toAsset) return null;
  try {
    const units = Math.round(amount * 1e8);
    if (units <= 0) return null;
    const url = `https://thornode.ninerealms.com/thorchain/quote/swap?from_asset=${fromAsset}&to_asset=${toAsset}&amount=${units}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json()) as { expected_amount_out?: string; fees?: { total?: string } };
    const out = Number(data.expected_amount_out ?? '0') / 1e8;
    if (!Number.isFinite(out) || out <= 0) return null;
    return { toAmount: out, live: true, note: 'Live THORChain quote' };
  } catch {
    return null;
  }
}

function supports(provider: Provider, from: Asset, to: Asset): boolean {
  if (from.id === to.id) return false;
  if (provider.excludes?.includes(from.id)) return false;
  if (provider.excludes?.includes(to.id)) return false;
  return true;
}

export async function getQuotes(
  fromAssetId: string,
  toAssetId: string,
  amount: number,
  opts: { liveQuotes?: boolean; now?: number } = {},
): Promise<Quote[]> {
  const from = getAsset(fromAssetId);
  const to = getAsset(toAssetId);
  const now = opts.now ?? Date.now();
  if (from.id === to.id || amount <= 0) return [];

  const fromPrice = priceUsdAt(from, now);
  const toPrice = priceUsdAt(to, now);
  const usdValue = amount * fromPrice;
  const isPrivateRoute = PRIVACY_ASSETS.has(from.id) || PRIVACY_ASSETS.has(to.id);

  const quotes: Quote[] = [];
  for (const provider of PROVIDERS) {
    if (!supports(provider, from, to)) continue;
    if (usdValue < provider.minUsd || usdValue > provider.maxUsd) continue;

    const rate = (fromPrice / toPrice) * (1 - provider.spreadPct / 100);
    const toAmount = amount * rate;
    const partnerFeeUsd = (provider.partnerFeePct / 100) * usdValue;
    const networkFeeUsd = provider.networkFeeUsd * (isPrivateRoute ? 1.15 : 1);
    const id = `${provider.id}-${from.id}-${to.id}`;

    let live = false;
    let finalToAmount = toAmount;
    let note = provider.privacy === 'private' ? 'No account, no order book tied to your identity' : 'No account required';

    if (opts.liveQuotes && provider.live) {
      const liveData = await provider.live(from, to, amount);
      if (liveData?.toAmount) {
        finalToAmount = liveData.toAmount;
        live = true;
        note = liveData.note ?? 'Live quote';
      }
    }

    quotes.push({
      id,
      providerId: provider.id,
      providerLabel: provider.label,
      fromAssetId: from.id,
      toAssetId: to.id,
      fromAmount: amount,
      toAmount: finalToAmount,
      rate: finalToAmount / amount,
      networkFeeUsd,
      partnerFeeUsd: partnerFeeUsd,
      totalFeeUsd: networkFeeUsd + partnerFeeUsd,
      etaMin: provider.etaMin,
      kyc: 'none',
      privacy: isPrivateRoute && provider.privacy === 'private' ? 'private' : provider.privacy,
      minAmount: provider.minUsd / fromPrice,
      maxAmount: provider.maxUsd / fromPrice,
      expiresAt: now + 60_000,
      live,
      note,
    });
  }

  // Rank by what actually lands in the destination, minus every fee.
  return quotes.sort((a, b) => {
    const netA = a.toAmount * toPrice - a.totalFeeUsd;
    const netB = b.toAmount * toPrice - b.totalFeeUsd;
    return netB - netA;
  });
}

/** Best quote, or null when the pair is unsupported. */
export function bestQuote(quotes: Quote[]): Quote | null {
  return quotes[0] ?? null;
}

export function swapSummary(quote: Quote, toAsset: Asset): { netToAmount: number; netUsd: number; feePct: number } {
  const toPrice = priceUsdAt(toAsset);
  const grossUsd = quote.toAmount * toPrice;
  const netUsd = grossUsd - quote.totalFeeUsd;
  return {
    netToAmount: netUsd / toPrice,
    netUsd,
    feePct: grossUsd > 0 ? (quote.totalFeeUsd / grossUsd) * 100 : 0,
  };
}
