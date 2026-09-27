import { useMemo } from 'react';
import { useVault } from '../state/store';
import { Badge, Button, Card, Empty, Maskable, Meter, Ring, Stat, TierBadge, Callout } from '../ui/primitives';
import { Icon } from '../ui/icons';
import { getAsset, fmtAmount, fmtUsd, fmtPct, priceUsdAt } from '../core/assets';
import { TIER_MAP } from '../core/policy/tiers';
import { postureReport } from '../core/security/posture';
import type { TierId } from '../core/types';

export function Dashboard({ onNavigate }: { onNavigate: (page: string) => void }) {
  const { state, totals, injectEvent, ackEvent, duress } = useVault();

  const posture = useMemo(() => (state ? postureReport(state) : null), [state]);
  const recentEvents = state?.events.slice(0, 5) ?? [];
  const recentTxs = state?.txs.slice(0, 6) ?? [];
  const changePct = totals.totalUsd > 0 ? (totals.change24hUsd / totals.totalUsd) * 100 : 0;

  if (!state) return null;

  return (
    <div className="stack">
      {duress && (
        <Callout tone="bad" icon="skull">
          Duress view active. Only decoy wallets are shown, and nothing you do here is written to the visible audit log.
          Real wallets remain encrypted and frozen.
        </Callout>
      )}

      <div className="grid g4">
        <Card>
          <Stat
            k="Total held"
            v={<Maskable hidden={state.settings.hideBalances}>{fmtUsd(totals.totalUsd)}</Maskable>}
            sub={
              <span style={{ color: changePct >= 0 ? 'var(--ok)' : 'var(--bad)' }}>
                {fmtPct(changePct)} · 24h
              </span>
            }
          />
        </Card>
        <Card>
          <Stat
            k="Privacy-held"
            v={fmtUsd(totals.privacyUsd)}
            sub={`${totals.totalUsd > 0 ? Math.round((totals.privacyUsd / totals.totalUsd) * 100) : 0}% in shielded assets`}
          />
        </Card>
        <Card>
          <div className="row" style={{ gap: 14 }}>
            <Ring value={posture?.score ?? 0} size={62} stroke={6} tone={(posture?.score ?? 0) >= 72 ? 'var(--ok)' : (posture?.score ?? 0) >= 50 ? 'var(--warn)' : 'var(--bad)'}>
              <div className="center">
                <div className="mono strong" style={{ fontSize: 16 }}>{posture?.score}</div>
                <div className="tiny muted">{posture?.grade}</div>
              </div>
            </Ring>
            <div style={{ minWidth: 0 }}>
              <div className="k tiny muted" style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}>Security posture</div>
              <div className="small strong">{posture?.label}</div>
              <button className="btn ghost sm" style={{ paddingLeft: 0 }} onClick={() => onNavigate('security')}>
                Review checks <Icon name="chevron-right" size={12} />
              </button>
            </div>
          </div>
        </Card>
        <Card>
          <Stat
            k="Watchtower"
            v={
              <span className="row" style={{ gap: 8 }}>
                {state.events.filter((e) => !e.acknowledged).length}
                <span className="tiny muted" style={{ fontWeight: 400 }}>open events</span>
              </span>
            }
            sub={
              <span className="row" style={{ gap: 6 }}>
                <span className={`dotmark ${state.settings.watchtower ? 'ok' : 'muted'} pulse`} />
                {state.settings.watchtower ? 'Monitoring' : 'Paused'}
              </span>
            }
          />
        </Card>
      </div>

      <div className="grid main-side">
        <Card title="Allocation" subtitle="What you hold, priced live" icon="coins">
          {totals.byAsset.length === 0 ? (
            <Empty icon="coins" title="No balances yet" />
          ) : (
            <div className="stack">
              <div className="bars">
                {totals.byAsset.map((a) => {
                  const asset = getAsset(a.assetId);
                  const pct = totals.totalUsd > 0 ? (a.usd / totals.totalUsd) * 100 : 0;
                  return <span key={a.assetId} style={{ width: `${pct}%`, background: asset.color }} title={`${asset.symbol} ${pct.toFixed(1)}%`} />;
                })}
              </div>
              <div className="stack sm">
                {totals.byAsset.slice(0, 7).map((a) => {
                  const asset = getAsset(a.assetId);
                  const pct = totals.totalUsd > 0 ? (a.usd / totals.totalUsd) * 100 : 0;
                  return (
                    <div key={a.assetId} className="row" style={{ gap: 10 }}>
                      <div style={{ width: 60 }} className="small strong">{asset.symbol}</div>
                      <div style={{ flex: 1 }}>
                        <Meter value={pct} tone={asset.color} />
                      </div>
                      <div style={{ width: 96 }} className="right small mono">
                        <Maskable hidden={state.settings.hideBalances}>{fmtAmount(a.amount, asset)}</Maskable>
                      </div>
                      <div style={{ width: 92 }} className="right small mono muted">
                        <Maskable hidden={state.settings.hideBalances}>{fmtUsd(a.usd, { compact: true })}</Maskable>
                      </div>
                      <div style={{ width: 48 }} className="right tiny muted">{pct.toFixed(1)}%</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Card>

        <Card title="By tier" subtitle="How much sits behind each policy" icon="sliders">
          <div className="stack">
            {totals.byTier.map((t) => {
              const tier = TIER_MAP[t.tier as TierId];
              const pct = totals.totalUsd > 0 ? (t.usd / totals.totalUsd) * 100 : 0;
              return (
                <div key={t.tier} className="stack sm">
                  <div className="row between">
                    <span className="row" style={{ gap: 8 }}>
                      <TierBadge tier={t.tier} label={tier?.codename} />
                      <span className="tiny muted">{tier?.name}</span>
                    </span>
                    <span className="small mono">
                      <Maskable hidden={state.settings.hideBalances}>{fmtUsd(t.usd, { compact: true })}</Maskable>
                    </span>
                  </div>
                  <Meter value={pct} tone={tier?.color} />
                </div>
              );
            })}
            {totals.byTier.length === 0 && <Empty icon="layers" title="No wallets" />}
            <div className="divider" />
            <button className="btn sm block" onClick={() => onNavigate('policy')}>
              <Icon name="sliders" size={13} /> Open policy studio
            </button>
          </div>
        </Card>
      </div>

      <div className="grid g2">
        <Card
          title="Wallets"
          subtitle={`${totals.visibleWallets.length} visible${state.wallets.length - totals.visibleWallets.length > 0 ? ` · ${state.wallets.length - totals.visibleWallets.length} hidden` : ''}`}
          icon="layers"
          actions={
            <Button size="sm" icon="plus" onClick={() => onNavigate('wallets')}>
              Manage
            </Button>
          }
        >
          <div className="stack sm">
            {totals.visibleWallets.map((w) => {
              const frozen = state.frozenWallets.includes(w.id);
              return (
                <div
                  key={w.id}
                  className="row between"
                  style={{ padding: '10px 12px', border: '1px solid var(--line-soft)', borderRadius: 10, background: 'var(--panel-2)' }}
                >
                  <div className="row" style={{ gap: 10, minWidth: 0 }}>
                    <div
                      style={{
                        width: 30, height: 30, borderRadius: 9, display: 'grid', placeItems: 'center',
                        background: `${TIER_MAP[w.tier].color}1a`, color: TIER_MAP[w.tier].color, flex: 'none',
                      }}
                    >
                      <Icon name={w.kind === 'passkey' ? 'fingerprint' : 'vault'} size={15} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div className="row" style={{ gap: 8 }}>
                        <span className="small strong">{w.label}</span>
                        {frozen && <Badge tone="bad" icon="pause">frozen</Badge>}
                        {w.visibility === 'decoy' && <Badge tone="warn" icon="skull">decoy</Badge>}
                      </div>
                      <div className="tiny muted">
                        {w.accounts.length} account(s) · {w.accounts.map((a) => getAsset(a.assetId).symbol).join(' · ')}
                      </div>
                    </div>
                  </div>
                  <div className="right">
                    <div className="small mono strong">
                      <Maskable hidden={state.settings.hideBalances}>
                        {fmtUsd(
                          w.accounts.reduce((n, a) => n + (w.balances[a.assetId] ?? 0) * priceUsdAt(getAsset(a.assetId)), 0),
                          { compact: true },
                        )}
                      </Maskable>
                    </div>
                    <TierBadge tier={w.tier} label={TIER_MAP[w.tier].codename} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <div className="stack">
          <Card
            title="Watchtower feed"
            subtitle="What the vault noticed"
            icon="radar"
            actions={
              <Button size="sm" icon="refresh" onClick={injectEvent}>
                Simulate
              </Button>
            }
          >
            {recentEvents.length === 0 ? (
              <Empty icon="radar" title="Nothing has happened yet">
                The watchtower reports poisoning attempts, drainer approvals, anomalous outflows and missed heartbeats.
              </Empty>
            ) : (
              <div className="stack sm">
                {recentEvents.map((e) => (
                  <div
                    key={e.id}
                    className="stack sm"
                    style={{
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: `1px solid ${e.severity === 'critical' ? 'rgba(251,113,133,0.28)' : e.severity === 'warn' ? 'rgba(251,191,36,0.24)' : 'var(--line-soft)'}`,
                      background: 'var(--panel-2)',
                      opacity: e.acknowledged ? 0.62 : 1,
                    }}
                  >
                    <div className="row between">
                      <span className="row" style={{ gap: 8 }}>
                        <span
                          className={`dotmark ${e.severity === 'critical' ? 'bad' : e.severity === 'warn' ? 'warn' : 'info'}`}
                        />
                        <span className="small strong">{e.title}</span>
                      </span>
                      <span className="tiny dim">{new Date(e.at).toLocaleTimeString()}</span>
                    </div>
                    <div className="tiny muted" style={{ lineHeight: 1.55 }}>{e.detail}</div>
                    <div className="row" style={{ gap: 8 }}>
                      {e.amountUsd ? <Badge tone="warn">{fmtUsd(e.amountUsd)}</Badge> : null}
                      {!e.acknowledged && (
                        <button className="btn ghost sm" onClick={() => ackEvent(e.id)}>
                          Acknowledge
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card
            title="Recent activity"
            icon="activity"
            actions={
              <Button size="sm" variant="ghost" iconRight="chevron-right" onClick={() => onNavigate('activity')}>
                All
              </Button>
            }
          >
            {recentTxs.length === 0 ? (
              <Empty icon="activity" title="No transactions yet" />
            ) : (
              <table className="table">
                <tbody>
                  {recentTxs.map((tx) => {
                    const asset = getAsset(tx.assetId);
                    return (
                      <tr key={tx.id}>
                        <td style={{ width: 30 }}>
                          <Icon
                            name={tx.txClass === 'receive' ? 'arrow-down' : tx.txClass === 'swap' ? 'swap' : tx.txClass === 'sweep' ? 'download' : 'arrow-up'}
                            size={14}
                            className={tx.txClass === 'receive' ? 'ok' : 'muted'}
                          />
                        </td>
                        <td>
                          <div className="small strong">{asset.symbol}</div>
                          <div className="tiny muted">{tx.txClass}</div>
                        </td>
                        <td className="right mono small">
                          {tx.txClass === 'receive' ? '+' : '−'}
                          {fmtAmount(tx.amount, asset)}
                        </td>
                        <td className="right mono small muted">{fmtUsd(tx.amountUsd, { compact: true })}</td>
                        <td className="right">
                          <Badge tone={tx.status === 'confirmed' ? 'ok' : tx.status === 'rejected' ? 'bad' : 'warn'}>{tx.status}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
