import { useState } from 'react';
import { Button, Callout, Card, CheckRow, Field, Input, Steps, Textarea, ToggleRow, Badge, Meter } from '../ui/primitives';
import { Icon } from '../ui/icons';
import { useVault } from '../state/store';
import { passphraseGrade, enrolPasskey, passkeySupported, type PasskeyRecord } from '../core/crypto/keystore';
import { validateMnemonic } from '../core/keys/derive';
import { TIERS } from '../core/policy/tiers';
import { WALLET_ASSET_PRESETS } from '../state/seed';

type Mode = 'create' | 'restore';
const STEP_LABELS = ['Choose', 'Key material', 'Lock it', 'Back it up'];

export function Onboarding({ onBack, initialMode = 'create' }: { onBack: () => void; initialMode?: Mode }) {
  const { createVault, busy, error } = useVault();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [step, setStep] = useState(0);

  const [mnemonic, setMnemonic] = useState('');
  const [preset, setPreset] = useState('mixed');
  const [passphrase, setPassphrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [enrol, setEnrol] = useState(false);
  const [passkey, setPasskey] = useState<PasskeyRecord | null>(null);
  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  const [grade] = useState(() => (p: string) => passphraseGrade(p));

  const strength = grade(passphrase);
  const mnemonicOk = validateMnemonic(mnemonic.trim());
  const canContinue =
    step === 0
      ? true
      : step === 1
        ? mode === 'create' || mnemonicOk
        : step === 2
          ? passphrase.length >= 10 && passphrase === confirm && accepted
          : true;

  const start = async () => {
    await createVault(passphrase, {
      passkeyId: passkey?.credentialId,
      restoreMnemonic: mode === 'restore' ? mnemonic.trim() : undefined,
    });
  };

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 20px 80px' }}>
      <div className="row" style={{ gap: 10, marginBottom: 18 }}>
        <Button variant="ghost" size="sm" icon="chevron-left" onClick={onBack}>
          Back
        </Button>
        <div className="spacer" />
        <Badge tone="ok" icon="lock">Everything stays on this device</Badge>
      </div>

      <h1 style={{ marginBottom: 6 }}>{mode === 'create' ? 'Create your vault' : 'Restore your vault'}</h1>
      <p className="muted small" style={{ marginBottom: 20 }}>
        {mode === 'create'
          ? 'Key material is generated here, encrypted here, and never transmitted. There is no account to create because there is no server that knows you exist.'
          : 'Enter a recovery phrase you already hold. It is decrypted, derived and scanned on this device — nothing is uploaded.'}
      </p>

      <Steps steps={STEP_LABELS} current={step} />

      <div className="stack" style={{ marginTop: 20 }}>
        {step === 0 && (
          <div className="grid g2">
            <Card
              title="New vault"
              icon="vault"
              className="accent-ok"
              footer={
                <Button variant="primary" block onClick={() => { setMode('create'); setStep(1); }}>
                  Generate keys <Icon name="arrow-right" size={14} />
                </Button>
              }
            >
              <p className="small muted">
                Fresh BIP-39 entropy from this device's CSPRNG. You get a demo treasury across five tiers plus a decoy,
                so every feature is explorable immediately.
              </p>
            </Card>
            <Card
              title="Restore from phrase"
              icon="key"
              footer={
                <Button block onClick={() => { setMode('restore'); setStep(1); }}>
                  Enter recovery phrase
                </Button>
              }
            >
              <p className="small muted">
                Already have a 12/24-word phrase? Derive its addresses, scan for balances, and bring it under policy.
                The phrase is validated locally before anything is derived.
              </p>
            </Card>
          </div>
        )}

        {step === 1 && mode === 'restore' && (
          <Card title="Recovery phrase" subtitle="Validated locally — it never leaves this device" icon="key">
            <div className="stack">
              <Field
                label="BIP-39 recovery phrase"
                help="12, 18 or 24 words. Separate them with spaces."
                right={
                  mnemonic ? (
                    <Badge tone={mnemonicOk ? 'ok' : 'bad'} icon={mnemonicOk ? 'check' : 'x'}>
                      {mnemonicOk ? 'Valid' : 'Invalid'}
                    </Badge>
                  ) : null
                }
              >
                <Textarea
                  mono
                  value={mnemonic}
                  onChange={(e) => setMnemonic(e.target.value)}
                  placeholder="alcohol rare ..."
                  rows={3}
                />
              </Field>
              <Field label="Assets to scan" help="Each asset derives its first three addresses and checks the balance.">
                <div className="row wrap" style={{ gap: 8 }}>
                  {WALLET_ASSET_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      className={`btn sm ${preset === p.id ? 'primary' : ''}`}
                      onClick={() => setPreset(p.id)}
                      type="button"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </Field>
              <Callout tone="warn" icon="alert">
                Assets without derivation implemented in this build are shown as watch-only. The wallet will refuse to
                display a deposit address for them rather than risk your funds.
              </Callout>
            </div>
          </Card>
        )}

        {step === 1 && mode === 'create' && (
          <Card title="What gets created" icon="layers">
            <div className="stack sm">
              {[
                ['Glacier Reserve', 'Tier 0 — deep cold, 48-hour time-lock, 2-of-3 shards'],
                ['Everyday Carry', 'Tier 1 — guarded spending with velocity brakes'],
                ['Operations', 'Tier 2 — working balance for swaps and payments'],
                ['Reactor', 'Tier 3 — automation capable, consolidation enabled'],
                ['Spending (decoy)', 'Tier 1 — shown under duress, funded to be believable'],
              ].map(([name, desc]) => (
                <div className="row between" key={name} style={{ padding: '8px 0', borderBottom: '1px dashed var(--line-soft)' }}>
                  <span className="small strong">{name}</span>
                  <span className="tiny muted">{desc}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {step === 2 && (
          <Card title="Lock the vault" subtitle="This passphrase encrypts everything at rest" icon="lock">
            <div className="stack">
              <Field
                label="Passphrase"
                help="Minimum 10 characters. It is stretched with 600,000 rounds of PBKDF2-SHA256, but it is only ever as strong as it is guessable."
              >
                <Input type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} placeholder="••••••••••" autoFocus />
              </Field>
              {passphrase && (
                <div className="stack sm">
                  <div className="row between">
                    <span className="tiny muted">
                      Strength <span className="strong">{strength.label}</span> · ~{Math.round(strength.bits)} bits
                    </span>
                    <span className="tiny muted">10+ characters</span>
                  </div>
                  <Meter
                    value={Math.min(100, strength.bits)}
                    tone={strength.tone === 'bad' ? 'var(--bad)' : strength.tone === 'ok' ? 'var(--warn)' : 'var(--ok)'}
                  />
                </div>
              )}
              <Field label="Confirm passphrase">
                <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••••" />
              </Field>
              {confirm && confirm !== passphrase && (
                <div className="tiny" style={{ color: 'var(--bad)' }}>
                  Passphrases do not match.
                </div>
              )}

              <div className="divider" />

              <ToggleRow
                label="Enrol a passkey"
                help="Adds a platform passkey (Face ID, Touch ID, Windows Hello) to the key derivation. Biometrics open the vault; they never leave the device."
                on={enrol}
                onChange={(v) => {
                  setEnrol(v);
                  if (!v) setPasskey(null);
                }}
                badge={!passkeySupported() ? <Badge tone="warn">unavailable here</Badge> : undefined}
                disabled={!passkeySupported()}
              />
              {enrol && (
                <div className="row" style={{ gap: 10 }}>
                  <Button
                    size="sm"
                    icon="fingerprint"
                    onClick={async () => {
                      setPasskeyError(null);
                      try {
                        setPasskey(await enrolPasskey('Vault unlock'));
                      } catch (err) {
                        setPasskeyError(err instanceof Error ? err.message : 'Passkey enrolment failed');
                      }
                    }}
                  >
                    {passkey ? 'Re-enrol passkey' : 'Enrol now'}
                  </Button>
                  {passkey && <Badge tone="ok" icon="check">Passkey bound</Badge>}
                  {passkeyError && <span className="tiny" style={{ color: 'var(--warn)' }}>{passkeyError}</span>}
                </div>
              )}

              <CheckRow checked={accepted} onChange={setAccepted}>
                I understand this passphrase is the only way back in. Nobody can reset it, recover it, or hand it to me —
                including the people who wrote this software.
              </CheckRow>
            </div>
          </Card>
        )}

        {step === 3 && (
          <Card title="Before you finish" subtitle="Read this once" icon="shield" tone="warn">
            <div className="stack">
              <Callout tone="ok" icon="shield-check">
                Your vault will be encrypted with AES-256-GCM and stored on this device only. Balances are read through
                the adapter you configure; in the default simulated mode, nothing touches a network at all.
              </Callout>
              <Callout tone="warn" icon="gem">
                Creating a Horcrux (Shamir shards of your recovery material) is the single highest-value thing you can do
                next. Do it after setup, from the Horcrux page.
              </Callout>
              <div className="row wrap" style={{ gap: 8 }}>
                {TIERS.map((t) => (
                  <span key={t.id} className="badge tier" style={{ borderColor: t.color + '55', color: t.color }}>
                    T{t.id} {t.codename}
                  </span>
                ))}
              </div>
              {error && <Callout tone="bad" icon="alert">{error}</Callout>}
            </div>
          </Card>
        )}

        <div className="row between">
          <Button variant="ghost" icon="chevron-left" onClick={() => (step === 0 ? onBack() : setStep(step - 1))}>
            Back
          </Button>
          {step < 3 ? (
            <Button variant="primary" iconRight="chevron-right" disabled={!canContinue} onClick={() => setStep(step + 1)}>
              Continue
            </Button>
          ) : (
            <Button variant="primary" icon="vault" loading={busy} onClick={start}>
              Create vault
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
