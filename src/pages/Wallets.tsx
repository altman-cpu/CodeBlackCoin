import { useMemo, useState } from 'react';
import { useVault } from '../state/store';
import { Badge, Button, Card, CopyText, Empty, Field, Input, Modal, Select, Stat, TierBadge, ToggleRow, Callout, Maskable } from '../ui/primitives';
import { Icon } from '../ui/icons';
import { getAsset, fmtAmount, fmtUsd, priceUsdAt } from '../core/assets';
import { TIERS, TIER_MAP } from '../core/policy/tiers';
import { WALLET_ASSET_PRESETS } from '../state/seed';
import type { TierId, Visibility, Wallet } from '../core/types';
import { useToast } from '../ui/primitives';

export function Wallets() {
  const { state, addWallet, freeze, unfreeze, audit } = useVault();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(true);

  const wallets = useMemo(
    () => (state?.wallets ?? []).filter((w) => showHidden || w.visibility !== 'hidden'),
    [state?.wallets, showHidden],
  );
  const detail = state?.wallets.find((w) => w.id === selected) ?? null;

  if (!state) return null;

  return (
    <div className="stack">
      <div className="grid g3">
        <Card>
          <Stat k="Wallets" v={state.wallets.length} sub={`${state.wallets.filter((w) => w.visibility === 'decoy').length} decoy`} />
        </Card>
        <Card>
          <Stat k="Accounts" v={state.wallets.reduce((n, w) => n + w.accounts.length, 0)} sub="Derived on-device" />
        </Card>
        <Card>
          <Stat
            k="Frozen"
            v={state.frozenWallets.length}
            sub={state.frozenWallets.length ? 'Held by a defensive react' : 'All wallets can move'}
          />
        </Card>
      </div>

      <Card
        title="Your wallets"
        subtitle="Each wallet has its own tier, visibility and policy overrides"
        icon="layers"
        actions={
          <div className="row" style={{ gap: 8 }}>
            <ToggleRow label="" on={showHidden} onChange={setShowHidden} />
            <span className="tiny muted">Show hidden</span>
            <Button size="sm" variant="primary" icon="plus" onClick={() => setCreating(true)}>
              New wallet
            </Button>
          </div>
        }
      >
        {wallets.length === 0 ? (
          <Empty icon="layers" title="No wallets visible">
            Create a wallet, or turn on "Show hidden" to see wallets you have concealed.
          </Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Wallet</th>
                <th>Tier</th>
                <th>Kind</th>
                <th>Assets</th>
                <th className="right">Balance</th>
                <th className="right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {wallets.map((w) => {
                const usd = w.accounts.reduce((n, a) => n + (w.balances[a.assetId] ?? 0) * priceUsdAt(getAsset(a.assetId)), 0);
                const frozen = state.frozenWallets.includes(w.id);
                return (
                  <tr key={w.id} className="clickable" onClick={() => setSelected(w.id)}>
                    <td>
                      <div className="row" style={{ gap: 10 }}>
                        <div
                          style={{
                            width: 30, height: 30, borderRadius: 9, display: 'grid', placeItems: 'center',
                            background: `${TIER_MAP[w.tier].color}1a`, color: TIER_MAP[w.tier].color, flex: 'none',
                          }}
                        >
                          <Icon name={w.kind === 'passkey' ? 'fingerprint' : w.kind === 'hardware' ? 'cpu' : 'vault'} size={15} />
                        </div>
                        <div>
                          <div className="row" style={{ gap: 8 }}>
                            <span className="small strong">{w.label}</span>
                            {frozen && <Badge tone="bad" icon="pause">frozen</Badge>}
                            {w.visibility === 'hidden' && <Badge icon="eye-off">hidden</Badge>}
                            {w.visibility === 'decoy' && <Badge tone="warn" icon="skull">decoy</Badge>}
                          </div>
                          <div className="tiny muted mono">fp {w.fingerprint}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <TierBadge tier={w.tier} label={TIER_MAP[w.tier].codename} />
                    </td>
                    <td className="small muted">{w.kind}</td>
                    <td>
                      <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
                        {w.accounts.slice(0, 5).map((a) => {
                          const asset = getAsset(a.assetId);
                          return (
                            <span key={a.id} className="badge" title={asset.name} style={{ borderColor: asset.color + '44' }}>
                              <span style={{ width: 6, height: 6, borderRadius: 4, background: asset.color }} />
                              {asset.symbol}
                            </span>
                          );
                        })}
                        {w.accounts.length > 5 && <span className="tiny muted">+{w.accounts.length - 5}</span>}
                      </div>
                    </td>
                    <td className="right mono small strong">
                      <Maskable hidden={state.settings.hideBalances}>{fmtUsd(usd, { compact: true })}</Maskable>
                    </td>
                    <td className="right">
                      <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={frozen ? 'play' : 'pause'}
                          onClick={(e) => {
                            e.stopPropagation();
                            frozen ? unfreeze(w.id) : freeze(w.id);
                            audit({
                              at: Date.now(),
                              kind: 'wallet',
                              title: frozen ? 'Wallet unfrozen' : 'Wallet frozen manually',
                              detail: `${w.label} — ${frozen ? 'released by the operator' : 'held by the operator'}`,
                              severity: 'warn',
                            });
                          }}
                        >
                          {frozen ? 'Release' : 'Freeze'}
                        </Button>
                        <Button size="sm" variant="ghost" iconRight="chevron-right" onClick={(e) => { e.stopPropagation(); setSelected(w.id); }}>
                          Open
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      {creating && (
        <CreateWalletModal
          onClose={() => setCreating(false)}
          onCreate={async (input) => {
            const wallet = await addWallet(input);
            setCreating(false);
            setSelected(wallet.id);
            toast(`Wallet "${wallet.label}" created`);
          }}
        />
      )}

      {detail && <WalletDetail wallet={detail} onClose={() => setSelected(null)} />}
    </div>
  );
}

/* ------------------------------------------------------------- create modal */

function CreateWalletModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (input: {
    label: string;
    tier: TierId;
    assetIds: string[];
    kind: 'seed' | 'passkey' | 'hardware' | 'watch';
    visibility: Visibility;
    notes?: string;
  }) => void;
}) {
  const [label, setLabel] = useState('');
  const [tier, setTier] = useState<TierId>(1);
  const [preset, setPreset] = useState('mixed');
  const [kind, setKind] = useState<'seed' | 'passkey' | 'hardware' | 'watch'>('seed');
  const [visibility, setVisibility] = useState<Visibility>('visible');
  const [busy, setBusy] = useState(false);

  const assetIds = WALLET_ASSET_PRESETS.find((p) => p.id === preset)?.assets ?? ['btc'];
  const tierDef = TIER_MAP[tier];

  return (
    <Modal
      title="Create a wallet"
      subtitle="Keys are generated on this device and sealed with your session key"
      icon="plus"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            icon="vault"
            loading={busy}
            disabled={!label.trim()}
            onClick={async () => {
              setBusy(true);
              try {
                onCreate({ label: label.trim(), tier, assetIds, kind, visibility });
              } finally {
                setBusy(false);
              }
            }}
          >
            Create wallet
          </Button>
        </>
      }
    >
      <Field label="Label" help="Names are stored inside the encrypted vault only.">
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Travel cash" autoFocus />
      </Field>

      <Field label="Tier" help={tierDef.blurb}>
        <div className="stack sm">
          {TIERS.map((t) => (
            <button
              key={t.id}
              className="row between"
              onClick={() => setTier(t.id)}
              style={{
                padding: '10px 12px',
                borderRadius: 10,
                border: `1px solid ${tier === t.id ? t.color + '66' : 'var(--line-soft)'}`,
                background: tier === t.id ? t.color + '12' : 'var(--panel-2)',
                color: 'var(--text)',
                cursor: 'pointer',
                width: '100%',
                fontFamily: 'inherit',
                textAlign: 'left',
              }}
            >
              <span className="row" style={{ gap: 8 }}>
                <TierBadge tier={t.id} label={t.codename} />
                <span className="small">{t.name}</span>
              </span>
              <span className="tiny muted" style={{ maxWidth: 320 }}>{t.purpose}</span>
            </button>
          ))}
        </div>
      </Field>

      <Field label="Assets" help={WALLET_ASSET_PRESETS.find((p) => p.id === preset)?.blurb}>
        <Select
          value={preset}
          onChange={setPreset}
          options={WALLET_ASSET_PRESETS.map((p) => ({ value: p.id, label: `${p.label} — ${p.assets.length} asset(s)` }))}
        />
      </Field>

      <div className="grid g2">
        <Field label="Kind">
          <Select
            value={kind}
            onChange={(v) => setKind(v as typeof kind)}
            options={[
              { value: 'seed', label: 'Seed (BIP-39)' },
              { value: 'passkey', label: 'Passkey-backed' },
              { value: 'hardware', label: 'Hardware co-sign' },
              { value: 'watch', label: 'Watch-only' },
            ]}
          />
        </Field>
        <Field label="Visibility" help="Hidden wallets disappear from the interface; decoys are what a coerced operator sees.">
          <Select
            value={visibility}
            onChange={(v) => setVisibility(v as Visibility)}
            options={[
              { value: 'visible', label: 'Visible' },
              { value: 'hidden', label: 'Hidden' },
              { value: 'decoy', label: 'Decoy (shown under duress)' },
            ]}
          />
        </Field>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ detail */

function WalletDetail({ wallet, onClose }: { wallet: Wallet; onClose: () => void }) {
  const { state, updateWallet, setWalletTier, removeWallet, rotateAddresses, getMnemonic, audit } = useVault();
  const toast = useToast();
  const [mnemonic, setMnemonic] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmReveal, setConfirmReveal] = useState(false);

  const frozen = state?.frozenWallets.includes(wallet.id) ?? false;

  return (
    <Modal
      wide
      title={wallet.label}
      subtitle={`Fingerprint ${wallet.fingerprint} · created ${new Date(wallet.createdAt).toLocaleString()}`}
      icon="vault"
      onClose={onClose}
      footer={
        <>
          {confirmDelete ? (
            <Button
              variant="danger"
              icon="trash"
              onClick={() => {
                removeWallet(wallet.id);
                toast('Wallet removed from the vault');
                onClose();
              }}
            >
              Confirm permanent removal
            </Button>
          ) : (
            <Button variant="ghost" icon="trash" onClick={() => setConfirmDelete(true)}>
              Remove wallet
            </Button>
          )}
          <Button onClick={onClose}>Done</Button>
        </>
      }
    >
      <div className="grid g2">
        <div className="stack">
          <Field label="Tier" help={TIER_MAP[wallet.tier].blurb}>
            <Select
              value={String(wallet.tier)}
              onChange={(v) => {
                const tier = Number(v) as TierId;
                setWalletTier(wallet.id, tier);
                toast(`Moved to tier ${tier} — ${TIER_MAP[tier].codename}`);
              }}
              options={TIERS.map((t) => ({ value: String(t.id), label: `T${t.id} · ${t.codename} — ${t.name}` }))}
            />
          </Field>

          <Field label="Visibility">
            <Select
              value={wallet.visibility}
              onChange={(v) => updateWallet(wallet.id, { visibility: v as Visibility })}
              options={[
                { value: 'visible', label: 'Visible' },
                { value: 'hidden', label: 'Hidden' },
                { value: 'decoy', label: 'Decoy (shown under duress)' },
              ]}
            />
          </Field>

          <Field label="Notes">
            <Input
              value={wallet.notes ?? ''}
              placeholder="What is this wallet for?"
              onChange={(e) => updateWallet(wallet.id, { notes: e.target.value })}
            />
          </Field>

          <div className="row" style={{ gap: 8 }}>
            <Button
              size="sm"
              icon="refresh"
              onClick={async () => {
                await rotateAddresses(wallet.id);
                audit({
                  at: Date.now(),
                  kind: 'wallet',
                  title: 'Receiving addresses rotated',
                  detail: `${wallet.label} — fresh addresses derived for every asset.`,
                  severity: 'info',
                });
                toast('Fresh receiving addresses derived');
              }}
            >
              Rotate addresses
            </Button>
          </div>
        </div>

        <div className="stack">
          <Card title="Recovery phrase" icon="key" tone="warn">
            <div className="stack sm">
              <div className="tiny muted">
                Anyone with these words owns this wallet. Reveal them only in a room with no cameras and no phones —
                including your own.
              </div>
              {mnemonic ? (
                <>
                  <div className="seedgrid">
                    {mnemonic.split(' ').map((word, i) => (
                      <div className="seedword" key={i}>
                        <span className="n">{i + 1}</span>
                        {word}
                      </div>
                    ))}
                  </div>
                  <Button size="sm" icon="eye-off" onClick={() => setMnemonic(null)}>
                    Hide
                  </Button>
                </>
              ) : confirmReveal ? (
                <div className="row" style={{ gap: 8 }}>
                  <Button
                    size="sm"
                    variant="danger"
                    icon="eye"
                    onClick={async () => {
                      const m = await getMnemonic(wallet.id);
                      setMnemonic(m);
                      setConfirmReveal(false);
                      audit({
                        at: Date.now(),
                        kind: 'security',
                        title: 'Recovery phrase revealed',
                        detail: `${wallet.label} — mnemonic displayed on screen.`,
                        severity: 'critical',
                      });
                    }}
                  >
                    I am alone — reveal
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmReveal(false)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button size="sm" icon="eye" onClick={() => setConfirmReveal(true)}>
                  Reveal recovery phrase
                </Button>
              )}
            </div>
          </Card>
        </div>
      </div>

      <Card title="Accounts" subtitle="Derived addresses and their derivation paths" icon="grid">
        <table className="table">
          <thead>
            <tr>
              <th>Asset</th>
              <th>Address</th>
              <th>Path</th>
              <th className="right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {wallet.accounts.map((a) => {
              const asset = getAsset(a.assetId);
              return (
                <tr key={a.id}>
                  <td>
                    <div className="row" style={{ gap: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 4, background: asset.color }} />
                      <span className="small strong">{asset.symbol}</span>
                      {asset.family === 'sim' && <Badge tone="warn">watch-only</Badge>}
                    </div>
                  </td>
                  <td>
                    <CopyText value={a.address} display={a.address.length > 26 ? `${a.address.slice(0, 14)}…${a.address.slice(-8)}` : a.address} />
                  </td>
                  <td className="tiny mono muted">{a.hdPath}</td>
                  <td className="right mono small">
                    {fmtAmount(wallet.balances[a.assetId] ?? 0, asset)} {asset.symbol}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {frozen && (
        <Callout tone="bad" icon="pause">
          This wallet is frozen by a defensive react. Outbound movements are refused by the policy engine until you
          release it.
        </Callout>
      )}
    </Modal>
  );
}
