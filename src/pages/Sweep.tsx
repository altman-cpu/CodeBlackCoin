import { useMemo, useState } from 'react';
import { useVault } from '../state/store';
import { Button, Callout, Card, Empty, Field, Select, Stat, TierBadge } from '../ui/primitives';
import { getAsset, fmtAmount, fmtUsd, priceUsdAt } from '../core/assets';
import { planSweep, PRIVACY_MODES, type FeePresetId, type PrivacyMode, type SweepSource } from '../core/sweep/planner';
import { effectiveRules } from '../core/policy/evaluate';
import { TIER_MAP } from '../core/policy/tiers';
import { SweepPlanView, SweepProgressList, useSweepRunner } from '../components/SweepRunner';

export function Sweep() {
  const { state, applySweep } = useVault();
  const { running, progress, run } = useSweepRunner();

  const [destinationWalletId, setDestinationWalletId] = useState('');
  const [privacyMode, setPrivacyMode] = useState<PrivacyMode>('staggered');
  const [feePreset, setFeePreset] = useState<FeePresetId>('normal');
  const [minUsd, setMinUsd] = useState(500);
  const [minIdleDays, setMinIdleDays] = useState(30);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const destination =
    state?.wallets.find((w) => w.id === destinationWalletId) ?? state?.wallets.find((w) => w.tier === 0) ?? state?.wallets[0] ?? null;

  const candidates = useMemo(() => {
    if (!state) return [];
    const out: (SweepSource & { walletId: string; walletLabel: string; tier: number })[] = [];
    for (const w of state.wallets) {
      if (w.visibility !== 'visible') continue;
      for (const acc of w.accounts) {
        const asset = getAsset(acc.assetId);
        if (asset.family === 'sim') continue;
        const amount = w.balances[acc.assetId] ?? 0;
        if (amount <= 0) continue;
        const idleDays = Math.floor((Date.now() - acc.lastActivity) / 86_400_000);
        const usd = amount * priceUsdAt(asset);
        if (usd < minUsd || idleDays < minIdleDays) continue;
        out.push({
          id: acc.id,
          label: `${w.label} · ${asset.symbol}`,
          assetId: acc.assetId,
          address: acc.address,
          amount,
          idleDays,
          // Wallets inside this vault are owned by definition — no attestation gate.
          attested: true,
          walletId: w.id,
          walletLabel: w.label,
          tier: w.tier,
        });
      }
    }
    return out.sort((a, b) => b.amount * priceUsdAt(getAsset(b.assetId)) - a.amount * priceUsdAt(getAsset(a.assetId)));
  }, [state, minUsd, minIdleDays]);

  const chosen = useMemo(
    () => candidates.filter((c) => selected.has(c.id) && c.walletId !== destination?.id),
    [candidates, selected, destination?.id],
  );

  const plan = useMemo(() => {
    if (!state || !destination || chosen.length === 0) return null;
    return planSweep({
      sources: chosen,
      destination,
      destinationAddresses: Object.fromEntries(destination.accounts.map((a) => [a.assetId, a.address])),
      privacyMode,
      feePreset,
      tier: destination.tier,
      rules: effectiveRules(state.policy, destination.id, destination.tier),
      shards: state.horcruxes.length ? { m: state.horcruxes[0].m, n: state.horcruxes[0].n } : undefined,
    });
  }, [state, destination, chosen, privacyMode, feePreset]);

  if (!state || !destination) return null;

  const totalCandidateUsd = candidates.reduce((n, c) => n + c.amount * priceUsdAt(getAsset(c.assetId)), 0);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div className="stack">
      <div className="grid g4">
        <Card>
          <Stat k="Eligible sources" v={candidates.length} sub={`${fmtUsd(totalCandidateUsd, { compact: true })} available`} />
        </Card>
        <Card>
          <Stat k="Selected" v={chosen.length} sub={chosen.length ? fmtUsd(plan?.totalUsd ?? 0, { compact: true }) : 'Nothing selected'} />
        </Card>
        <Card>
          <Stat k="Destination" v={`T${destination.tier}`} sub={destination.label} />
        </Card>
        <Card>
          <Stat k="Privacy mode" v={PRIVACY_MODES.find((m) => m.id === privacyMode)?.label ?? '—'} sub={`${PRIVACY_MODES.find((m) => m.id === privacyMode)?.feeMultiplier ?? 1}× fee`} />
        </Card>
      </div>

      <Callout tone="ok" icon="shield-check">
        Consolidation moves funds between wallets <strong>you already control</strong>. Sources here are accounts inside
        this vault, so the ownership attestation gate is satisfied by definition. There is no code path that sweeps
        wallets this vault does not hold keys for.
      </Callout>

      <div className="grid main-side">
        <Card
          title="Sources"
          subtitle="Accounts in your vault holding a balance"
          icon="layers"
          actions={
            <div className="row" style={{ gap: 8 }}>
              <Button
                size="sm"
                onClick={() => setSelected(new Set(candidates.filter((c) => c.walletId !== destination.id).map((c) => c.id)))}
              >
                Select all
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                Clear
              </Button>
            </div>
          }
        >
          <div className="grid g2" style={{ marginBottom: 14 }}>
            <Field label={`Minimum value: ${fmtUsd(minUsd)}`}>
              <input className="slider" type="range" min={0} max={50_000} step={100} value={minUsd} onChange={(e) => setMinUsd(Number(e.target.value))} />
            </Field>
            <Field label={`Minimum idle days: ${minIdleDays}`}>
              <input className="slider" type="range" min={0} max={730} step={5} value={minIdleDays} onChange={(e) => setMinIdleDays(Number(e.target.value))} />
            </Field>
          </div>

          {candidates.length === 0 ? (
            <Empty icon="search" title="Nothing matches those filters">
              Lower the minimum value or the idle-days threshold.
            </Empty>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 34 }} />
                  <th>Source</th>
                  <th>Tier</th>
                  <th className="right">Balance</th>
                  <th className="right">Idle</th>
                  <th className="right">Value</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((c) => {
                  const asset = getAsset(c.assetId);
                  const isDest = c.walletId === destination.id;
                  return (
                    <tr key={c.id} className="clickable" onClick={() => !isDest && toggle(c.id)}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selected.has(c.id)}
                          disabled={isDest}
                          onChange={() => toggle(c.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>
                      <td>
                        <div className="small strong">{c.label}</div>
                        <div className="tiny mono muted">{c.address.slice(0, 16)}…</div>
                      </td>
                      <td>
                        <TierBadge tier={c.tier as 0 | 1 | 2 | 3 | 4} label={TIER_MAP[c.tier as 0 | 1 | 2 | 3 | 4].codename} />
                      </td>
                      <td className="right mono small">
                        {fmtAmount(c.amount, asset)} {asset.symbol}
                      </td>
                      <td className="right small muted">{c.idleDays}d</td>
                      <td className="right mono small strong">{fmtUsd(c.amount * priceUsdAt(asset), { compact: true })}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="Consolidation plan" subtitle="Where it goes, and what policy says" icon="download">
          <div className="stack">
            <Field label="Destination vault" help="Ideally a colder tier than the sources.">
              <Select
                value={destination.id}
                onChange={setDestinationWalletId}
                options={state.wallets.filter((w) => w.visibility === 'visible').map((w) => ({ value: w.id, label: `${w.label} · T${w.tier} ${TIER_MAP[w.tier].codename}` }))}
              />
            </Field>
            <div className="grid g2">
              <Field label="Privacy mode">
                <Select value={privacyMode} onChange={(v) => setPrivacyMode(v as PrivacyMode)} options={PRIVACY_MODES.map((m) => ({ value: m.id, label: m.label }))} />
              </Field>
              <Field label="Fee tier">
                <Select
                  value={feePreset}
                  onChange={(v) => setFeePreset(v as FeePresetId)}
                  options={[
                    { value: 'economy', label: 'Economy' },
                    { value: 'normal', label: 'Normal' },
                    { value: 'priority', label: 'Priority' },
                    { value: 'emergency', label: 'Emergency' },
                  ]}
                />
              </Field>
            </div>
            <div className="tiny muted">{PRIVACY_MODES.find((m) => m.id === privacyMode)?.blurb}</div>

            {plan ? (
              <>
                <SweepPlanView
                  plan={plan}
                  running={running}
                  onRun={() =>
                    void run(plan, (txIds) => {
                      const first = chosen[0];
                      applySweep(
                        destination.id,
                        first?.assetId ?? 'btc',
                        plan.totalUsd,
                        txIds,
                        `Consolidated ${plan.legs.length} owned source(s) from ${new Set(chosen.map((c) => c.walletLabel)).size} wallet(s)`,
                      );
                      setSelected(new Set());
                    })
                  }
                />
                {(running || progress.length > 0) && <SweepProgressList plan={plan} progress={progress} />}
              </>
            ) : (
              <Empty icon="download" title="No plan yet">
                Select sources that are not already in the destination vault.
              </Empty>
            )}
          </div>
        </Card>
      </div>

      <Card title="Queued by reacts" subtitle="Consolidation requests automation has raised" icon="bolt">
        {state.audit.filter((a) => a.kind === 'sweep').length === 0 ? (
          <div className="small muted">
            When an aggressive react such as DORMANT RECLAIM or EXPOSURE ROTATE fires, the consolidation request lands
            here with the reason and the sources it considered.
          </div>
        ) : (
          <div className="stack sm">
            {state.audit
              .filter((a) => a.kind === 'sweep')
              .slice(0, 6)
              .map((a) => (
                <div key={a.id} className="row between" style={{ padding: '9px 11px', background: 'var(--panel-2)', borderRadius: 9 }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="small strong">{a.title}</div>
                    <div className="tiny muted">{a.detail}</div>
                  </div>
                  <span className="tiny dim">{new Date(a.at).toLocaleString()}</span>
                </div>
              ))}
          </div>
        )}
      </Card>
    </div>
  );
}
