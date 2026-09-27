import { useMemo, useState } from 'react';
import { useVault } from '../state/store';
import { Badge, Button, Callout, Card, CheckRow, CopyText, Empty, Field, Input, Select, Stat, Tabs, Textarea, useToast } from '../ui/primitives';
import { ASSETS, fmtAmount, fmtUsd, getAsset } from '../core/assets';
import { scanKeyMaterial, type Finding } from '../core/horcrux/vault';
import { SimAdapter } from '../core/chain/adapter';
import { planSweep, PRIVACY_MODES, type PrivacyMode, type SweepSource, type FeePresetId } from '../core/sweep/planner';
import { effectiveRules } from '../core/policy/evaluate';
import { SweepPlanView, SweepProgressList, useSweepRunner } from '../components/SweepRunner';
import type { RecoveryClaim } from '../core/types';

const adapter = new SimAdapter();

const SOURCE_KINDS: { value: RecoveryClaim['sourceKind']; label: string }[] = [
  { value: 'old-device', label: 'Old device or laptop' },
  { value: 'paper-backup', label: 'Paper backup' },
  { value: 'inherited', label: 'Inherited estate' },
  { value: 'shard-set', label: 'Reconstructed Horcrux shard set' },
  { value: 'hardware', label: 'Hardware wallet being retired' },
  { value: 'client-authorized', label: 'Client-authorized recovery (written authority on file)' },
];

