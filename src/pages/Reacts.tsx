import { useMemo, useState } from 'react';
import { useVault } from '../state/store';
import { Badge, Button, Callout, Card, Empty, Select, Stat, ToggleRow, useToast } from '../ui/primitives';
import { Icon } from '../ui/icons';
import { REACT_ACTION_LABEL, TRIGGER_LABEL } from '../core/automation/reacts';
import { dryRun } from '../core/automation/engine';
import type { TriggerKind } from '../core/types';

export function Reacts() {
  const { state, toggleReact, unfreeze, ackEvent, injectEvent } = useVault();
  const toast = useToast();
  const [trigger, setTrigger] = useState<TriggerKind>('phishing_detected');

  const dry = useMemo(() => (state ? dryRun(state, trigger) : []), [state, trigger]);

  if (!state) return null;

  const defensive = state.reacts.filter((r) => r.risk === 'defensive');
  const aggressive = state.reacts.filter((r) => r.risk === 'aggressive');
  const runsToday = state.reactRuns.filter((r) => r.at > Date.now() - 86_400_000).length;

  return (
    <div className="stack">
      <div className="grid g4">
        <Card>
          <Stat
            k="Defensive armed"
            v={`${defensive.filter((r) => r.enabled).length}/${defensive.length}`}
            sub="Freeze, denylist, revoke, decoy"
          />
        </Card>
        <Card>
          <Stat
            k="Aggressive armed"
            v={`${aggressive.filter((r) => r.enabled).length}/${aggressive.length}`}
            sub="Unattended movement — tier 3+ only"
          />
        </Card>
        <Card>
          <Stat k="Runs in 24h" v={runsToday} sub={`${state.reactRuns.length} all time`} />
        </Card>
        <Card>
          <Stat k="Frozen wallets" v={state.frozenWallets.length} sub={state.frozenWallets.length ? 'Awaiting review' : 'Nothing held'} />
        </Card>
      </div>

      <Callout tone="ok" icon="shield-check">
        <strong>Defensive</strong> reacts protect you from an attacker; they are free to run on any tier.{' '}
        <strong>Aggressive</strong> reacts move funds without asking — they are gated to tier 3+, require the automation
        capability, and refuse to act on any source that is not provably yours.
      </Callout>

      <Card
        title="React library"
        subtitle="Trigger → actions. Enable what you want running while you sleep."
        icon="bolt"
        actions={
          <Button size="sm" icon="radar" onClick={() => { injectEvent(); toast('Watchtower event injected'); }}>
            Simulate event
          </Button>
        }
      >
        <div className="stack sm">
          {state.reacts.map((react) => {
            const frozenNote = react.risk === 'aggressive';
            return (
              <div
                key={react.id}
                style={{
                  padding: '12px 14px',
                  border: `1px solid ${react.enabled ? 'var(--line)' : 'var(--line-soft)'}`,
                  borderLeft: `3px solid ${react.risk === 'aggressive' ? 'var(--t4)' : react.risk === 'defensive' ? 'var(--ok)' : 'var(--warn)'}`,
                  borderRadius: 10,
                  background: react.enabled ? 'var(--panel-2)' : 'transparent',
                }}
              >
                <div className="row between" style={{ alignItems: 'flex-start', gap: 14 }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="row wrap" style={{ gap: 8 }}>
                      <span className="small strong mono">{react.name}</span>
                      <Badge tone={react.risk === 'aggressive' ? 'bad' : react.risk === 'defensive' ? 'ok' : 'warn'} icon={react.risk === 'aggressive' ? 'flame' : 'shield'}>
                        {react.risk}
                      </Badge>
                      <Badge tone="info" icon="target">{TRIGGER_LABEL[react.trigger]}</Badge>
                      <Badge tone="violet" icon="layers">T{react.minTier}+</Badge>
                      {react.runCount > 0 && <Badge icon="activity">{react.runCount} run(s)</Badge>}
                    </div>
                    <div className="tiny muted" style={{ marginTop: 6, lineHeight: 1.6, maxWidth: 720 }}>
                      {react.description}
                    </div>
                    <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
                      {react.actions.map((a) => (
                        <span className="badge" key={a}>
                          <Icon name="arrow-right" size={10} /> {REACT_ACTION_LABEL[a]}
                        </span>
                      ))}
                    </div>
                    {react.lastRun && (
                      <div className="tiny dim" style={{ marginTop: 6 }}>
                        Last run {new Date(react.lastRun).toLocaleString()}
                      </div>
                    )}
                  </div>
                  <ToggleRow
                    label=""
                    on={react.enabled}
                    onChange={() => {
                      toggleReact(react.id);
                      toast(`${react.name} ${react.enabled ? 'disarmed' : 'armed'}`, react.enabled ? 'warn' : 'ok');
                    }}
                  />
                </div>
                {frozenNote && react.enabled && (
                  <div className="tiny" style={{ marginTop: 8, color: 'var(--warn)' }}>
                    Armed: this react can queue consolidation of attested-owned sources. It will refuse anything without
                    an ownership attestation, and any wallet on tier 2 or below.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid g2">
        <Card title="Dry run" subtitle="Which reacts would fire, and which guardrail would stop them" icon="terminal">
          <div className="stack">
            <Select
              value={trigger}
              onChange={(v) => setTrigger(v as TriggerKind)}
              options={(Object.keys(TRIGGER_LABEL) as TriggerKind[]).map((t) => ({ value: t, label: TRIGGER_LABEL[t] }))}
            />
            {dry.length === 0 ? (
              <Empty icon="zap-off" title="No react listens for this trigger" />
            ) : (
              <div className="stack sm">
                {dry.map(({ react, gate }) => (
                  <div key={react.id} className="row between" style={{ padding: '9px 11px', background: 'var(--panel-2)', borderRadius: 9 }}>
                    <div>
                      <div className="small strong">{react.name}</div>
                      <div className="tiny muted">{gate.ok ? react.actions.map((a) => REACT_ACTION_LABEL[a]).join(' + ') : gate.reason}</div>
                    </div>
                    <Badge tone={!react.enabled ? 'default' : gate.ok ? 'ok' : 'bad'} icon={!react.enabled ? 'pause' : gate.ok ? 'play' : 'x'}>
                      {!react.enabled ? 'disabled' : gate.ok ? 'would fire' : 'blocked'}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        <div className="stack">
          {state.frozenWallets.length > 0 && (
            <Card title="Frozen wallets" subtitle="Held by a react — review the event, then release" icon="pause" tone="bad">
              <div className="stack sm">
                {state.frozenWallets.map((id) => {
                  const w = state.wallets.find((x) => x.id === id);
                  return (
                    <div key={id} className="row between">
                      <span className="small">{w?.label ?? id}</span>
                      <Button size="sm" icon="play" onClick={() => { unfreeze(id); toast(`${w?.label} released`); }}>
                        Release
                      </Button>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          <Card title="Run history" icon="activity">
            {state.reactRuns.length === 0 ? (
              <Empty icon="activity" title="No runs recorded yet">
                Inject a watchtower event to watch the reacts fire.
              </Empty>
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
                  {state.reactRuns.slice(0, 10).map((run) => (
                    <tr key={run.id}>
                      <td>
                        <div className="small strong">{run.reactName}</div>
                        <div className="tiny muted" style={{ maxWidth: 320 }}>{run.note}</div>
                      </td>
                      <td>
                        <Badge tone={run.outcome === 'executed' ? 'ok' : run.outcome === 'blocked_by_policy' ? 'warn' : 'default'}>
                          {run.outcome.replace(/_/g, ' ')}
                        </Badge>
                      </td>
                      <td className="right tiny muted">{new Date(run.at).toLocaleTimeString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card title="Event log" icon="radar">
            <div className="stack sm" style={{ maxHeight: 320, overflowY: 'auto' }}>
              {state.events.slice(0, 12).map((e) => (
                <div key={e.id} className="stack sm" style={{ padding: '9px 11px', background: 'var(--panel-2)', borderRadius: 9 }}>
                  <div className="row between">
                    <span className="row" style={{ gap: 8 }}>
                      <span className={`dotmark ${e.severity === 'critical' ? 'bad' : e.severity === 'warn' ? 'warn' : 'info'}`} />
                      <span className="small strong">{e.title}</span>
                    </span>
                    <span className="tiny dim">{new Date(e.at).toLocaleTimeString()}</span>
                  </div>
                  <div className="tiny muted" style={{ lineHeight: 1.55 }}>{e.detail}</div>
                  <div className="row" style={{ gap: 6 }}>
                    {e.walletId && (
                      <Badge>{state.wallets.find((w) => w.id === e.walletId)?.label ?? 'vault'}</Badge>
                    )}
                    {!e.acknowledged && (
                      <button className="btn ghost sm" onClick={() => ackEvent(e.id)}>Acknowledge</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
