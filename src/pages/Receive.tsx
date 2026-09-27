import { useEffect, useMemo, useState } from 'react';
import { useVault } from '../state/store';
import { Badge, Button, Callout, Card, CopyText, Field, Select } from '../ui/primitives';
import { Icon } from '../ui/icons';
import { getAsset, fmtAmount } from '../core/assets';
import { TIER_MAP } from '../core/policy/tiers';

/**
 * Deterministic placeholder pattern standing in for a QR encoder. A production
 * build should encode the address with a real QR library; we would rather show an
 * obviously-labelled placeholder than something that looks scannable and isn't.
 */
function PlaceholderQr({ seed }: { seed: string }) {
  const cells = useMemo(() => {
    let h = 2166136261;
    for (const ch of seed) {
      h ^= ch.charCodeAt(0);
      h = Math.imul(h, 16777619);
    }
    const out: boolean[] = [];
    for (let i = 0; i < 441; i++) {
      h ^= h << 13;
      h ^= h >>> 17;
      h ^= h << 5;
      out.push(((h >>> 0) & 1) === 1);
    }
    return out;
  }, [seed]);

  const N = 21;
  return (
    <div style={{ display: 'grid', gap: 6, justifyItems: 'center' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${N}, 6px)`,
          gridTemplateRows: `repeat(${N}, 6px)`,
          gap: 0,
          padding: 8,
          background: '#fff',
          borderRadius: 10,
        }}
        aria-label="QR placeholder"
      >
        {cells.map((on, i) => (
          <span key={i} style={{ background: on ? '#04070a' : '#fff', width: 6, height: 6 }} />
        ))}
      </div>
      <span className="tiny dim">QR encoding not bundled in this build — scan the address text below</span>
    </div>
  );
}

export function Receive() {
  const { state, rotateAddresses, audit } = useVault();
  const [walletId, setWalletId] = useState('');
  const [assetId, setAssetId] = useState('btc');

  useEffect(() => {
    if (!walletId && state?.wallets.length) {
      const w = state.wallets.find((x) => x.visibility === 'visible') ?? state.wallets[0];
      setWalletId(w.id);
      if (w.accounts[0]) setAssetId(w.accounts[0].assetId);
    }
  }, [state?.wallets, walletId]);

  const wallet = state?.wallets.find((w) => w.id === walletId) ?? state?.wallets[0] ?? null;
  const account = wallet?.accounts.filter((a) => a.assetId === assetId).slice(-1)[0] ?? null;
  const asset = account ? getAsset(account.assetId) : getAsset(assetId);
  const unusable = account ? asset.family === 'sim' : false;

  if (!state || !wallet) return null;

  return (
    <div className="grid side-main">
      <Card title="Receive" subtitle="A fresh address every time, derived on-device" icon="receive">
        <div className="stack">
          <Field label="Wallet">
            <Select
              value={walletId}
              onChange={(v) => {
                setWalletId(v);
                const w = state.wallets.find((x) => x.id === v);
                if (w?.accounts[0]) setAssetId(w.accounts[0].assetId);
              }}
              options={state.wallets
                .filter((w) => w.visibility !== 'hidden')
                .map((w) => ({ value: w.id, label: `${w.label} · T${w.tier} ${TIER_MAP[w.tier].codename}` }))}
            />
          </Field>
          <Field label="Asset">
            <Select
              value={assetId}
              onChange={setAssetId}
              options={wallet.accounts.map((a) => ({ value: a.assetId, label: `${getAsset(a.assetId).symbol} — ${getAsset(a.assetId).name}` }))}
            />
          </Field>

          {account && !unusable && (
            <div className="center stack" style={{ gap: 14, padding: '8px 0' }}>
              <PlaceholderQr seed={account.address} />
              <div className="stack sm" style={{ gap: 6, width: '100%' }}>
                <div className="tiny muted">Address</div>
                <div
                  className="mono small wrap-any"
                  style={{ padding: '10px 12px', background: '#080a0d', border: '1px solid var(--line)', borderRadius: 8, lineHeight: 1.6 }}
                >
                  {account.address}
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <CopyText value={account.address} display="Copy address" mono={false} />
                  <Badge tone="ok" icon="check">derived locally</Badge>
                </div>
              </div>
            </div>
          )}

          {unusable && (
            <Callout tone="bad" icon="alert">
              This build has no address derivation for {asset.symbol}, so it will not show a deposit address. Sending
              funds to a fake address loses them permanently. Add a derivation implementation (or a full node adapter)
              before using this asset for real money.
            </Callout>
          )}

          {account && (
            <div className="row" style={{ gap: 8 }}>
              <Button
                size="sm"
                icon="refresh"
                onClick={async () => {
                  await rotateAddresses(wallet.id);
                  audit({
                    at: Date.now(),
                    kind: 'wallet',
                    title: 'Receiving address rotated',
                    detail: `${wallet.label} — a fresh ${asset.symbol} address is now active.`,
                    severity: 'info',
                  });
                }}
              >
                Get a fresh address
              </Button>
            </div>
          )}
        </div>
      </Card>

      <div className="stack">
        <Card title="Verification" subtitle="Confirm the address on a second screen before you trust it" icon="shield-check">
          <div className="stack sm">
            <div className="row between">
              <span className="tiny muted">Fingerprint</span>
              <span className="mono small strong">{wallet.fingerprint}</span>
            </div>
            <div className="row between">
              <span className="tiny muted">Derivation path</span>
              <span className="mono small">{account?.hdPath ?? '—'}</span>
            </div>
            <div className="row between">
              <span className="tiny muted">Family</span>
              <Badge tone={unusable ? 'bad' : 'ok'}>{asset.family}</Badge>
            </div>
            <div className="row between">
              <span className="tiny muted">Balance</span>
              <span className="mono small">{fmtAmount(wallet.balances[assetId] ?? 0, asset)} {asset.symbol}</span>
            </div>
            <Callout tone="ok" icon="info">
              Never reuse an address. Every receive here uses a freshly derived one, and the rotation react can issue new
              addresses automatically if you suspect an address has been linked to you.
            </Callout>
          </div>
        </Card>

        <Card title="Address history" subtitle="Rotated addresses stay valid; they are just no longer advertised" icon="clock">
          {wallet.accounts.length === 0 ? (
            <div className="small muted">No accounts yet.</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Address</th>
                  <th className="right">Index</th>
                </tr>
              </thead>
              <tbody>
                {wallet.accounts.map((a) => (
                  <tr key={a.id}>
                    <td className="small strong">{getAsset(a.assetId).symbol}</td>
                    <td>
                      <CopyText value={a.address} display={`${a.address.slice(0, 12)}…${a.address.slice(-6)}`} />
                      {a.rotatedFrom && (
                        <div className="tiny muted">
                          <Icon name="refresh" size={10} /> rotated
                        </div>
                      )}
                    </td>
                    <td className="right mono small muted">{a.index}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}