export function Recovery() {
  const { state, addClaim, updateClaim, applySweep, audit, updateSettings } = useVault();
  const toast = useToast();
  const [tab, setTab] = useState<'new' | 'claims'>('new');

  const [sourceKind, setSourceKind] = useState<RecoveryClaim['sourceKind']>('old-device');
  const [mnemonic, setMnemonic] = useState('');
  const [assetIds, setAssetIds] = useState<string[]>(['btc', 'eth', 'xmr', 'zec', 'usdc', 'ltc']);
  const [scanning, setScanning] = useState(false);
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [scanned, setScanned] = useState(0);
  const [invalid, setInvalid] = useState(false);

  const [destinationWalletId, setDestinationWalletId] = useState('');
  const [privacyMode, setPrivacyMode] = useState<PrivacyMode>('staggered');
  const [feePreset, setFeePreset] = useState<FeePresetId>('priority');

  const [attestOwnership, setAttestOwnership] = useState(false);
  const [attestNoUnauthorized, setAttestNoUnauthorized] = useState(false);
  const [authorizationRef, setAuthorizationRef] = useState('');
  const [signedWith, setSignedWith] = useState('');
  const [acceptedPolicy, setAcceptedPolicy] = useState(!!state?.settings.recoveryPolicyAcceptedAt);

  const { running, progress, run } = useSweepRunner();

  const wallet = state?.wallets.find((w) => w.id === destinationWalletId) ?? state?.wallets.find((w) => w.tier === 0) ?? state?.wallets[0] ?? null;
  const destId = wallet?.id ?? '';

  const attested = attestOwnership && attestNoUnauthorized && authorizationRef.trim().length >= 4 && signedWith.trim().length >= 2;
  const funded = (findings ?? []).filter((f) => f.derivable && f.amount > 0);
  const totalUsd = funded.reduce((n, f) => n + f.amountUsd, 0);

  const sources: SweepSource[] = funded.map((f, i) => ({
    id: `finding_${i}`,
    label: `${getAsset(f.assetId).symbol} · ${f.hdPath}`,
    assetId: f.assetId,
    address: f.address,
    amount: f.amount,
    idleDays: 365,
    attested,
  }));

  const plan = useMemo(() => {
    if (!state || !wallet || sources.length === 0) return null;
    return planSweep({
      sources,
      destination: wallet,
      destinationAddresses: Object.fromEntries(wallet.accounts.map((a) => [a.assetId, a.address])),
      privacyMode,
      feePreset,
      tier: wallet.tier,
      rules: effectiveRules(state.policy, wallet.id, wallet.tier),
      shards: state.horcruxes.length ? { m: state.horcruxes[0].m, n: state.horcruxes[0].n } : undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, wallet, sources.length, attested, privacyMode, feePreset]);

  const scan = async () => {
    setScanning(true);
    setInvalid(false);
    try {
      const result = await scanKeyMaterial(mnemonic, assetIds, async (asset, address) => {
        const bal = await adapter.getBalance(asset, address);
        return { amount: bal.amount, amountUsd: bal.amountUsd };
      });
      setFindings(result.findings);
      setScanned(result.scanned);
      setInvalid(result.invalidMnemonic);
      audit({
        at: Date.now(),
        kind: 'recovery',
        title: 'Recovery scan completed',
        detail: `Scanned ${result.scanned} derived address(es) from operator-supplied key material. ${result.findings.filter((f) => f.amount > 0).length} held a balance.`,
        severity: 'info',
      });
    } finally {
      setScanning(false);
    }
  };

  const execute = () => {
    if (!plan || !wallet) return;
    const claim = addClaim({
      createdAt: Date.now(),
      source: SOURCE_KINDS.find((k) => k.value === sourceKind)?.label ?? sourceKind,
      sourceKind,
      findings: funded.map((f) => ({ assetId: f.assetId, address: f.address, amount: f.amount, amountUsd: f.amountUsd, hdPath: f.hdPath })),
      totalUsd,
      attestation: {
        ownerStatement: 'I attest that I lawfully control this key material, or hold written authority from its owner.',
        authorizationRef: authorizationRef.trim(),
        signedAt: Date.now(),
        signedWith: signedWith.trim(),
      },
      status: 'attested',
      destinationWalletId: wallet.id,
    });
    void run(plan, (txIds) => {
      applySweep(wallet.id, funded[0]?.assetId ?? 'btc', totalUsd, txIds, `Recovery from ${SOURCE_KINDS.find((k) => k.value === sourceKind)?.label ?? sourceKind} (authorization ${authorizationRef.trim()})`);
      updateClaim(claim.id, { status: 'complete', sweptTxIds: txIds });
      toast('Recovery consolidation complete', 'ok');
    });
  };

  if (!state) return null;

  return (
    <div className="stack">
      <Callout tone="warn" icon="shield-check">
        <strong>Scope.</strong> This console reclaims key material you already hold — an old device, a paper backup, an
        inherited estate, a reconstructed shard set of your own. It derives addresses and reads balances. It does not
        scan key space, does not test phrases it was not given, and will not move a satoshi without your signed
        attestation on file.
      </Callout>

      <div className="grid g4">
        <Card>
          <Stat k="Claims" v={state.claims.length} sub={`${state.claims.filter((c) => c.status === 'complete').length} completed`} />
        </Card>
        <Card>
          <Stat k="Attested value" v={fmtUsd(state.claims.filter((c) => c.attestation).reduce((n, c) => n + c.totalUsd, 0), { compact: true })} sub="Across all claims" />
        </Card>
        <Card>
          <Stat k="Recovered" v={fmtUsd(state.claims.filter((c) => c.status === 'complete').reduce((n, c) => n + c.totalUsd, 0), { compact: true })} sub="Swept into vault" />
        </Card>
        <Card>
          <Stat k="Refused" v={state.claims.filter((c) => c.status === 'rejected').length} sub="Missing attestation or policy block" />
        </Card>
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'new', label: 'New recovery', icon: 'key' },
          { id: 'claims', label: 'Claims', icon: 'book', count: state.claims.length },
        ]}
      />

      {tab === 'new' && (
        <div className="grid main-side">
          <div className="stack">
            <Card title="1 · Key material" subtitle="Paste phrase material you already possess" icon="key">
              <div className="stack">
                <Field label="Where did this come from?">
                  <Select
                    value={sourceKind}
                    onChange={(v) => setSourceKind(v as RecoveryClaim['sourceKind'])}
                    options={SOURCE_KINDS.map((k) => ({ value: k.value, label: k.label }))}
                  />
                </Field>
                <Field
                  label="BIP-39 recovery phrase"
                  help="Validated locally. Derivation and balance reads happen on this device; nothing is broadcast."
                  right={invalid ? <Badge tone="bad" icon="x">not a valid phrase</Badge> : null}
                >
                  <Textarea mono rows={3} value={mnemonic} onChange={(e) => setMnemonic(e.target.value)} placeholder="word word word …" />
                </Field>
                <Field label="Assets to scan" help="Each asset derives its first three addresses and reads the balance.">
                  <div className="row wrap" style={{ gap: 6 }}>
                    {ASSETS.map((a) => {
                      const on = assetIds.includes(a.id);
                      return (
                        <button
                          key={a.id}
                          className={`btn sm ${on ? 'primary' : ''}`}
                          onClick={() => setAssetIds(on ? assetIds.filter((x) => x !== a.id) : [...assetIds, a.id])}
                          type="button"
                        >
                          {a.symbol}
                        </button>
                      );
                    })}
                  </div>
                </Field>
                <Button icon="search" loading={scanning} disabled={!mnemonic.trim()} onClick={scan}>
                  Scan for balances
                </Button>
                {findings && (
                  <div className="tiny muted">
                    Scanned {scanned} derived address(es) · {funded.length} held a balance · {fmtUsd(totalUsd)} total
                  </div>
                )}
              </div>
            </Card>

            {findings && (
              <Card title="Findings" subtitle="Read-only balances on operator-supplied key material" icon="database">
                {findings.length === 0 ? (
                  <Empty icon="search" title="No balances found">
                    The derivation is valid, but nothing is sitting at the first three addresses for the assets you
                    selected.
                  </Empty>
                ) : (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Asset</th>
                        <th>Address</th>
                        <th>Path</th>
                        <th className="right">Balance</th>
                        <th className="right">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {findings.map((f) => {
                        const asset = getAsset(f.assetId);
                        return (
                          <tr key={`${f.assetId}-${f.address}`}>
                            <td className="small strong">
                              <span className="row" style={{ gap: 6 }}>
                                <span style={{ width: 7, height: 7, borderRadius: 4, background: asset.color }} />
                                {asset.symbol}
                                {!f.derivable && <Badge tone="warn">no derivation</Badge>}
                              </span>
                            </td>
                            <td>
                              {f.derivable ? (
                                <CopyText value={f.address} display={`${f.address.slice(0, 12)}…${f.address.slice(-6)}`} />
                              ) : (
                                <span className="tiny muted">not derivable in this build</span>
                              )}
                            </td>
                            <td className="tiny mono muted">{f.hdPath}</td>
                            <td className="right mono small">{fmtAmount(f.amount, asset)}</td>
                            <td className="right mono small muted">{fmtUsd(f.amountUsd, { compact: true })}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </Card>
            )}
          </div>

          <div className="stack">
            <Card title="2 · Ownership attestation" subtitle="Required before anything moves" icon="shield" tone={attested ? 'ok' : 'warn'}>
              <div className="stack">
                <CheckRow checked={attestOwnership} onChange={setAttestOwnership}>
                  I lawfully control this key material — it came from my own device, my own backup, an estate I am
                  executor of, or a client who has given me written authority.
                </CheckRow>
                <CheckRow checked={attestNoUnauthorized} onChange={setAttestNoUnauthorized}>
                  I am not testing, guessing or brute-forcing phrases, and I am not attempting to access anyone else's
                  funds.
                </CheckRow>
                <Field label="Authorization reference" help="File number, engagement letter, estate reference — anything you can produce later.">
                  <Input value={authorizationRef} onChange={(e) => setAuthorizationRef(e.target.value)} placeholder="e.g. ESTATE-2026-114" />
                </Field>
                <Field label="Signed by">
                  <Input value={signedWith} onChange={(e) => setSignedWith(e.target.value)} placeholder="Your name or operator id" />
                </Field>
                <CheckRow
                  checked={acceptedPolicy}
                  onChange={(v) => {
                    setAcceptedPolicy(v);
                    if (v) updateSettings({ recoveryPolicyAcceptedAt: Date.now() });
                  }}
                >
                  I accept that consolidation only ever touches key material I control, and that every claim is written
                  to an immutable audit trail.
                </CheckRow>
              </div>
            </Card>

            <Card title="3 · Consolidation" subtitle="Plan, then execute into your own vault" icon="download">
              <div className="stack">
                <Field label="Destination vault">
                  <Select
                    value={destId}
                    onChange={setDestinationWalletId}
                    options={(state.wallets ?? []).map((w) => ({ value: w.id, label: `${w.label} · T${w.tier}` }))}
                  />
                </Field>
                <div className="grid g2">
                  <Field label="Privacy mode">
                    <Select
                      value={privacyMode}
                      onChange={(v) => setPrivacyMode(v as PrivacyMode)}
                      options={PRIVACY_MODES.map((m) => ({ value: m.id, label: m.label }))}
                    />
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
                <div className="tiny muted">
                  {PRIVACY_MODES.find((m) => m.id === privacyMode)?.blurb}
                </div>

                {!attested && funded.length > 0 && (
                  <Callout tone="warn" icon="lock">
                    {funded.length} source(s) worth {fmtUsd(totalUsd)} are held until the attestation above is complete.
                    The planner will not price them and the executor will not touch them.
                  </Callout>
                )}

                {plan && attested ? (
                  <>
                    <SweepPlanView plan={plan} running={running} onRun={execute} />
                    {(running || progress.length > 0) && <SweepProgressList plan={plan} progress={progress} />}
                  </>
                ) : (
                  <Empty icon="download" title="Nothing to plan yet">
                    {funded.length === 0
                      ? 'Scan key material that holds a balance to build a consolidation plan.'
                      : 'Complete the attestation to price and execute the consolidation.'}
                  </Empty>
                )}
              </div>
            </Card>
          </div>
        </div>
      )}

      {tab === 'claims' && (
        <Card title="Recovery claims" subtitle="Every claim, its attestation and its outcome" icon="book">
          {state.claims.length === 0 ? (
            <Empty icon="book" title="No claims yet" />
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Findings</th>
                  <th className="right">Value</th>
                  <th>Attestation</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {state.claims.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div className="small strong">{c.source}</div>
                      <div className="tiny muted">{new Date(c.createdAt).toLocaleString()}</div>
                    </td>
                    <td className="small muted">{c.findings.length} account(s)</td>
                    <td className="right mono small">{fmtUsd(c.totalUsd, { compact: true })}</td>
                    <td>
                      {c.attestation ? (
                        <div className="tiny">
                          <div className="mono">{c.attestation.authorizationRef}</div>
                          <div className="muted">signed by {c.attestation.signedWith}</div>
                        </div>
                      ) : (
                        <Badge tone="bad" icon="x">missing</Badge>
                      )}
                    </td>
                    <td>
                      <Badge tone={c.status === 'complete' ? 'ok' : c.status === 'rejected' ? 'bad' : 'warn'}>{c.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}
    </div>
  );
}
