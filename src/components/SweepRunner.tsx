import { useCallback, useState } from 'react';
import { Badge, Button, Card, Meter, useToast } from '../ui/primitives';
import { Icon } from '../ui/icons';
import { runSweep, type SweepPlan, type SweepProgress } from '../core/sweep/planner';
import { getAsset, fmtAmount, fmtUsd } from '../core/assets';
import { DecisionVerdict } from './DecisionTrace';

/** Shared execution state for consolidation runs. */
export function useSweepRunner() {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<SweepProgress[]>([]);
  const [txIds, setTxIds] = useState<string[]>([]);
  const toast = useToast();

  const reset = useCallback(() => {
    setProgress([]);
    setTxIds([]);
  }, []);

  const run = useCallback(
    async (plan: SweepPlan, onDone: (txIds: string[]) => void) => {
      setRunning(true);
      setProgress([]);
      try {
        const result = await runSweep(plan, (p) => setProgress((prev) => [...prev.filter((x) => x.legId !== p.legId), p]), 800);
        setTxIds(result.txIds);
        toast(`Consolidated ${plan.legs.length} source(s)`, 'ok');
        onDone(result.txIds);
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Consolidation failed', 'bad');
      } finally {
        setRunning(false);
      }
    },
    [toast],
  );

  return { running, progress, txIds, run, reset };
}

export function SweepProgressList({ plan, progress }: { plan: SweepPlan; progress: SweepProgress[] }) {
  const done = progress.filter((p) => p.status === 'confirmed').length;
  return (
    <div className="stack sm">
      <div className="row between">
        <span className="small strong">
          Executing {done}/{plan.legs.length}
        </span>
        <span className="tiny muted mono">{fmtUsd(plan.totalUsd)}</span>
      </div>
      <Meter value={(done / Math.max(1, plan.legs.length)) * 100} />
      {plan.legs.map((leg) => {
        const p = progress.find((x) => x.legId === leg.id);
        const asset = getAsset(leg.assetId);
        return (
          <div key={leg.id} className="row between" style={{ padding: '8px 10px', background: 'var(--panel-2)', borderRadius: 8 }}>
            <div className="row" style={{ gap: 8 }}>
              {p?.status === 'confirmed' ? (
                <Icon name="check" size={13} className="ok" />
              ) : p ? (
                <Icon name="refresh" size={13} className="pulse muted" />
              ) : (
                <Icon name="clock" size={13} className="dim" />
              )}
              <span className="small">
                {fmtAmount(leg.amount, asset)} {asset.symbol}
              </span>
              {leg.hop && <Badge tone="violet" icon="moon">via hop</Badge>}
            </div>
            <span className="tiny muted">{p?.message ?? 'queued'}</span>
          </div>
        );
      })}
    </div>
  );
}

export function SweepPlanView({ plan, onRun, running }: { plan: SweepPlan; onRun: () => void; running: boolean }) {
  const blocked = plan.outcome === 'deny';
  return (
    <div className="stack">
      <DecisionVerdict
        decision={{
          outcome: plan.outcome,
          headline:
            plan.outcome === 'allow'
              ? `${plan.legs.length} leg(s) cleared by policy`
              : `Policy outcome across legs: ${plan.outcome}`,
          traces: plan.decisions.flatMap((d) => d.decision.traces),
          holdSeconds: 0,
          requiredSteps: [],
          evaluatedAt: plan.createdAt,
        }}
        compact
      />

      <div className="grid g3">
        <div className="stat">
          <div className="k">Sources</div>
          <div className="v">{plan.legs.length}</div>
        </div>
        <div className="stat">
          <div className="k">Gross value</div>
          <div className="v">{fmtUsd(plan.totalUsd, { compact: true })}</div>
        </div>
        <div className="stat">
          <div className="k">Fees</div>
          <div className="v">{fmtUsd(plan.totalFeesUsd)}</div>
        </div>
      </div>

      {plan.legs.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Asset</th>
              <th>From</th>
              <th>To</th>
              <th className="right">Amount</th>
              <th className="right">Fee</th>
              <th className="right">ETA</th>
            </tr>
          </thead>
          <tbody>
            {plan.legs.map((leg) => {
              const asset = getAsset(leg.assetId);
              return (
                <tr key={leg.id}>
                  <td className="small strong">{asset.symbol}</td>
                  <td className="tiny mono muted">{leg.from.slice(0, 12)}…</td>
                  <td className="tiny mono muted">{leg.to.slice(0, 12)}…</td>
                  <td className="right mono small">{fmtAmount(leg.amount, asset)}</td>
                  <td className="right mono small muted">{leg.fee.toFixed(Math.min(asset.decimals, 8))}</td>
                  <td className="right tiny muted">~{leg.etaMin}m</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {plan.skipped.length > 0 && (
        <div className="stack sm">
          <span className="tiny muted">Skipped sources</span>
          {plan.skipped.map((s) => (
            <div key={s.sourceId} className="row between" style={{ padding: '8px 10px', background: 'var(--panel-2)', borderRadius: 8 }}>
              <span className="small">{s.label}</span>
              <span className="tiny muted">{s.reason}</span>
            </div>
          ))}
        </div>
      )}

      <div className="row between">
        <span className="tiny muted">
          {plan.privacyMode === 'intermediate'
            ? 'Each source pays a single-use intermediate address first, which then forwards — the direct link is broken at roughly double the fee.'
            : plan.privacyMode === 'staggered'
              ? 'Legs are spread over time so they do not correlate as one operator.'
              : 'Direct legs: cheapest, and every source is publicly linked to the destination.'}
        </span>
        <Button variant="primary" icon="download" loading={running} disabled={blocked || plan.legs.length === 0} onClick={onRun}>
          {blocked ? 'Blocked by policy' : 'Execute consolidation'}
        </Button>
      </div>
    </div>
  );
}

export function SweepCard({ children, title, subtitle }: { children: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <Card title={title} subtitle={subtitle} icon="download">
      {children}
    </Card>
  );
}
