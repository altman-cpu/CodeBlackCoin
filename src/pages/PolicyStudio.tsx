import { useMemo, useState } from 'react';
import { useVault } from '../state/store';
import { Badge, Button, Callout, Card, Empty, Field, Input, Modal, Select, Textarea, TierBadge, ToggleRow, useToast } from '../ui/primitives';
import { DecisionVerdict, TraceList } from '../components/DecisionTrace';
import { TIERS, TIER_MAP, getTier } from '../core/policy/tiers';
import { RULE_CATEGORY_LABEL, RULE_META, RULE_ORDER, type RuleCategory } from '../core/policy/rules';
import { effectiveRules, evaluatePolicy, isLocked, ruleOf, simContext } from '../core/policy/evaluate';
import { defaultRulesFor } from '../core/policy/tiers';
import { ASSETS, fmtUsd, getAsset } from '../core/assets';
import type { RuleConfig, RuleId, TierId } from '../core/types';
import { Icon } from '../ui/icons';

const CATEGORIES: RuleCategory[] = ['limits', 'destination', 'identity', 'timing', 'privacy', 'automation', 'duress'];

export function PolicyStudio() {
  const { state, setPolicyTier, setRule, resetWalletPolicy, updateWallet, audit } = useVault();
  const toast = useToast();
  const [walletId, setWalletId] = useState<string>('');
  const [simOpen, setSimOpen] = useState(false);

  const wallet = state?.wallets.find((w) => w.id === walletId) ?? null;
  const rules = wallet && state ? effectiveRules(state.policy, wallet.id, wallet.tier) : state?.policy.rules ?? [];
  const tier: TierId = wallet ? wallet.tier : state?.policy.tier ?? 1;

  if (!state) return null;

  return (
    <div className="stack">
      <Card
        title="Policy tiers"
        subtitle="The vault-wide tier sets the defaults; individual wallets can override any rule that is not locked"
        icon="sliders"
        actions={
          <Button size="sm" icon="terminal" onClick={() => setSimOpen(true)}>
            Open simulator
          </Button>
        }
      >
        <div className="grid g4">
          {TIERS.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setPolicyTier(t.id);
                toast(`Vault policy set to tier ${t.id} — ${t.codename}`);
              }}
              className="stack sm"
              style={{
                padding: 14,
                borderRadius: 12,
                textAlign: 'left',
                cursor: 'pointer',
                fontFamily: 'inherit',
                color: 'var(--text)',
                border: `1px solid ${state.policy.tier === t.id ? t.color + '77' : 'var(--line-soft)'}`,
                background: state.policy.tier === t.id ? t.color + '10' : 'var(--panel-2)',
              }}
            >
              <div className="row between">
                <TierBadge tier={t.id} label={t.codename} />
                <Badge tone={t.risk === 'defensive' ? 'ok' : t.risk === 'aggressive' ? 'bad' : 'warn'}>{t.risk}</Badge>
              </div>
              <div className="small strong">{t.name}</div>
              <div className="tiny muted" style={{ lineHeight: 1.55 }}>{t.blurb}</div>
              <div className="tiny" style={{ color: t.color }}>{t.purpose}</div>
              <div className="tiny dim">{t.defaultRules.length} rules · {t.lockedRules.length} locked</div>
            </button>
          ))}
        </div>
      </Card>

      <Card
        title="Rule editor"
        subtitle={wallet ? `Editing overrides for ${wallet.label} (tier ${wallet.tier})` : 'Editing the vault-wide policy'}
        icon="sliders"
        actions={
          <div className="row" style={{ gap: 8 }}>
            {wallet && (
              <Button
                size="sm"
                variant="ghost"
                icon="refresh"
                onClick={() => {
                  resetWalletPolicy(wallet.id);
                  toast('Overrides cleared — tier defaults restored');
                }}
              >
                Reset overrides
              </Button>
            )}
            <div style={{ width: 210 }}>
              <Select
                value={walletId}
                onChange={setWalletId}
                options={[
                  { value: '', label: 'Vault-wide policy' },
                  ...state.wallets.map((w) => ({ value: w.id, label: `${w.label} (T${w.tier})` })),
                ]}
              />
            </div>
          </div>
        }
      >
        {wallet && (
          <div className="row" style={{ gap: 8, marginBottom: 12 }}>
            <span className="tiny muted">Wallet tier (drives its base rules):</span>
            <Select
              value={String(wallet.tier)}
              onChange={(v) => {
                updateWallet(wallet.id, { tier: Number(v) as TierId });
                audit({
                  at: Date.now(),
                  kind: 'policy',
                  title: 'Wallet tier changed',
                  detail: `${wallet.label} → tier ${v} (${TIER_MAP[Number(v) as TierId].codename}).`,
                  severity: 'warn',
                });
              }}
              options={TIERS.map((t) => ({ value: String(t.id), label: `T${t.id} · ${t.codename} — ${t.name}` }))}
            />
          </div>
        )}

        <div className="stack">
          {CATEGORIES.map((cat) => {
            const ids = RULE_ORDER.filter((id) => RULE_META[id].category === cat);
            return (
              <div key={cat} className="stack sm">
                <div className="row" style={{ gap: 8 }}>
                  <span className="tiny" style={{ letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--faint)' }}>
                    {RULE_CATEGORY_LABEL[cat]}
                  </span>
                  <div className="divider" style={{ flex: 1 }} />
                </div>
                {ids.map((id) => (
                  <RuleRow
                    key={id}
                    ruleId={id}
                    rule={ruleOf(rules, id)}
                    tier={tier}
                    walletId={wallet?.id}
                    onChange={(patch) => {
                      setRule(id, patch, wallet?.id);
                    }}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </Card>

      {simOpen && <Simulator onClose={() => setSimOpen(false)} />}
    </div>
  );
}

/* ------------------------------------------------------------------ rule row */

function RuleRow({
  ruleId,
  rule,
  tier,
  walletId,
  onChange,
}: {
  ruleId: RuleId;
  rule?: RuleConfig;
  tier: TierId;
  walletId?: string;
  onChange: (patch: Partial<RuleConfig>) => void;
}) {
  const meta = RULE_META[ruleId];
  const locked = isLocked(tier, ruleId) || rule?.locked === true;
  const [open, setOpen] = useState(false);
  const enabled = rule?.enabled ?? false;
  const params = rule?.params ?? {};
  const tierDef = getTier(tier);

  return (
    <div
      style={{
        border: `1px solid ${enabled ? 'var(--line)' : 'var(--line-soft)'}`,
        borderRadius: 10,
        background: enabled ? 'var(--panel-2)' : 'transparent',
        opacity: enabled ? 1 : 0.72,
      }}
    >
      <div className="row between" style={{ padding: '10px 12px' }}>
        <div className="row" style={{ gap: 10, minWidth: 0 }}>
          <button className="icon-btn" onClick={() => setOpen((o) => !o)} title="Edit parameters" type="button">
            <Icon name={open ? 'chevron-down' : 'chevron-right'} size={13} />
          </button>
          <div style={{ minWidth: 0 }}>
            <div className="row" style={{ gap: 8 }}>
              <span className="small strong">{meta.label}</span>
              {locked && <Badge tone="warn" icon="lock">locked by tier {tier}</Badge>}
              {meta.risk === 'aggressive' && <Badge tone="bad" icon="zap-off">aggressive</Badge>}
            </div>
            <div className="tiny muted">{meta.blurb}</div>
          </div>
        </div>
        <div className="row" style={{ gap: 10 }}>
          {enabled && (
            <span className="tiny mono muted">
              {meta.params
                .map((p) => {
                  const v = params[p.key];
                  if (typeof v === 'boolean') return `${p.label}: ${v ? 'yes' : 'no'}`;
                  if (Array.isArray(v)) return `${p.label}: ${v.length}`;
                  if (p.type === 'usd' && typeof v === 'number') return `${p.label}: ${fmtUsd(v, { compact: true })}`;
                  if (typeof v === 'number') return `${p.label}: ${v}${p.unit ?? ''}`;
                  return `${p.label}: ${v ?? '—'}`;
                })
                .join(' · ')}
            </span>
          )}
          <ToggleRow
            label=""
            on={enabled}
            disabled={locked && isLocked(tier, ruleId)}
            onChange={(v) => onChange({ enabled: v })}
          />
        </div>
      </div>

      {open && (
        <div className="stack" style={{ padding: '4px 12px 14px', borderTop: '1px dashed var(--line-soft)' }}>
          {meta.params.map((p) => (
            <ParamEditor
              key={p.key}
              def={p}
              value={params[p.key]}
              onChange={(v) => onChange({ params: { ...params, [p.key]: v as string | number | boolean | string[] } })}
            />
          ))}
          <div className="tiny dim">
            {walletId
              ? 'Changing this creates a per-wallet override. Reset overrides to fall back to the tier defaults.'
              : `Applies to every wallet on tier ${tier} (${tierDef.codename}) that has no override of its own.`}
          </div>
        </div>
      )}
    </div>
  );
}

function ParamEditor({
  def,
  value,
  onChange,
}: {
  def: { key: string; label: string; type: string; min?: number; max?: number; step?: number; unit?: string; help?: string };
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  if (def.type === 'bool') {
    return <ToggleRow label={def.label} help={def.help} on={Boolean(value)} onChange={onChange} />;
  }

  if (def.type === 'addresses') {
    const list = Array.isArray(value) ? (value as string[]) : [];
    return (
      <Field label={def.label} help="One address per line.">
        <Textarea
          mono
          rows={3}
          value={list.join('\n')}
          onChange={(e) => onChange(e.target.value.split('\n').map((l) => l.trim()).filter(Boolean))}
          placeholder="bc1q…"
        />
      </Field>
    );
  }

  if (def.type === 'wallet') {
    return (
      <Field label={def.label} help={def.help}>
        <Input value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} placeholder="Wallet id" />
      </Field>
    );
  }

  const num = typeof value === 'number' ? value : 0;
  return (
    <Field label={def.label} help={def.help}>
      <div className="row" style={{ gap: 10 }}>
        <div style={{ flex: 1 }}>
          {def.max !== undefined && def.max >= 1000 ? (
            <input
              className="slider"
              type="range"
              min={def.min ?? 0}
              max={def.max}
              step={def.step ?? 1}
              value={num}
              onChange={(e) => onChange(Number(e.target.value))}
            />
          ) : null}
        </div>
        <Input
          mono
          style={{ width: 130 }}
          type="number"
          value={num}
          min={def.min}
          max={def.max}
          step={def.step}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        {def.type === 'usd' && <span className="tiny muted">USD</span>}
        {def.unit && <span className="tiny muted">{def.unit}</span>}
      </div>
    </Field>
  );
}

/* ---------------------------------------------------------------- simulator */

function Simulator({ onClose }: { onClose: () => void }) {
  const { state } = useVault();
  const [tier, setTier] = useState<TierId>(state?.policy.tier ?? 1);
  const [walletId, setWalletId] = useState('');
  const [assetId, setAssetId] = useState('btc');
  const [amountUsd, setAmountUsd] = useState(25_000);
  const [isNew, setIsNew] = useState(true);
  const [secureVerified, setSecureVerified] = useState(false);
  const [duress, setDuress] = useState(false);
  const [frozen, setFrozen] = useState(false);
  const [spent24h, setSpent24h] = useState(0);
  const [hour, setHour] = useState(new Date().getUTCHours());
  const [ownDestination, setOwnDestination] = useState(false);
  const [sweep, setSweep] = useState(false);
  const [idleDays, setIdleDays] = useState(200);

  const rules = useMemo(() => {
    if (!state) return defaultRulesFor(tier);
    const w = state?.wallets.find((x) => x.id === walletId);
    return w ? effectiveRules(state.policy, walletId, w.tier) : state.policy.rules;
  }, [state, walletId, tier]);

  const shards = state?.horcruxes.length ? { m: state.horcruxes[0].m, n: state.horcruxes[0].n } : undefined;

  const decision = useMemo(() => {
    const now = Date.UTC(2026, 0, 1, hour % 24, 0, 0);
    const asset = getAsset(assetId);
    return evaluatePolicy(
      simContext({
        tier,
        rules,
        asset,
        amount: amountUsd / Math.max(1, asset.priceUsd),
        amountUsd,
        address: ownDestination ? (state?.wallets[0]?.accounts[0]?.address ?? '') : 'bc1qunknowndestination00000000000000000000',
        isNewAddress: isNew,
        destinationOwnedByVault: ownDestination,
        spent24hUsd: spent24h,
        txCountLastHour: 0,
        now,
        secureSendVerified: secureVerified,
        duressActive: duress,
        frozen,
        shards,
        sweepContext: sweep,
        sweepIdleDays: idleDays,
      }),
    );
  }, [tier, rules, assetId, amountUsd, isNew, secureVerified, duress, frozen, spent24h, hour, ownDestination, shards, sweep, idleDays, state]);

  return (
    <Modal
      wide
      title="Policy simulator"
      subtitle="Ask the engine what it would do — without moving anything"
      icon="terminal"
      onClose={onClose}
      footer={<Button onClick={onClose}>Close</Button>}
    >
      <div className="grid g2">
        <div className="stack">
          <Field label="Tier">
            <Select
              value={String(tier)}
              onChange={(v) => setTier(Number(v) as TierId)}
              options={TIERS.map((t) => ({ value: String(t.id), label: `T${t.id} · ${t.codename}` }))}
            />
          </Field>
          <Field label="Wallet (for overrides)">
            <Select
              value={walletId}
              onChange={setWalletId}
              options={[{ value: '', label: 'Vault-wide' }, ...(state?.wallets ?? []).map((w) => ({ value: w.id, label: `${w.label} (T${w.tier})` }))]}
            />
          </Field>
          <Field label="Asset">
            <Select value={assetId} onChange={setAssetId} options={ASSETS.map((a) => ({ value: a.id, label: a.symbol }))} />
          </Field>
          <Field label={`Amount: ${fmtUsd(amountUsd)}`}>
            <input
              className="slider"
              type="range"
              min={0}
              max={1_000_000}
              step={1_000}
              value={amountUsd}
              onChange={(e) => setAmountUsd(Number(e.target.value))}
            />
          </Field>
          <Field label={`Already spent in 24h: ${fmtUsd(spent24h)}`}>
            <input className="slider" type="range" min={0} max={500_000} step={1_000} value={spent24h} onChange={(e) => setSpent24h(Number(e.target.value))} />
          </Field>
          <Field label={`UTC hour of signing: ${String(hour).padStart(2, '0')}:00`}>
            <input className="slider" type="range" min={0} max={23} step={1} value={hour} onChange={(e) => setHour(Number(e.target.value))} />
          </Field>
        </div>

        <div className="stack">
          <ToggleRow label="Destination is new to this vault" on={isNew} onChange={setIsNew} />
          <ToggleRow label="Secure Send already verified" on={secureVerified} onChange={setSecureVerified} />
          <ToggleRow label="Destination is a wallet you own" on={ownDestination} onChange={setOwnDestination} />
          <ToggleRow label="Duress mode active" on={duress} onChange={setDuress} />
          <ToggleRow label="Wallet frozen by a react" on={frozen} onChange={setFrozen} />
          <ToggleRow label="Evaluate as a consolidation sweep" on={sweep} onChange={setSweep} />
          {sweep && (
            <Field label={`Source idle days: ${idleDays}`}>
              <input className="slider" type="range" min={0} max={730} step={1} value={idleDays} onChange={(e) => setIdleDays(Number(e.target.value))} />
            </Field>
          )}
          <div className="divider" />
          {shards ? (
            <Callout tone="default" icon="gem">
              A {shards.m}-of-{shards.n} Horcrux set exists, so quorum rules can be satisfied.
            </Callout>
          ) : (
            <Callout tone="warn" icon="gem">
              No Horcrux set exists yet, so quorum rules escalate to a denial rather than an approval path.
            </Callout>
          )}
        </div>
      </div>

      <div className="divider" />
      <DecisionVerdict decision={decision} />
      <TraceList traces={decision.traces} />
      {decision.traces.length === 0 && (
        <Empty icon="terminal" title="No rules engaged" />
      )}
    </Modal>
  );
}
