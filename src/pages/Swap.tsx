import { useCallback, useEffect, useState } from 'react';
import { useVault } from '../state/store';
import { Badge, Button, Callout, Card, Field, Input, Select, useToast } from '../ui/primitives';
import { Icon } from '../ui/icons';
import { ASSETS, ROUTER_ASSET_COUNT, fmtAmount, fmtUsd, getAsset, priceUsdAt } from '../core/assets';
import { getQuotes, swapSummary, type Quote } from '../core/swap/aggregator';
import { TIER_MAP } from '../core/policy/tiers';
import type { Asset } from '../core/types';

export function Swap() {
  const { state, addTx, updateTx, updateWallet, audit } = useVault();
  const toast = useToast();

  const [walletId, setWalletId] = useState('');
  const [fromId, setFromId] = useState('btc');
  const [toId, setToId] = useState('xmr');
  const [amount, setAmount] = useState('');
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(false);
  const [live, setLive] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState<string | null>(null);

  const wallet = state?.wallets.find((w) => w.id === walletId) ?? state?.wallets[0] ?? null;
  const from: Asset = getAsset(fromId);
  const to: Asset = getAsset(toId);
  const balance = wallet ? (wallet.balances[fromId] ?? 0) : 0;
  const amountNum = Number(amount) || 0;

  useEffect(() => {
    if (!walletId && state?.wallets.length) {
      const w = state.wallets.find((x) => x.visibility === 'visible') ?? state.wallets[0];
      setWalletId(w.id);
    }
  }, [state?.wallets, walletId]);

  const refresh = useCallback(async () => {
    if (amountNum <= 0 || fromId === toId) {
      setQuotes([]);
      return;
    }
    setLoading(true);
    try {
      const q = await getQuotes(fromId, toId, amountNum, { liveQuotes: live });
      setQuotes(q);
      setSelectedQuote(q[0]?.id ?? null);
    } finally {
      setLoading(false);
    }
  }, [amountNum, fromId, toId, live]);

  useEffect(() => {
    const t = window.setTimeout(() => void refresh(), 250);
    return () => window.clearTimeout(t);
  }, [refresh]);

  const quote = quotes.find((q) => q.id === selectedQuote) ?? quotes[0] ?? null;
  const summary = quote ? swapSummary(quote, to) : null;

  const execute = () => {
    if (!wallet || !quote || !summary) return;
    if (amountNum > balance) {
      toast('Amount exceeds the wallet balance', 'bad');
      return;
    }
    const tx = addTx({
      walletId: wallet.id,
      assetId: fromId,
      amount: amountNum,
      amountUsd: amountNum * priceUsdAt(from),
      toAddress: quote.providerLabel,
      txClass: 'swap',
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      feeRate: 0,
      feeUsd: quote.totalFeeUsd,
      confirmations: 0,
      txid: '',
      notes: `No-KYC swap via ${quote.providerLabel} → ${fmtAmount(summary.netToAmount, to)} ${to.symbol}`,
    });
    audit({
      at: Date.now(),
      kind: 'swap',
      title: `Swap routed via ${quote.providerLabel}`,
      detail: `${fmtAmount(amountNum, from)} ${from.symbol} → ${fmtAmount(summary.netToAmount, to)} ${to.symbol}. No account, no KYC, ${quote.live ? 'live quote' : 'modelled quote'}.`,
      severity: 'info',
    });
    window.setTimeout(() => {
      updateTx(tx.id, { status: 'confirmed', confirmations: 1, updatedAt: Date.now(), txid: `0x${Math.random().toString(16).slice(2, 18)}` });
      const newBalances = { ...wallet.balances, [fromId]: Math.max(0, balance - amountNum) };
      newBalances[toId] = (newBalances[toId] ?? 0) + summary.netToAmount;
      updateWallet(wallet.id, { balances: newBalances });
      toast(`Swapped into ${fmtAmount(summary.netToAmount, to)} ${to.symbol}`, 'ok');
    }, 1600);
  };

  if (!state || !wallet) return null;

  return (
    <div className="grid side-main">
      <Card title="No-KYC swap" subtitle="Accountless providers, ranked by what actually lands" icon="swap">
        <div className="stack">
          <Field label="From wallet">
            <Select
              value={walletId}
              onChange={setWalletId}
              options={state.wallets
                .filter((w) => w.visibility !== 'hidden')
                .map((w) => ({ value: w.id, label: `${w.label} · T${w.tier} ${TIER_MAP[w.tier].codename}` }))}
            />
          </Field>

          <div className="grid g2">
            <Field label="You send">
              <Select
                value={fromId}
                onChange={setFromId}
                options={ASSETS.filter((a) => a.family !== 'sim').map((a) => ({ value: a.id, label: `${a.symbol} — ${a.name}` }))}
              />
              <Input mono value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" inputMode="decimal" />
              <div className="help row between">
                <span>Available {fmtAmount(balance, from)} {from.symbol}</span>
                <button className="btn ghost sm" onClick={() => setAmount(String(balance))} type="button">Max</button>
              </div>
            </Field>

            <Field label="You receive">
              <Select
                value={toId}
                onChange={setToId}
                options={ASSETS.map((a) => ({ value: a.id, label: `${a.symbol} — ${a.name}` }))}
              />
              <div className="input mono" style={{ background: '#0b0e13', color: 'var(--text-2)' }}>
                {summary ? fmtAmount(summary.netToAmount, to) : '0.00'}
              </div>
              <div className="help">
                {summary ? `After ${fmtUsd(quote?.totalFeeUsd ?? 0)} of fees (${summary.feePct.toFixed(2)}%)` : `${ROUTER_ASSET_COUNT}+ assets routable`}
              </div>
            </Field>
          </div>

          <div className="row between">
            <button className="btn ghost sm" onClick={() => { setFromId(toId); setToId(fromId); }} type="button">
              <Icon name="swap" size={13} /> Flip
            </button>
            <label className="row tiny muted" style={{ gap: 8 }}>
              <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
              Fetch live THORChain quotes
            </label>
          </div>

          {live && (
            <Callout tone="warn" icon="globe">
              Live quotes call a public THORChain endpoint directly from your browser. That reveals your IP and the pair
              you are pricing to that endpoint — not your identity, but not nothing either. Leave it off unless you need
              a real number.
            </Callout>
          )}

          {fromId === toId && <Callout tone="warn" icon="alert">Pick two different assets.</Callout>}

          <Button variant="primary" block icon="swap" loading={loading} disabled={!quote || amountNum <= 0 || amountNum > balance} onClick={execute}>
            {quote ? `Swap via ${quote.providerLabel}` : 'No route for this pair'}
          </Button>

          {amountNum > balance && (
            <div className="tiny" style={{ color: 'var(--bad)' }}>Amount exceeds this wallet's {from.symbol} balance.</div>
          )}
        </div>
      </Card>

      <div className="stack">
        <Card
          title="Routes"
          subtitle={quotes.length ? `${quotes.length} provider(s) · best net output first` : 'Enter an amount to quote'}
          icon="filter"
        >
          {quotes.length === 0 ? (
            <div className="small muted">
              Quotes are ranked by net output after network and partner fees, not by headline rate. Privacy-route
              providers are flagged when either side of the pair is a shielded asset.
            </div>
          ) : (
            <div className="stack sm">
              {quotes.map((q) => {
                const best = q.id === quotes[0].id;
                const sel = q.id === selectedQuote;
                return (
                  <button
                    key={q.id}
                    onClick={() => setSelectedQuote(q.id)}
                    className="stack sm"
                    style={{
                      padding: '12px',
                      borderRadius: 10,
                      textAlign: 'left',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      color: 'var(--text)',
                      border: `1px solid ${sel ? 'rgba(52,211,153,0.45)' : 'var(--line-soft)'}`,
                      background: sel ? 'rgba(52,211,153,0.06)' : 'var(--panel-2)',
                    }}
                  >
                    <div className="row between">
                      <span className="row" style={{ gap: 8 }}>
                        <span className="small strong">{q.providerLabel}</span>
                        {best && <Badge tone="ok" icon="spark">best</Badge>}
                        {q.live && <Badge tone="info" icon="globe">live</Badge>}
                        {q.privacy === 'private' && <Badge tone="violet" icon="moon">private route</Badge>}
                      </span>
                      <span className="mono small strong">{fmtAmount(q.toAmount, to)} {to.symbol}</span>
                    </div>
                    <div className="row between">
                      <span className="tiny muted">
                        {fmtUsd(q.totalFeeUsd)} fees · ~{q.etaMin} min
                      </span>
                      <span className="tiny muted mono">
                        1 {from.symbol} = {q.rate.toFixed(6)} {to.symbol}
                      </span>
                    </div>
                    <div className="tiny dim">{q.note}</div>
                  </button>
                );
              })}
            </div>
          )}
        </Card>

        {quote && summary && (
          <Card title="Route detail" icon="info">
            <div className="stack sm">
              <div className="row between">
                <span className="tiny muted">Rate</span>
                <span className="mono small">1 {from.symbol} = {quote.rate.toFixed(8)} {to.symbol}</span>
              </div>
              <div className="row between">
                <span className="tiny muted">Network fee</span>
                <span className="mono small">{fmtUsd(quote.networkFeeUsd)}</span>
              </div>
              <div className="row between">
                <span className="tiny muted">Provider fee</span>
                <span className="mono small">{fmtUsd(quote.partnerFeeUsd)}</span>
              </div>
              <div className="row between">
                <span className="tiny muted">KYC</span>
                <Badge tone="ok" icon="shield-check">none · no account</Badge>
              </div>
              <div className="row between">
                <span className="tiny muted">Privacy</span>
                <Badge tone={quote.privacy === 'private' ? 'violet' : 'default'} icon={quote.privacy === 'private' ? 'moon' : 'eye'}>
                  {quote.privacy}
                </Badge>
              </div>
              <div className="divider" />
              <div className="row between">
                <span className="small strong">You receive</span>
                <span className="mono small strong">{fmtAmount(summary.netToAmount, to)} {to.symbol}</span>
              </div>
            </div>
          </Card>
        )}

        <Card title="Why no-KYC matters here" icon="shield">
          <div className="small muted" style={{ lineHeight: 1.65 }}>
            Every provider surfaced here is accountless: no sign-up, no identity document, no order history tied to a
            person. That does not make a swap invisible — chain analysis still exists — but it means the swap itself does
            not create a permanent record of who you are next to what you hold. For privacy assets, prefer the routes
            flagged <em>private</em>: they are the ones that will not publish your business to a counterparty with a
            compliance department.
          </div>
        </Card>
      </div>
    </div>
  );
}
