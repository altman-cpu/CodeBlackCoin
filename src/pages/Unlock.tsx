import { useEffect, useState } from 'react';
import { Button, Callout, Input, Field } from '../ui/primitives';
import { Icon } from '../ui/icons';
import { useVault } from '../state/store';

export function Unlock({ onStart, onRestore }: { onStart: () => void; onRestore: () => void }) {
  const { unlock, unlockDuress, busy, error, state } = useVault();
  const [passphrase, setPassphrase] = useState('');
  const [duressMode, setDuressMode] = useState(false);
  const [pin, setPin] = useState('');
  const [note, setNote] = useState<string | null>(null);

  const submit = async () => {
    setNote(null);
    try {
      await unlock(passphrase);
      setPassphrase('');
    } catch {
      /* error surfaces via context */
    }
  };

  const submitDuress = async () => {
    setNote(null);
    const ok = await unlockDuress(pin);
    if (!ok) setNote('That duress PIN is not the one configured for this vault.');
    setPin('');
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && passphrase && !duressMode) void submit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passphrase, duressMode]);

  return (
    <div className="lock-screen">
      <div className="lock-card stack">
        <div className="center stack sm" style={{ marginBottom: 6 }}>
          <div className="brand-mark" style={{ width: 44, height: 44, margin: '0 auto', borderRadius: 13 }}>
            <Icon name="vault" size={22} />
          </div>
          <div>
            <div className="brand-name" style={{ fontSize: 15 }}>BLACKVAULT</div>
            <div className="tiny muted">Vault locked · keys held in memory only while open</div>
          </div>
        </div>

        <div className="card">
          <div className="card-body stack">
            {!duressMode ? (
              <>
                <Field label="Passphrase">
                  <Input
                    type="password"
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    placeholder="Enter your passphrase"
                    autoFocus
                  />
                </Field>
                {error && <Callout tone="bad" icon="alert">{error}</Callout>}
                <Button variant="primary" block loading={busy} disabled={!passphrase} onClick={submit} icon="unlock">
                  Unlock
                </Button>
                {(state?.settings.duressUnlockVisible ?? true) && (
                  <button className="btn ghost sm" onClick={() => setDuressMode(true)} type="button">
                    <Icon name="skull" size={13} /> Duress unlock
                  </button>
                )}
              </>
            ) : (
              <>
                <Field
                  label="Duress PIN"
                  help="Opens the decoy view: real wallets stay encrypted and hidden, and nothing about the switch is shown on screen."
                >
                  <Input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="Duress PIN" autoFocus />
                </Field>
                {note && <Callout tone="warn" icon="alert">{note}</Callout>}
                <Button block onClick={submitDuress} icon="skull">
                  Open decoy view
                </Button>
                <button className="btn ghost sm" onClick={() => setDuressMode(false)} type="button">
                  <Icon name="chevron-left" size={13} /> Back
                </button>
              </>
            )}
          </div>
        </div>

        <div className="row between">
          <span className="tiny muted">No vault here?</span>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn ghost sm" onClick={onStart} type="button">Create</button>
            <button className="btn ghost sm" onClick={onRestore} type="button">Restore</button>
          </div>
        </div>

        <div className="tiny dim center" style={{ lineHeight: 1.6 }}>
          Nothing is transmitted during unlock. The passphrase is stretched with PBKDF2-SHA256 (600,000 rounds) and
          discarded from memory when the vault locks.
        </div>
      </div>
    </div>
  );
}
