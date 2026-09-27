import { useState } from 'react';
import { useVault } from '../state/store';
import { Badge, Button, Callout, Card, Field, Input, Modal, Select, ToggleRow, useToast } from '../ui/primitives';
import { Icon } from '../ui/icons';
import { ADAPTER_LABEL } from '../core/chain/adapter';
import { fmtUsd } from '../core/assets';

export function Settings() {
  const { state, updateSettings, lock, wipe, totals } = useVault();
  const toast = useToast();
  const [wipeOpen, setWipeOpen] = useState(false);
  const [wipeText, setWipeText] = useState('');

  if (!state) return null;

  return (
    <div className="stack">
      <div className="grid g2">
        <Card title="Privacy" subtitle="What this app knows about you: nothing" icon="eye">
          <div className="stack">
            <ToggleRow
              label="Hide balances by default"
              help="Blur every number until you reveal it. Cheap insurance against shoulders and screen shares."
              on={state.settings.hideBalances}
              onChange={(v) => updateSettings({ hideBalances: v })}
            />
            <ToggleRow
              label="Route reads through a proxy / Tor"
              help="A statement of intent in this build. In the desktop release it forces all chain traffic through your own SOCKS proxy."
              on={state.settings.routeThroughProxy}
              onChange={(v) => updateSettings({ routeThroughProxy: v })}
            />
            <ToggleRow
              label="Telemetry"
              help="Off means off: no analytics, no crash reporting, no accounts, no identifiers."
              on={state.settings.telemetry}
              onChange={(v) => updateSettings({ telemetry: v })}
            />
            <Field label="Display currency">
              <Select
                value={state.settings.fiat}
                onChange={(v) => updateSettings({ fiat: v as 'USD' | 'EUR' | 'CHF' })}
                options={[
                  { value: 'USD', label: 'USD' },
                  { value: 'EUR', label: 'EUR' },
                  { value: 'CHF', label: 'CHF' },
                ]}
              />
            </Field>
          </div>
        </Card>

        <Card title="Session" subtitle="How quickly the vault gives up its keys" icon="clock">
          <div className="stack">
            <Field label={`Auto-lock after ${state.settings.autoLockMinutes} minute(s) idle`}>
              <input
                className="slider"
                type="range"
                min={1}
                max={120}
                step={1}
                value={state.settings.autoLockMinutes}
                onChange={(e) => updateSettings({ autoLockMinutes: Number(e.target.value) })}
              />
            </Field>
            <div className="row" style={{ gap: 8 }}>
              <Button icon="lock" onClick={() => { lock(); toast('Vault locked'); }}>
                Lock now
              </Button>
              <span className="tiny muted">Session keys are dropped from memory; the encrypted vault stays on disk.</span>
            </div>
          </div>
        </Card>
      </div>

      <Card title="Chain data" subtitle="Where balances come from" icon="globe">
        <div className="stack">
          <ToggleRow
            label="Live chain reads"
            help="Off (default) uses the deterministic simulated ledger. On reads real balances for Bitcoin through a public mempool.space-compatible API."
            on={state.settings.chainMode === 'live'}
            onChange={(v) => {
              updateSettings({ chainMode: v ? 'live' : 'sim' });
              toast(v ? 'Live chain reads enabled for Bitcoin' : 'Simulated ledger', v ? 'warn' : 'ok');
            }}
          />
          <div className="grid g2">
            <Field label="Bitcoin endpoint">
              <Input
                mono
                value={state.settings.btcEndpoint}
                onChange={(e) => updateSettings({ btcEndpoint: e.target.value })}
                placeholder="https://mempool.space/api"
              />
            </Field>
            <Field label="EVM endpoint" help="Not used yet — EVM balances are simulated until an adapter lands.">
              <Input mono value={state.settings.evmEndpoint} onChange={(e) => updateSettings({ evmEndpoint: e.target.value })} placeholder="https://…" />
            </Field>
          </div>
          <div className="row wrap" style={{ gap: 8 }}>
            {Object.entries(ADAPTER_LABEL).map(([id, label]) => (
              <Badge key={id} tone={id === 'sim' && state.settings.chainMode === 'sim' ? 'ok' : 'default'}>
                {label}
              </Badge>
            ))}
          </div>
          <Callout tone="warn" icon="alert">
            Live mode is <strong>read-only</strong> in this build. Broadcasting real transactions needs an audited
            signing library (PSBT for Bitcoin, a typed-data signer for EVM); wiring a <code>fetch</code> call to a
            broadcaster and calling it a wallet is how people lose money.
          </Callout>
        </div>
      </Card>

      <Card title="Watchtower" subtitle="Event monitoring and automation" icon="radar">
        <div className="stack">
          <ToggleRow
            label="Watchtower enabled"
            help="Watches for poisoning, drainers, anomalous outflows and missed heartbeats, then runs the reacts you armed."
            on={state.settings.watchtower}
            onChange={(v) => updateSettings({ watchtower: v })}
          />
          <ToggleRow
            label="Show duress unlock on the lock screen"
            help="Turn it off to remove the affordance. You will need another way in."
            on={state.settings.duressUnlockVisible}
            onChange={(v) => updateSettings({ duressUnlockVisible: v })}
          />
        </div>
      </Card>

      <Card title="Vault" subtitle="What is stored on this device" icon="database" tone="warn">
        <div className="stack">
          <div className="row wrap" style={{ gap: 16 }}>
            <div>
              <div className="tiny muted">Wallets</div>
              <div className="small mono strong">{state.wallets.length}</div>
            </div>
            <div>
              <div className="tiny muted">Accounts</div>
              <div className="small mono strong">{state.wallets.reduce((n, w) => n + w.accounts.length, 0)}</div>
            </div>
            <div>
              <div className="tiny muted">Horcrux sets</div>
              <div className="small mono strong">{state.horcruxes.length}</div>
            </div>
            <div>
              <div className="tiny muted">Audit entries</div>
              <div className="small mono strong">{state.audit.length}</div>
            </div>
            <div>
              <div className="tiny muted">Value</div>
              <div className="small mono strong">{fmtUsd(totals.totalUsd, { compact: true })}</div>
            </div>
          </div>
          <Callout tone="bad" icon="alert">
            <strong>There is no recovery path.</strong> Delete the vault on this device without a working backup and the
            funds are gone permanently. That is the deal with self-custody, and it is not a bug we can fix for you.
          </Callout>
          <div className="row" style={{ gap: 8 }}>
            <Button variant="danger" icon="trash" onClick={() => setWipeOpen(true)}>
              Wipe vault from this device
            </Button>
          </div>
        </div>
      </Card>

      <Card title="Threat model" subtitle="Read this before trusting real money here" icon="shield">
        <div className="small muted" style={{ lineHeight: 1.7 }}>
          <p style={{ marginBottom: 10 }}>
            <strong style={{ color: 'var(--text)' }}>Protected:</strong> key material at rest (AES-256-GCM, PBKDF2-SHA256
            at 600,000 rounds), per-secret sealing with a session key that never touches disk, phishing and poisoning
            screening, and policy enforcement before any signature is produced.
          </p>
          <p style={{ marginBottom: 10 }}>
            <strong style={{ color: 'var(--text)' }}>Not protected:</strong> a malicious browser extension or XSS while
            the vault is unlocked (anything in the page can read memory), a keylogger capturing your passphrase, a
            compromised device, or a weak passphrase. Browser storage is not a secure enclave.
          </p>
          <p>
            For balances you would be genuinely upset to lose, use the desktop or mobile build, where the key can live in
            a platform keystore, and keep the bulk of it on tier 0.
          </p>
        </div>
      </Card>

      {wipeOpen && (
        <Modal
          title="Wipe this vault"
          subtitle="This cannot be undone and nobody can reverse it"
          icon="alert"
          onClose={() => setWipeOpen(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setWipeOpen(false)}>Cancel</Button>
              <Button
                variant="danger"
                icon="trash"
                disabled={wipeText !== 'WIPE'}
                onClick={async () => {
                  await wipe();
                  setWipeOpen(false);
                  toast('Vault wiped from this device', 'warn');
                }}
              >
                Wipe permanently
              </Button>
            </>
          }
        >
          <div className="stack">
            <Callout tone="bad" icon="alert">
              This deletes the encrypted vault, every wallet, every Horcrux record and the entire audit trail from this
              device. Funds are not destroyed — they become unreachable unless you hold the recovery material.
            </Callout>
            <Field label="Type WIPE to confirm">
              <Input value={wipeText} onChange={(e) => setWipeText(e.target.value)} placeholder="WIPE" autoFocus />
            </Field>
            <div className="row" style={{ gap: 6 }}>
              <Icon name="gem" size={13} className="muted" />
              <span className="tiny muted">
                Make sure a Horcrux or recovery phrase exists somewhere else before you do this.
              </span>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
