import { useMemo, useState } from 'react';
import { useVault } from '../state/store';
import { Badge, Button, Callout, Card, Field, Input, Modal, Ring, Select, Stat, Tabs, Textarea, ToggleRow, useToast } from '../ui/primitives';
import { Icon } from '../ui/icons';
import { postureReport, type PostureCheck } from '../core/security/posture';
import { analyzeDomain, screenAddress } from '../core/security/phishing';
import { getAsset, fmtUsd } from '../core/assets';
import { effectiveRules, ruleOf } from '../core/policy/evaluate';

type Tab = 'posture' | 'duress' | 'phishing' | 'contacts';

export function Security({ onNavigate }: { onNavigate: (page: string) => void }) {
  const { state, updateSettings, setDuress, duress, updateContact, removeContact, setRule, audit } = useVault();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('posture');
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pinModal, setPinModal] = useState(false);
  const [domain, setDomain] = useState('');
  const [address, setAddress] = useState('');
  const [addressAsset, setAddressAsset] = useState('btc');
  const [contactOpen, setContactOpen] = useState(false);

  const report = useMemo(() => (state ? postureReport(state) : null), [state]);

  if (!state || !report) return null;

  const domainVerdict = domain.trim() ? analyzeDomain(domain) : null;
  const addressVerdict = useMemo(() => {
    if (!address.trim()) return null;
    return screenAddress({
      asset: getAsset(addressAsset),
      address: address.trim(),
      recentAddresses: state.txs.filter((t) => t.txClass !== 'receive').map((t) => t.toAddress),
      contactAddresses: state.contacts.map((c) => c.address),
    });
  }, [address, addressAsset, state.txs, state.contacts]);

  const fails = report.checks.filter((c) => c.status === 'fail');

  return (
    <div className="stack">
      <div className="grid g3">
        <Card>
          <div className="row" style={{ gap: 16 }}>
            <Ring
              value={report.score}
              size={84}
              stroke={8}
              tone={report.score >= 72 ? 'var(--ok)' : report.score >= 50 ? 'var(--warn)' : 'var(--bad)'}
            >
              <div className="center">
                <div className="mono strong" style={{ fontSize: 20 }}>{report.score}</div>
                <div className="tiny muted">{report.grade}</div>
              </div>
            </Ring>
            <div style={{ minWidth: 0 }}>
              <div className="tiny muted" style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}>Security posture</div>
              <div className="small strong">{report.label}</div>
              <div className="tiny muted" style={{ marginTop: 4 }}>
                {report.checks.filter((c) => c.status === 'pass').length} of {report.checks.length} checks pass
              </div>
              {fails.length > 0 && (
                <div className="tiny" style={{ color: 'var(--bad)', marginTop: 4 }}>
                  {fails.length} critical gap(s)
                </div>
              )}
            </div>
          </div>
        </Card>
        <Card>
          <Stat
            k="Duress mode"
            v={duress ? 'Active' : 'Standby'}
            sub={state.settings.duressPin ? 'PIN configured' : 'No PIN set — set one'}
          />
          <div style={{ marginTop: 8 }}>
            <Button size="sm" variant={duress ? 'danger' : 'default'} icon="skull" onClick={() => { setDuress(!duress); toast(duress ? 'Duress mode off' : 'Duress mode on', duress ? 'ok' : 'bad'); }}>
              {duress ? 'Exit duress' : 'Enter duress'}
            </Button>
          </div>
        </Card>
        <Card>
          <Stat
            k="Verified payees"
            v={`${state.contacts.filter((c) => c.verifiedAt).length}/${state.contacts.length}`}
            sub="Confirmed out-of-band"
          />
          <div style={{ marginTop: 8 }}>
            <Button size="sm" icon="plus" onClick={() => setContactOpen(true)}>Add payee</Button>
          </div>
        </Card>
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'posture', label: 'Posture', icon: 'shield', count: report.checks.length },
          { id: 'duress', label: 'Duress', icon: 'skull' },
          { id: 'phishing', label: 'Phishing tools', icon: 'search' },
          { id: 'contacts', label: 'Secure Send', icon: 'users', count: state.contacts.length },
        ]}
      />

      {tab === 'posture' && (
        <Card title="Posture checks" subtitle="Weighted, and deliberately unforgiving" icon="shield">
          <div className="stack sm">
            {report.checks.map((check) => (
              <CheckRowView key={check.id} check={check} onNavigate={onNavigate} />
            ))}
          </div>
        </Card>
      )}

      {tab === 'duress' && (
        <div className="grid g2">
          <Card title="Duress mode" subtitle="What happens when someone makes you open the wallet" icon="skull" tone="warn">
            <div className="stack">
              <div className="small muted" style={{ lineHeight: 1.65 }}>
                Duress mode is the answer to the threat most wallets ignore: a person, not a script. While it is active,
                real wallets are hidden and frozen, decoy wallets are served, and nothing about the switch is written to
                the visible screen. The GHOST SHELL react drops session keys on entry.
              </div>
              <div className="divider" />
              <div className="row between">
                <span className="small strong">Duress PIN</span>
                {state.settings.duressPin ? <Badge tone="ok" icon="check">configured</Badge> : <Badge tone="bad" icon="alert">not set</Badge>}
              </div>
              <Button icon="key" onClick={() => setPinModal(true)}>
                {state.settings.duressPin ? 'Change duress PIN' : 'Set duress PIN'}
              </Button>
              <ToggleRow
                label="Show the duress unlock on the lock screen"
                help="Hiding it removes the obvious affordance, but you must remember how to get in."
                on={state.settings.duressUnlockVisible}
                onChange={(v) => updateSettings({ duressUnlockVisible: v })}
              />
              <ToggleRow
                label="Duress mode active now"
                help="Real wallets freeze; only decoys render."
                on={duress}
                onChange={(v) => {
                  setDuress(v);
                  toast(v ? 'Duress mode on — real wallets hidden' : 'Duress mode off', v ? 'bad' : 'ok');
                }}
              />
            </div>
          </Card>

          <Card title="Decoy wallets" subtitle="Funded on purpose, so surrendering them is believable" icon="eye">
            <div className="stack sm">
              {state.wallets.filter((w) => w.visibility === 'decoy').length === 0 && (
                <Callout tone="warn" icon="alert">
                  No decoy wallet exists. A duress PIN with nothing to hand over invites the assumption that you are
                  hiding something.
                </Callout>
              )}
              {state.wallets
                .filter((w) => w.visibility === 'decoy')
                .map((w) => {
                  const usd = w.accounts.reduce((n, a) => n + (w.balances[a.assetId] ?? 0) * getAsset(a.assetId).priceUsd, 0);
                  return (
                    <div key={w.id} className="row between" style={{ padding: '10px 12px', background: 'var(--panel-2)', borderRadius: 9 }}>
                      <div>
                        <div className="small strong">{w.label}</div>
                        <div className="tiny muted">{w.accounts.length} account(s)</div>
                      </div>
                      <div className="right">
                        <div className="small mono">{fmtUsd(usd)}</div>
                        <div className="tiny muted">plausible loss</div>
                      </div>
                    </div>
                  );
                })}
              <Button size="sm" icon="layers" onClick={() => onNavigate('wallets')}>
                Manage wallets & decoys
              </Button>
            </div>
          </Card>
        </div>
      )}

      {tab === 'phishing' && (
        <div className="grid g2">
          <Card title="Screen a destination" subtitle="Run the same checks the wallet runs at signing time" icon="search">
            <div className="stack">
              <Field label="Asset">
                <Select value={addressAsset} onChange={setAddressAsset} options={['btc', 'eth', 'xmr', 'zec', 'sol'].map((a) => ({ value: a, label: getAsset(a).symbol }))} />
              </Field>
              <Field label="Address">
                <Textarea mono rows={2} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Paste an address you were given" />
              </Field>
              {addressVerdict && (
                <div className="stack sm">
                  <div className="row" style={{ gap: 8 }}>
                    <Badge tone={addressVerdict.level === 'dangerous' ? 'bad' : addressVerdict.level === 'suspicious' ? 'warn' : 'ok'} icon={addressVerdict.level === 'clean' ? 'check' : 'alert'}>
                      {addressVerdict.level} · score {addressVerdict.score}
                    </Badge>
                    <Badge tone="info" icon="fingerprint">{addressVerdict.fingerprint}</Badge>
                    <Badge tone="info" icon="spark">{addressVerdict.words}</Badge>
                  </div>
                  {addressVerdict.findings.map((f) => (
                    <div key={f.code} className="stack sm" style={{ padding: '8px 10px', background: 'var(--panel-2)', borderRadius: 8 }}>
                      <span className="small strong">{f.label}</span>
                      <span className="tiny muted" style={{ lineHeight: 1.55 }}>{f.detail}</span>
                    </div>
                  ))}
                  <div className="small">{addressVerdict.recommendation}</div>
                </div>
              )}
            </div>
          </Card>

          <Card title="Screen a domain" subtitle="Homoglyphs, typosquats and lookalike subdomains" icon="globe">
            <div className="stack">
              <Field label="URL or hostname">
                <Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="https://example.com" />
              </Field>
              {domainVerdict && (
                <div className="stack sm">
                  <div className="row" style={{ gap: 8 }}>
                    <Badge tone={domainVerdict.level === 'dangerous' ? 'bad' : domainVerdict.level === 'suspicious' ? 'warn' : 'ok'} icon={domainVerdict.level === 'clean' ? 'check' : 'alert'}>
                      {domainVerdict.level}
                    </Badge>
                    <span className="mono small">{domainVerdict.host}</span>
                    {domainVerdict.impersonating && <Badge tone="bad" icon="alert">impersonates {domainVerdict.impersonating}</Badge>}
                  </div>
                  {domainVerdict.findings.map((f) => (
                    <div key={f.code} className="stack sm" style={{ padding: '8px 10px', background: 'var(--panel-2)', borderRadius: 8 }}>
                      <span className="small strong">{f.label}</span>
                      <span className="tiny muted" style={{ lineHeight: 1.55 }}>{f.detail}</span>
                    </div>
                  ))}
                  {domainVerdict.findings.length === 0 && (
                    <div className="small muted">No structural red flags. That is not the same as being safe — check the certificate and the URL yourself.</div>
                  )}
                </div>
              )}
            </div>
          </Card>

          <Card title="Denylist" subtitle="Addresses this vault refuses to pay" icon="x">
            <div className="stack sm">
              {(() => {
                const rule = ruleOf(state.policy.rules, 'denylist');
                const list = Array.isArray(rule?.params.addresses) ? (rule!.params.addresses as string[]) : [];
                if (list.length === 0) return <div className="small muted">Nothing denylisted yet. The phishing shield adds entries automatically when it blocks a destination.</div>;
                return list.map((addr) => (
                  <div key={addr} className="row between" style={{ padding: '8px 10px', background: 'var(--panel-2)', borderRadius: 8 }}>
                    <span className="tiny mono wrap-any">{addr}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon="x"
                      onClick={() =>
                        setRule('denylist', {
                          enabled: true,
                          params: { addresses: list.filter((a) => a !== addr) },
                        })
                      }
                    >
                      Remove
                    </Button>
                  </div>
                ));
              })()}
            </div>
          </Card>

          <Card title="Phishing shield coverage" subtitle="Per-wallet status" icon="shield-check">
            <div className="stack sm">
              {state.wallets
                .filter((w) => w.visibility !== 'hidden')
                .map((w) => {
                  const rules = effectiveRules(state.policy, w.id, w.tier);
                  const on = ruleOf(rules, 'phishingShield')?.enabled ?? false;
                  return (
                    <div key={w.id} className="row between">
                      <div>
                        <div className="small strong">{w.label}</div>
                        <div className="tiny muted">Tier {w.tier} · {TIER_NAME(w.tier)}</div>
                      </div>
                      <div className="row" style={{ gap: 8 }}>
                        <Badge tone={on ? 'ok' : 'bad'} icon={on ? 'shield-check' : 'shield-off'}>{on ? 'shielded' : 'unprotected'}</Badge>
                        <ToggleRow
                          label=""
                          on={on}
                          onChange={(v) => setRule('phishingShield', { enabled: v }, w.id)}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          </Card>
        </div>
      )}

      {tab === 'contacts' && (
        <Card
          title="Secure Send payees"
          subtitle="Verify the fingerprint over a second channel, once, and every later payment is safe by default"
          icon="users"
          actions={<Button size="sm" icon="plus" onClick={() => setContactOpen(true)}>Add payee</Button>}
        >
          {state.contacts.length === 0 ? (
            <div className="small muted">No saved payees yet.</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Label</th>
                  <th>Asset</th>
                  <th>Address</th>
                  <th>Verified</th>
                  <th className="right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {state.contacts.map((c) => (
                  <tr key={c.id}>
                    <td className="small strong">{c.label}</td>
                    <td className="small muted">{getAsset(c.assetId).symbol}</td>
                    <td className="tiny mono wrap-any" style={{ maxWidth: 260 }}>{c.address}</td>
                    <td>
                      {c.verifiedAt ? (
                        <Badge tone="ok" icon="check">{c.verifiedVia} · {new Date(c.verifiedAt).toLocaleDateString()}</Badge>
                      ) : (
                        <Badge tone="warn" icon="alert">unverified</Badge>
                      )}
                    </td>
                    <td className="right">
                      <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                        {!c.verifiedAt && (
                          <Button
                            size="sm"
                            icon="check"
                            onClick={() => {
                              updateContact(c.id, { verifiedAt: Date.now(), verifiedVia: 'in-person' });
                              audit({
                                at: Date.now(),
                                kind: 'security',
                                title: 'Payee verified',
                                detail: `${c.label} fingerprint confirmed out-of-band.`,
                                severity: 'info',
                              });
                              toast('Payee marked verified');
                            }}
                          >
                            Verify
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" icon="trash" onClick={() => removeContact(c.id)}>
                          Remove
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {pinModal && (
        <Modal
          title="Duress PIN"
          subtitle="A PIN that opens the decoy view — not your real vault"
          icon="skull"
          onClose={() => setPinModal(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setPinModal(false)}>Cancel</Button>
              <Button
                variant="primary"
                disabled={pin.length < 4 || pin !== pinConfirm}
                onClick={() => {
                  updateSettings({ duressPin: pin });
                  setPin('');
                  setPinConfirm('');
                  setPinModal(false);
                  audit({
                    at: Date.now(),
                    kind: 'security',
                    title: 'Duress PIN configured',
                    detail: 'A duress PIN was set. Real wallets will hide and freeze when it is used.',
                    severity: 'warn',
                  });
                  toast('Duress PIN set', 'ok');
                }}
              >
                Save PIN
              </Button>
            </>
          }
        >
          <div className="stack">
            <Field label="New PIN" help="At least 4 characters. It should be nothing like your real passphrase.">
              <Input type="password" value={pin} onChange={(e) => setPin(e.target.value)} autoFocus />
            </Field>
            <Field label="Confirm PIN">
              <Input type="password" value={pinConfirm} onChange={(e) => setPinConfirm(e.target.value)} />
            </Field>
            <Callout tone="warn" icon="alert">
              Under duress, enter this PIN at the lock screen. You will see a small, believable wallet. Your real
              holdings stay encrypted and frozen for the configured freeze window.
            </Callout>
          </div>
        </Modal>
      )}

      {contactOpen && <ContactModal onClose={() => setContactOpen(false)} />}
    </div>
  );
}

function TIER_NAME(tier: number): string {
  return ['Glacier', 'Sentinel', 'Operator', 'Reactor', 'Reclaimer'][tier] ?? '';
}

function CheckRowView({ check, onNavigate }: { check: PostureCheck; onNavigate: (page: string) => void }) {
  const tone = check.status === 'pass' ? 'var(--ok)' : check.status === 'warn' ? 'var(--warn)' : 'var(--bad)';
  return (
    <div
      style={{
        padding: '11px 13px',
        border: '1px solid var(--line-soft)',
        borderLeft: `3px solid ${tone}`,
        borderRadius: 10,
        background: 'var(--panel-2)',
      }}
    >
      <div className="row between" style={{ alignItems: 'flex-start', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div className="row" style={{ gap: 8 }}>
            <span style={{ color: tone, display: 'grid' }}>
              <Icon name={check.status === 'pass' ? 'check' : check.status === 'warn' ? 'alert' : 'x'} size={13} />
            </span>
            <span className="small strong">{check.label}</span>
            <Badge tone={check.status === 'pass' ? 'ok' : check.status === 'warn' ? 'warn' : 'bad'}>{check.status}</Badge>
            <span className="tiny dim">weight {check.weight}</span>
          </div>
          <div className="tiny muted" style={{ marginTop: 4, lineHeight: 1.55 }}>{check.detail}</div>
        </div>
        {check.status !== 'pass' && (
          <Button size="sm" iconRight="chevron-right" onClick={() => onNavigate(check.fix)}>
            Fix
          </Button>
        )}
      </div>
    </div>
  );
}

function ContactModal({ onClose }: { onClose: () => void }) {
  const { addContact, audit } = useVault();
  const toast = useToast();
  const [label, setLabel] = useState('');
  const [address, setAddress] = useState('');
  const [assetId, setAssetId] = useState('btc');
  const [via, setVia] = useState<'in-person' | 'signal' | 'pgp' | 'unverified'>('in-person');

  return (
    <Modal
      title="Add a payee"
      subtitle="Save the address once, verify it out-of-band, then never re-check the middle again"
      icon="users"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!label.trim() || !address.trim()}
            onClick={() => {
              const verified = via !== 'unverified';
              addContact({
                label: label.trim(),
                address: address.trim(),
                assetId,
                fingerprint: '',
                verifiedAt: verified ? Date.now() : undefined,
                verifiedVia: via,
              });
              audit({
                at: Date.now(),
                kind: 'security',
                title: 'Payee added',
                detail: `${label.trim()} saved as ${verified ? 'verified' : 'unverified'} (${via}).`,
                severity: verified ? 'info' : 'warn',
              });
              toast('Payee saved');
              onClose();
            }}
          >
            Save payee
          </Button>
        </>
      }
    >
      <div className="stack">
        <Field label="Label">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Brother · cold storage" autoFocus />
        </Field>
        <Field label="Asset">
          <Select value={assetId} onChange={setAssetId} options={['btc', 'eth', 'xmr', 'zec', 'usdc', 'sol'].map((a) => ({ value: a, label: getAsset(a).symbol }))} />
        </Field>
        <Field label="Address">
          <Textarea mono rows={2} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Paste the address they gave you" />
        </Field>
        <Field label="How did you verify it?" help="An address pasted from a chat window is not verification.">
          <Select
            value={via}
            onChange={(v) => setVia(v as typeof via)}
            options={[
              { value: 'in-person', label: 'Read it back in person' },
              { value: 'signal', label: 'Confirmed on an end-to-end encrypted call' },
              { value: 'pgp', label: 'PGP-signed message' },
              { value: 'unverified', label: 'Not verified yet' },
            ]}
          />
        </Field>
      </div>
    </Modal>
  );
}
