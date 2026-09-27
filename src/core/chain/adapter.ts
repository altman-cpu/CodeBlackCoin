import type { Asset, Settings } from '../types';
import { simulatedBalance, simulatedUtxos, type SimUtxo } from './sim';

/**
 * One interface, two implementations.
 *
 * SimAdapter is deterministic and offline; LiveBitcoinAdapter reads real chain
 * data from a public mempool.space-compatible REST API. Broadcasting is
 * deliberately NOT implemented for the live adapter: constructing and signing a
 * real transaction belongs in an audited library (scure-btc-signer), not in a
 * `fetch` call. Until that lands, live mode is read-only by design.
 */

export interface BalanceResult {
  amount: number;
  amountUsd: number;
  utxos?: SimUtxo[];
  source: 'sim' | 'live';
  /** Populated when a live read fails, so the UI can say so out loud. */
  error?: string;
}

export interface ChainAdapter {
  id: string;
  label: string;
  source: 'sim' | 'live';
  supports(asset: Asset): boolean;
  getBalance(asset: Asset, address: string): Promise<BalanceResult>;
  validate(asset: Asset, address: string): Promise<{ ok: boolean; reason?: string }>;
}

export class SimAdapter implements ChainAdapter {
  id = 'sim';
  label = 'Simulated ledger';
  source = 'sim' as const;

  supports(): boolean {
    return true;
  }

  async getBalance(asset: Asset, address: string): Promise<BalanceResult> {
    const amount = simulatedBalance(address, asset);
    const price = asset.priceUsd;
    return {
      amount,
      amountUsd: amount * price,
      utxos: asset.model === 'utxo' ? simulatedUtxos(address, asset, amount) : undefined,
      source: 'sim',
    };
  }

  async validate(asset: Asset, address: string): Promise<{ ok: boolean; reason?: string }> {
    const { validateAddress } = await import('../keys/derive');
    return validateAddress(asset, address);
  }
}

export class LiveBitcoinAdapter implements ChainAdapter {
  id = 'btc-live';
  label = 'Bitcoin (mempool.space)';
  source = 'live' as const;

  constructor(private endpoint: string = 'https://mempool.space/api') {}

  supports(asset: Asset): boolean {
    return asset.chain === 'btc';
  }

  async getBalance(asset: Asset, address: string): Promise<BalanceResult> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8_000);
      const res = await fetch(`${this.endpoint}/address/${address}`, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        chain_stats: { funded_txo_sum: number; spent_txo_sum: number };
        mempool_stats: { funded_txo_sum: number; spent_txo_sum: number };
      };
      const sats =
        data.chain_stats.funded_txo_sum - data.chain_stats.spent_txo_sum + data.mempool_stats.funded_txo_sum - data.mempool_stats.spent_txo_sum;
      const amount = sats / 1e8;
      return { amount, amountUsd: amount * asset.priceUsd, source: 'live' };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      const fallback = simulatedBalance(address, asset);
      return { amount: fallback, amountUsd: fallback * asset.priceUsd, source: 'live', error };
    }
  }

  async validate(asset: Asset, address: string): Promise<{ ok: boolean; reason?: string }> {
    const { validateAddress } = await import('../keys/derive');
    return validateAddress(asset, address);
  }
}

const sim = new SimAdapter();

export function getAdapter(asset: Asset, settings: Settings): ChainAdapter {
  if (settings.chainMode === 'live' && asset.chain === 'btc' && settings.btcEndpoint) {
    return new LiveBitcoinAdapter(settings.btcEndpoint);
  }
  return sim;
}

export const ADAPTER_LABEL: Record<string, string> = {
  sim: 'Simulated ledger (offline, deterministic)',
  'btc-live': 'Bitcoin mainnet via mempool.space (read-only)',
};
