import { useMemo, useState } from 'react';
import { useVault } from '../state/store';
import { Badge, Button, Card, CopyText, Empty, Select, Stat, Tabs, useToast } from '../ui/primitives';
import { Icon } from '../ui/icons';
import { getAsset, fmtAmount, fmtUsd } from '../core/assets';
import type { AuditKind, TxClass } from '../core/types';

type Tab = 'txs' | 'audit' | 'runs';

export function Activity() {
  const { state, ackEvent, audit } = useVault();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('txs');
  const [walletFilter, setWalletFilter] = useState('');
  const [classFilter, setClassFilter] = useState<'all' | TxClass>('all');
  const [kindFilter, setKindFilter] = useState<'all' | AuditKind>('all');

  const txs = useMemo(() => {
    if (!state) return [];
    return state.txs
      .filter((t) => (walletFilter ? t.walletId === walletFilter : true))
      .filter((t) => (classFilter === 'all' ? true : t.txClass === classFilter));
  }, [state, walletFilter, classFilter]);

  const entries = useMemo(() => {
    if (!state) return [];
    return state.audit.filter((a) => (kindFilter === 'all' ? true : a.kind === kindFilter));
  }, [state, kindFilter]);

  if (!state) return null;

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ transactions: state.txs, audit: state.audit, reactRuns: state.reactRuns, events: state.events }, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `blackvault-audit-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    audit({
      at: Date.now(),
      kind: 'session',
      title: 'Audit trail exported',
      detail: 'The operator exported the local audit trail to a file.',
      severity: 'warn',
    });
    toast('Audit trail exported');
  };

  return (
    <div className="stack">
      <div className="grid g4">
        <Card>
          <Stat k="Transactions" v={state.txs.length} sub={`${state.txs.filter((t) => t.status === 'confirmed').length} confirmed`} />
        </Card>
        <Card>
          <Stat k="Audit entries" v={state.audit.length} sub="Append-only, local" />
        </Card>
        <Card>
          <Stat k="React runs" v={state.reactRuns.length} sub={`${state.reactRuns.filter((r) => r.outcome === 'blocked_by_policy').length} blocked by policy`} />
        </Card>
        <Card>
          <Stat
            k="Open alerts"
            v={state.events.filter((e) => !e.acknowledged).length}
            sub={`${state.events.filter((e) => e.severity === 'critical' && !e.acknowledged).length} critical`}
          />
        </Card>
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'txs', label: 'Transactions', icon: 'activity', count: state.txs.length },
          { id: 'audit', label: 'Audit trail', icon: 'book', count: state.audit.length },
          { id: 'runs', label: 'React runs', icon: 'bolt', count: state.reactRuns.length },
        ]}
      />

      {tab === 'txs' && (
        <Card
          title="Transactions"
          icon="activity"
          actions={
            <div className="row" style={{ gap: 8 }}>
              <div style={{ width: 180 }}>
                <Select
                  value={walletFilter}
                  onChange={setWalletFilter}
                  options={[
                    { value: '', label: 'All wallets' },
                    ...state.wallets.map((w) => ({ value: w.id, label: w.label })),
                  ]}
                />
              </div>
              <div style={{ width: 150 }}>
                <Select
                  value={classFilter}
                  onChange={(v) => setClassFilter(v as 'all' | TxClass)}
                  options={[
                    { value: 'all', label: 'All types' },
                    { value: 'send', label: 'Send' },
                    { value: 'receive', label: 'Receive' },
                    { value: 'swap', label: 'Swap' },
                    { value: 'sweep', label: 'Sweep' },
                  ]}
                />
              </div>
            </div>
          }
        >
          {txs.length === 0 ? (
            <Empty icon="activity" title="No transactions match" />
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Wallet</th>
                  <th>Asset</th>
                  <th className="right">Amount</th>
                  <th className="right">Value</th>
                  <th>Destination</th>
                  <th>Status</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {txs.map((tx) => {
                  const asset = getAsset(tx.assetId);
                  return (
                    <tr key={tx.id}>
                      <td>
                        <span className="row" style={{ gap: 6 }}>
                          <Icon
                            name={tx.txClass === 'receive' ? 'arrow-down' : tx.txClass === 'swap' ? 'swap' : tx.txClass === 'sweep' ? 'download' : 'arrow-up'}
                            size={13}
                            className="muted"
                          />
                          <span className="small">{tx.txClass}</span>
                        </span>
                      </td>
                      <td className="small">{state.wallets.find((w) => w.id === tx.walletId)?.label ?? '—'}</td>
                      <td className="small strong">{asset.symbol}</td>
                      <td className="right mono small">{fmtAmount(tx.amount, asset)}</td>
                      <td className="right mono small muted">{fmtUsd(tx.amountUsd, { compact: true })}</td>
                      <td>
                        {tx.txid ? (
                          <CopyText value={tx.txid} display={`${tx.txid.slice(0, 10)}…`} />
                        ) : (
                          <span className="tiny muted">{tx.toAddress.slice(0, 12)}…</span>
                        )}
                      </td>
                      <td>
                        <Badge tone={tx.status === 'confirmed' ? 'ok' : tx.status === 'rejected' || tx.status === 'cancelled' ? 'bad' : 'warn'}>
                          {tx.status}
                        </Badge>
                        {tx.decision && tx.decision.outcome !== 'allow' && (
                          <div className="tiny muted">policy: {tx.decision.outcome}</div>
                        )}
                      </td>
                      <td className="tiny muted nowrap">{new Date(tx.createdAt).toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {tab === 'audit' && (
        <Card
          title="Audit trail"
          subtitle="Append-only. Nothing here is sent anywhere; it exists so you can prove what happened."
          icon="book"
          actions={
            <div className="row" style={{ gap: 8 }}>
              <div style={{ width: 170 }}>
                <Select
                  value={kindFilter}
                  onChange={(v) => setKindFilter(v as 'all' | AuditKind)}
                  options={[
                    { value: 'all', label: 'All kinds' },
                    { value: 'policy', label: 'Policy' },
                    { value: 'security', label: 'Security' },
                    { value: 'sweep', label: 'Sweep' },
                    { value: 'recovery', label: 'Recovery' },
                    { value: 'horcrux', label: 'Horcrux' },
                    { value: 'wallet', label: 'Wallet' },
                    { value: 'swap', label: 'Swap' },
                    { value: 'react', label: 'React' },
                    { value: 'session', label: 'Session' },
                  ]}
                />
              </div>
              <Button size="sm" icon="download" onClick={exportJson}>
                Export
              </Button>
            </div>
          }
        >
          <div className="stack sm">
            {entries.length === 0 && <Empty icon="book" title="No entries" />}
            {entries.map((e) => (
              <div
                key={e.id}
                className="stack sm"
                style={{
                  padding: '11px 13px',
                  background: 'var(--panel-2)',
                  borderRadius: 10,
                  borderLeft: `3px solid ${e.severity === 'critical' ? 'var(--bad)' : e.severity === 'warn' ? 'var(--warn)' : 'var(--line)'}`,
                }}
              >
                <div className="row between">
                  <span className="row" style={{ gap: 8 }}>
                    <Badge tone={e.kind === 'security' ? 'bad' : e.kind === 'policy' ? 'violet' : 'default'}>{e.kind}</Badge>
                    <span className="small strong">{e.title}</span>
                  </span>
                  <span className="tiny dim">{new Date(e.at).toLocaleString()}</span>
                </div>
                <div className="tiny muted" style={{ lineHeight: 1.6 }}>{e.detail}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {tab === 'runs' && (
        <div className="grid g2">
          <Card title="React runs" icon="bolt">
            {state.reactRuns.length === 0 ? (
              <Empty icon="bolt" title="No runs yet" />
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>React</th>
                    <th>Outcome</th>
                    <th className="right">When</th>
                  </tr>
                </thead>
                <tbody>
                  {state.reactRuns.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <div className="small strong">{r.reactName}</div>
                        <div className="tiny muted">{r.note}</div>
                      </td>
                      <td>
                        <Badge tone={r.outcome === 'executed' ? 'ok' : r.outcome === 'blocked_by_policy' ? 'warn' : 'default'}>
                          {r.outcome.replace(/_/g, ' ')}
                        </Badge>
                      </td>
                      <td className="right tiny muted nowrap">{new Date(r.at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card
            title="Events"
            icon="radar"
            actions={
              <Button size="sm" onClick={() => ackEvent()}>
                Acknowledge all
              </Button>
            }
          >
            <div className="stack sm" style={{ maxHeight: 460, overflowY: 'auto' }}>
              {state.events.length === 0 && <Empty icon="radar" title="No events" />}
              {state.events.map((e) => (
                <div
                  key={e.id}
                  className="stack sm"
                  style={{
                    padding: '11px 13px',
                    background: 'var(--panel-2)',
                    borderRadius: 10,
                    opacity: e.acknowledged ? 0.6 : 1,
                    borderLeft: `3px solid ${e.severity === 'critical' ? 'var(--bad)' : e.severity === 'warn' ? 'var(--warn)' : 'var(--info)'}`,
                  }}
                >
                  <div className="row between">
                    <span className="small strong">{e.title}</span>
                    <span className="tiny dim">{new Date(e.at).toLocaleString()}</span>
                  </div>
                  <div className="tiny muted" style={{ lineHeight: 1.6 }}>{e.detail}</div>
                  <div className="row" style={{ gap: 8 }}>
                    {e.amountUsd ? <Badge tone="warn">{fmtUsd(e.amountUsd)}</Badge> : null}
                    {e.walletId && <Badge>{state.wallets.find((w) => w.id === e.walletId)?.label}</Badge>}
                    {!e.acknowledged && (
                      <button className="btn ghost sm" onClick={() => ackEvent(e.id)}>Acknowledge</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
