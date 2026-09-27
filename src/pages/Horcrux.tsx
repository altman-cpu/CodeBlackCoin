import { useMemo, useState } from 'react';
import { useVault } from '../state/store';
import { Badge, Button, Callout, Card, CopyText, Empty, Field, Input, Modal, Select, Stat, Tabs, Textarea, useToast } from '../ui/primitives';
import { Icon } from '../ui/icons';
import { claimStatus, daysSinceHeartbeat, heartbeatDue, reconstructSecret, verifyShard, HEARTBEAT_INTERVAL_DAYS } from '../core/horcrux/vault';
import type { Horcrux, Shard } from '../core/types';

type Tab = 'sets' | 'inheritance' | 'reconstruct';

export function Horcrux() {
  const { state, shardSecret, removeHorcrux, heartbeat, attestShard } = useVault();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('sets');
  const [creating, setCreating] = useState(false);
  const [openSet, setOpenSet] = useState<string | null>(null);
  const [reveal, setReveal] = useState<{ horcruxId: string; shard: Shard } | null>(null);

  const overdue = useMemo(() => (state?.horcruxes ?? []).filter((h) => heartbeatDue(h)), [state?.horcruxes]);

  if (!state) return null;
  const open = state.horcruxes.find((h) => h.id === openSet) ?? null;

  return (
    <div className="stack">
      <div className="grid g4">
        <Card>
          <Stat k="Shard sets" v={state.horcruxes.length} sub={`${state.horcruxes.reduce((n, h) => n + h.n, 0)} shards issued`} />
        </Card>
        <Card>
          <Stat
            k="Heartbeat"
            v={overdue.length === 0 ? 'Current' : `${overdue.length} overdue`}
            sub={`Every ${HEARTBEAT_INTERVAL_DAYS} days`}
          />
        </Card>
        <Card>
          <Stat k="Beneficiaries" v={state.horcruxes.reduce((n, h) => n + h.beneficiaries.length, 0)} sub="Named across all plans" />
        </Card>
        <Card>
          <Stat k="Claims open" v={state.horcruxes.filter((h) => claimStatus(h).opensInDays <= 0).length} sub="After heartbeat + timelock" />
        </Card>
      </div>

      <Callout tone="ok" icon="gem">
        A Horcrux splits a secret so that no single custodian, location or moment of coercion can compromise it — and so
        your heirs are not locked out forever. Shards are created and recombined entirely on this device. Losing more
        shards than the threshold tolerates means the secret is gone; that is the trade, and it is deliberate.
      </Callout>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'sets', label: 'Shard sets', icon: 'gem', count: state.horcruxes.length },
          { id: 'inheritance', label: 'Inheritance', icon: 'heart', count: state.horcruxes.length },
          { id: 'reconstruct', label: 'Reconstruct', icon: 'key' },
        ]}
      />

      {tab === 'sets' && (
        <Card
          title="Shard sets"
          subtitle="m-of-n Shamir shards over GF(256)"
          icon="gem"
          actions={
            <Button size="sm" variant="primary" icon="plus" onClick={() => setCreating(true)}>
              Create a Horcrux
            </Button>
          }
        >
          {state.horcruxes.length === 0 ? (
            <Empty icon="gem" title="No Horcrux yet" action={<Button icon="plus" onClick={() => setCreating(true)}>Create one</Button>}>
              Shard a wallet's recovery phrase, a master passphrase, or any secret you would rather not keep in one
              place. Two shards in two safe places beats one phrase in one drawer.
            </Empty>
          ) : (
            <div className="grid g2">
              {state.horcruxes.map((h) => {
                const status = claimStatus(h);
                return (
                  <div key={h.id} className="card flat" style={{ borderColor: status.tone === 'critical' ? 'rgba(251,113,133,0.35)' : undefined }}>
                    <div className="card-body stack sm">
                      <div className="row between">
                        <div>
                          <div className="small strong">{h.label}</div>
                          <div className="tiny muted">
                            {h.m}-of-{h.n} · {h.purpose} · created {new Date(h.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                        <Badge tone={status.tone === 'critical' ? 'bad' : status.tone === 'warn' ? 'warn' : 'ok'} icon="clock">
                          {status.label}
                        </Badge>
                      </div>
                      <div className="row wrap" style={{ gap: 6 }}>
                        {h.shards.map((s) => (
                          <button
                            key={s.index}
                            className={`shard ${s.attestedAt ? 'attested' : ''}`}
                            style={{ flex: '1 1 130px', cursor: 'pointer', color: 'var(--text)', fontFamily: 'inherit', textAlign: 'left' }}
                            onClick={() => setReveal({ horcruxId: h.id, shard: s })}
                          >
                            <div className="row between">
                              <span className="tiny mono muted">#{s.index}</span>
                              {s.attestedAt ? <Icon name="check" size={12} className="ok" /> : <Icon name="clock" size={12} className="dim" />}
                            </div>
                            <div className="small strong">{s.custodian}</div>
                            <div className="tiny muted">{s.location}</div>
                            <div className="tiny mono dim">chk {s.checksum}</div>
                          </button>
                        ))}
                      </div>
                      <div className="row" style={{ gap: 8 }}>
                        <Button size="sm" variant="ghost" icon="eye" onClick={() => setOpenSet(h.id)}>
                          Manage
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon="heart"
                          onClick={() => {
                            heartbeat(h.id);
                            toast('Heartbeat recorded — the claim clock reset');
                          }}
                        >
                          Heartbeat
                        </Button>
                        <div className="spacer" />
                        <Button
                          size="sm"
                          variant="ghost"
                          icon="trash"
                          onClick={() => {
                            removeHorcrux(h.id);
                            toast('Shard set deleted from this vault', 'warn');
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {tab === 'inheritance' && (
        <Card title="Inheritance plans" subtitle="Heartbeat, timelock, beneficiaries" icon="heart">
          {state.horcruxes.length === 0 ? (
            <Empty icon="heart" title="Nothing to inherit yet">
              Create a Horcrux first — the plan lives on the shard set.
            </Empty>
          ) : (
            <div className="stack">
              {state.horcruxes.map((h) => {
                const status = claimStatus(h);
                const days = daysSinceHeartbeat(h);
                return (
                  <div key={h.id} className="card flat">
                    <div className="card-body stack sm">
                      <div className="row between">
                        <span className="small strong">{h.label}</span>
                        <Badge tone={status.tone === 'critical' ? 'bad' : status.tone === 'warn' ? 'warn' : 'ok'} icon="clock">
                          {status.label}
                        </Badge>
                      </div>
                      <div className="row wrap" style={{ gap: 16 }}>
                        <div>
                          <div className="tiny muted">Heartbeat</div>
                          <div className="small mono">{days} day(s) ago</div>
                        </div>
                        <div>
                          <div className="tiny muted">Timelock</div>
                          <div className="small mono">{h.timelockDays} day(s)</div>
                        </div>
                        <div>
                          <div className="tiny muted">Quorum</div>
                          <div className="small mono">{h.m}-of-{h.n} shards</div>
                        </div>
                        <div>
                          <div className="tiny muted">Beneficiaries</div>
                          <div className="small mono">{h.beneficiaries.length}</div>
                        </div>
                      </div>
                      {h.beneficiaries.length > 0 && (
                        <table className="table">
                          <thead>
                            <tr>
                              <th>Name</th>
                              <th>Share</th>
                              <th>Contact</th>
                            </tr>
                          </thead>
                          <tbody>
                            {h.beneficiaries.map((b, i) => (
                              <tr key={i}>
                                <td className="small">{b.name}</td>
                                <td className="small mono">{b.sharePct}%</td>
                                <td className="small muted">{b.contact}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                      <div className="row" style={{ gap: 8 }}>
                        <Button
                          size="sm"
                          icon="heart"
                          onClick={() => {
                            heartbeat(h.id);
                            toast('Heartbeat recorded — beneficiaries move further from a claim');
                          }}
                        >
                          Record heartbeat
                        </Button>
                        <span className="tiny muted">
                          Miss {HEARTBEAT_INTERVAL_DAYS + h.timelockDays} days in total and the claim window opens.
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {tab === 'reconstruct' && <ReconstructPanel />}

      {creating && (
        <CreateHorcruxModal
          onClose={() => setCreating(false)}
          onCreate={async (input) => {
            await shardSecret(input);
            setCreating(false);
            toast(`Horcrux created — ${input.m} of ${input.n} shards required`);
          }}
        />
      )}

      {open && (
        <Modal
          title={open.label}
          subtitle={`${open.m}-of-${open.n} · ${open.purpose}`}
          icon="gem"
          onClose={() => setOpenSet(null)}
          footer={<Button onClick={() => setOpenSet(null)}>Done</Button>}
        >
          <div className="stack sm">
            <div className="tiny muted">
              Attesting a shard records that the custodian confirmed possession. It does not transmit anything, and it
              does not make the shard more powerful — it tells you a ceremony actually happened.
            </div>
            {open.shards.map((s) => (
              <div key={s.index} className="row between" style={{ padding: '10px 12px', background: 'var(--panel-2)', borderRadius: 9 }}>
                <div>
                  <div className="small strong">
                    #{s.index} · {s.custodian}
                  </div>
                  <div className="tiny muted">
                    {s.location} · checksum {s.checksum}
                  </div>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  {s.attestedAt ? (
                    <Badge tone="ok" icon="check">attested</Badge>
                  ) : (
                    <Button
                      size="sm"
                      icon="check"
                      onClick={() => {
                        attestShard(open.id, s.index);
                        toast(`Shard #${s.index} attested`);
                      }}
                    >
                      Attest
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" icon="eye" onClick={() => setReveal({ horcruxId: open.id, shard: s })}>
                    Reveal
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {reveal && (
        <Modal
          title={`Shard #${reveal.shard.index}`}
          subtitle={`${reveal.shard.custodian} · ${reveal.shard.location}`}
          icon="key"
          onClose={() => setReveal(null)}
          footer={<Button onClick={() => setReveal(null)}>Hide</Button>}
        >
          <div className="stack sm">
            <Callout tone="bad" icon="alert">
              This shard is one piece of your recovery material. Anyone who reads it — a camera, a shoulder, a clipboard
              sync — is one piece closer to your money.
            </Callout>
            <div className="mono tiny wrap-any" style={{ padding: 12, background: '#080a0d', border: '1px solid var(--line)', borderRadius: 8, lineHeight: 1.7 }}>
              {reveal.shard.hex}
            </div>
            <div className="row" style={{ gap: 8 }}>
              <Badge tone="info" icon="fingerprint">checksum {reveal.shard.checksum}</Badge>
              <CopyText value={reveal.shard.hex} display="Copy shard" mono={false} />
            </div>
            <div className="tiny muted">
              Print it, or write it. Do not photograph it, do not email it, and do not store it next to the other
              shards.
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- create modal */

function CreateHorcruxModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (input: {
    label: string;
    purpose: Horcrux['purpose'];
    secretText: string;
    m: number;
    n: number;
    custodians: { name: string; location: string }[];
    timelockDays: number;
    beneficiaries: { name: string; sharePct: number; contact: string }[];
  }) => Promise<void>;
}) {
  const { state, getMnemonic } = useVault();
  const toast = useToast();
  const [label, setLabel] = useState('');
  const [purpose, setPurpose] = useState<Horcrux['purpose']>('inheritance');
  const [source, setSource] = useState<string>('');
  const [custom, setCustom] = useState('');
  const [m, setM] = useState(2);
  const [n, setN] = useState(3);
  const [timelockDays, setTimelockDays] = useState(180);
  const [names, setNames] = useState<string[]>(['', '', '']);
  const [locations, setLocations] = useState<string[]>(['Home safe', 'Bank deposit box', 'Solicitor']);
  const [beneficiaries, setBeneficiaries] = useState<{ name: string; sharePct: number; contact: string }[]>([]);
  const [busy, setBusy] = useState(false);

  const setCount = (count: number) => {
    setN(count);
    setM((prev) => Math.min(prev, count));
    setNames((prev) => {
      const next = [...prev];
      while (next.length < count) next.push('');
      return next.slice(0, count);
    });
    setLocations((prev) => {
      const next = [...prev];
      while (next.length < count) next.push('');
      return next.slice(0, count);
    });
  };

  const create = async () => {
    setBusy(true);
    try {
      let secretText = custom;
      if (source) {
        const mnemonic = await getMnemonic(source);
        if (!mnemonic) throw new Error('Could not read that wallet’s key material');
        secretText = mnemonic;
      }
      if (!secretText.trim()) throw new Error('Nothing to shard');
      const custodians = names.map((name, i) => ({ name: name.trim() || `Custodian ${i + 1}`, location: locations[i]?.trim() || 'Unspecified' }));
      await onCreate({
        label: label.trim() || 'Untitled Horcrux',
        purpose,
        secretText: secretText.trim(),
        m,
        n,
        custodians,
        timelockDays,
        beneficiaries: beneficiaries.filter((b) => b.name.trim()),
      });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not create the Horcrux', 'bad');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      wide
      title="Create a Horcrux"
      subtitle="Shamir secret sharing over GF(256), computed on this device"
      icon="gem"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon="gem" loading={busy} disabled={!label.trim()} onClick={create}>
            Split into {n} shards
          </Button>
        </>
      }
    >
      <div className="grid g2">
        <div className="stack">
          <Field label="Label">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Family continuity plan" autoFocus />
          </Field>
          <Field label="Purpose">
            <Select
              value={purpose}
              onChange={(v) => setPurpose(v as Horcrux['purpose'])}
              options={[
                { value: 'inheritance', label: 'Inheritance' },
                { value: 'geo-redundancy', label: 'Geographic redundancy' },
                { value: 'guardian', label: 'Guardian custody' },
                { value: 'self-recovery', label: 'Personal recovery' },
              ]}
            />
          </Field>
          <Field label="What to shard" help="A wallet's recovery phrase, or any secret text of your own.">
            <Select
              value={source}
              onChange={setSource}
              options={[
                { value: '', label: 'Custom secret text' },
                ...(state?.wallets ?? []).filter((w) => w.mnemonicEnc).map((w) => ({ value: w.id, label: `${w.label} recovery phrase` })),
              ]}
            />
          </Field>
          {!source && (
            <Field label="Secret text">
              <Textarea mono rows={3} value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Paste the secret to protect" />
            </Field>
          )}
        </div>

        <div className="stack">
          <div className="grid g2">
            <Field label="Shards (n)">
              <Select
                value={String(n)}
                onChange={(v) => setCount(Number(v))}
                options={[2, 3, 4, 5, 6].map((v) => ({ value: String(v), label: String(v) }))}
              />
            </Field>
            <Field label="Required (m)">
              <Select
                value={String(m)}
                onChange={(v) => setM(Number(v))}
                options={Array.from({ length: n - 1 }, (_, i) => i + 2).map((v) => ({ value: String(v), label: String(v) }))}
              />
            </Field>
          </div>
          <Field label="Inheritance timelock (days)" help="Added on top of the missed-heartbeat window before a claim can open.">
            <Input type="number" value={timelockDays} onChange={(e) => setTimelockDays(Number(e.target.value))} />
          </Field>
          <div className="stack sm">
            <span className="label">Custodians</span>
            {names.map((name, i) => (
              <div className="row" style={{ gap: 8 }} key={i}>
                <span className="tiny mono muted" style={{ width: 18 }}>#{i + 1}</span>
                <Input value={name} onChange={(e) => setNames(names.map((x, j) => (j === i ? e.target.value : x)))} placeholder="Name" />
                <Input value={locations[i] ?? ''} onChange={(e) => setLocations(locations.map((x, j) => (j === i ? e.target.value : x)))} placeholder="Location" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <Field
        label="Beneficiaries"
        help="Recorded for your own clarity — this app cannot enforce a will, and no lawyer was involved in writing it."
        right={
          <Button
            size="sm"
            icon="plus"
            onClick={() => setBeneficiaries([...beneficiaries, { name: '', sharePct: 0, contact: '' }])}
          >
            Add
          </Button>
        }
      >
        <div className="stack sm">
          {beneficiaries.length === 0 && <div className="tiny muted">No beneficiaries named.</div>}
          {beneficiaries.map((b, i) => (
            <div className="row" style={{ gap: 8 }} key={i}>
              <Input
                value={b.name}
                onChange={(e) => setBeneficiaries(beneficiaries.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                placeholder="Name"
              />
              <Input
                type="number"
                style={{ width: 90 }}
                value={b.sharePct}
                onChange={(e) => setBeneficiaries(beneficiaries.map((x, j) => (j === i ? { ...x, sharePct: Number(e.target.value) } : x)))}
                placeholder="%"
              />
              <Input
                value={b.contact}
                onChange={(e) => setBeneficiaries(beneficiaries.map((x, j) => (j === i ? { ...x, contact: e.target.value } : x)))}
                placeholder="How to reach them"
              />
            </div>
          ))}
        </div>
      </Field>

      <Callout tone="warn" icon="alert">
        {m} of {n} shards will reconstruct the secret. Fewer than {m} reveals nothing. Store shards with people and in
        places that cannot be compromised by the same event.
      </Callout>
    </Modal>
  );
}

/* --------------------------------------------------------------- reconstruct */

function ReconstructPanel() {
  const { state, audit } = useVault();
  const toast = useToast();
  const [input, setInput] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lines = input.split('\n').map((l) => l.trim()).filter(Boolean);
  const checks = lines.map((l) => verifyShard(l));
  const validCount = checks.filter((c) => c.ok).length;
  const required = state?.horcruxes[0]?.m ?? 2;

  return (
    <Card title="Reconstruct a secret" subtitle="Combine shards to rebuild what was split" icon="key">
      <div className="stack">
        <Field
          label="Shards"
          help="Paste one shard per line. Everything happens in memory; nothing is written to the vault or the network."
          right={<Badge tone={validCount >= required ? 'ok' : 'warn'}>{validCount} valid</Badge>}
        >
          <Textarea mono rows={6} value={input} onChange={(e) => setInput(e.target.value)} placeholder="01a3f…" />
        </Field>

        {lines.length > 0 && (
          <div className="stack sm">
            {lines.map((line, i) => (
              <div key={i} className="row between" style={{ padding: '7px 10px', background: 'var(--panel-2)', borderRadius: 8 }}>
                <span className="tiny mono muted">#{i + 1} {line.slice(0, 18)}…</span>
                <Badge tone={checks[i]?.ok ? 'ok' : 'bad'} icon={checks[i]?.ok ? 'check' : 'x'}>
                  {checks[i]?.ok ? 'checksum ok' : checks[i]?.reason}
                </Badge>
              </div>
            ))}
          </div>
        )}

        {error && <Callout tone="bad" icon="alert">{error}</Callout>}

        {result && (
          <div className="stack sm">
            <div className="tiny muted">Reconstructed secret</div>
            <div className="mono small wrap-any" style={{ padding: 12, background: '#080a0d', border: '1px solid var(--line)', borderRadius: 8 }}>
              {result}
            </div>
            <Button size="sm" icon="eye-off" onClick={() => setResult(null)}>Hide and clear</Button>
          </div>
        )}

        <div className="row" style={{ gap: 8 }}>
          <Button
            variant="primary"
            icon="key"
            disabled={validCount < 2}
            onClick={() => {
              setError(null);
              try {
                const bytes = reconstructSecret(lines);
                const text = new TextDecoder().decode(bytes);
                setResult(text);
                audit({
                  at: Date.now(),
                  kind: 'horcrux',
                  title: 'Horcrux reconstructed',
                  detail: `${lines.length} shard(s) combined to rebuild a secret. Nothing was transmitted.`,
                  severity: 'critical',
                });
                toast('Secret reconstructed', 'ok');
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Reconstruction failed');
              }
            }}
          >
            Reconstruct
          </Button>
          <span className="tiny muted">
            Needs the threshold number of shards from the same set. Mixing shards from different sets produces garbage,
            never a warning.
          </span>
        </div>
      </div>
    </Card>
  );
}
