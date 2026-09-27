import { useEffect, useMemo, useState } from 'react';
import { useVault } from '../state/store';
import { Badge, Button, Callout, Card, CheckRow, Field, Input, Modal, Select, Textarea, useToast } from '../ui/primitives';
import { Icon } from '../ui/icons';
import { DecisionVerdict, TraceList, RequiredSteps } from '../components/DecisionTrace';
import { getAsset, fmtAmount, fmtUsd, priceUsdAt } from '../core/assets';
import { validateAddress } from '../core/keys/derive';
import { screenAddress, cleanVerdict } from '../core/security/phishing';
import { evaluatePolicy, effectiveRules, formatDuration } from '../core/policy/evaluate';
import { FEE_PRESETS, estimateFee } from '../core/chain/sim';
import { TIER_MAP } from '../core/policy/tiers';
import { verifyShard } from '../core/horcrux/vault';
import type { Decision } from '../core/types';

export function Send() {
  const { state, addTx, updateTx, updateWallet, audit, recordDecision } = useVault();
  const toast = useToast();

  const [walletId, setWalletId] = useState('');
  const [assetId, setAssetId] = useState('btc');
  const [amount, setAmount] = useState('');
  const [to, setTo] = useState('');
  const [feeId, setFeeId] = useState<'economy' | 'normal' | 'priority' | 'emergency'>('normal');
  const [passkeyDone, setPasskeyDone] = useState(false);
  const [secureDone, setSecureDone] = useState(false);
  const [secondDeviceDone, setSecondDeviceDone] = useState(false);
  const [shardInput, setShardInput] = useState('');
  const [shardModal, setShardModal] = useState(false);
  const [shardsApproved, setShardsApproved] = useState(0);
  const [held, setHeld] = useState<{ txId: string; seconds: number } | null>(null);

  const wallet = state?.wallets.find((w) => w.id === walletId) ?? state?.wallets[0] ?? null;
  const asset = getAsset(assetId);

  useEffect(() => {
    if (!walletId && state?.wallets.length) {
      const first = state.wallets.find((w) => w.visibility === 'visible') ?? state.wallets[0];
      setWalletId(first.id);
      const acc = first.accounts[0];
      if (acc) setAssetId(acc.assetId);
    }
  }, [state?.wallets, walletId]);

  const balance = wallet ? (wallet.balances[assetId] ?? 0) : 0;
  const amountNum = Number(amount) || 0;
  const price = priceUsdAt(asset);
  const amountUsd = amountNum * price;
  const preset = FEE_PRESETS.find((p) => p.id === feeId)!;
  const fee = estimateFee(asset, preset.rate);

  const recentAddresses = useMemo(() => {
    const fromTxs = (state?.txs ?? []).filter((t) => t.txClass !== 'receive').map((t) => t.toAddress);
    return [...new Set(fromTxs)].slice(0, 40);
  }, [state?.txs]);

  const contactAddresses = useMemo(() => (state?.contacts ?? []).map((c) => c.address), [state?.contacts]);

  const validation = useMemo(
    () => (to.trim() ? validateAddress(asset, to.trim()) : { ok: false, reason: 'Enter a destination' }),
    [asset, to],
  );

  const verdict = useMemo(() => {
    if (!to.trim()) return cleanVerdict(to);
    return screenAddress({
      asset,
      address: to.trim(),
      recentAddresses,
      contactAddresses,
      invalid: !validation.ok,
      invalidReason: validation.reason,
    });
  }, [asset, to, recentAddresses, contactAddresses, validation]);

  const isNewAddress = to.trim()
    ? !recentAddresses.includes(to.trim()) && !contactAddresses.includes(to.trim())
    : false;

  const destinationOwnedByVault = useMemo(
    () => (state?.wallets ?? []).some((w) => w.accounts.some((a) => a.address === to.trim())),
    [state?.wallets, to],
  );

  const spent24hUsd = useMemo(() => {
    const since = Date.now() - 86_400_000;
    return (state?.txs ?? [])
      .filter((t) => t.walletId === wallet?.id && t.createdAt > since && t.txClass !== 'receive' && t.status !== 'rejected')
      .reduce((n, t) => n + t.amountUsd, 0);
  }, [state?.txs, wallet?.id]);

  const txCountLastHour = useMemo(
    () =>
      (state?.txs ?? []).filter(
        (t) => t.walletId === wallet?.id && t.txClass !== 'receive' && t.createdAt > Date.now() - 3_600_000,
      ).length,
    [state?.txs, wallet?.id],
  );

  const shards = state?.horcruxes.length ? { m: state.horcruxes[0].m, n: state.horcruxes[0].n } : undefined;

  const decision: Decision | null = useMemo(() => {
    if (!wallet || !state || amountNum <= 0 || !to.trim()) return null;
    const rules = effectiveRules(state.policy, wallet.id, wallet.tier);
    return evaluatePolicy({
      tier: wallet.tier,
      rules,
      asset,
      amount: amountNum,
      amountUsd,
      address: to.trim(),
      txClass: 'send',
      isNewAddress,
      destinationOwnedByVault,
      spent24hUsd,
      txCountLastHour,
      now: Date.now(),
      phishing: verdict,
      secureSendVerified: secureDone,
      duressActive: state.duressActive,
      frozen: state.frozenWallets.includes(wallet.id),
      shards,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet, state, amountNum, amountUsd, to, verdict, secureDone, isNewAddress, shards]);

  const steps = decision?.requiredSteps ?? [];
  const stepsSatisfied =
    steps.filter((s) =>
      s === 'passkey' ? passkeyDone : s === 'secureSend' ? secureDone : s === 'secondDevice' ? secondDeviceDone : s === 'shards' ? shardsApproved >= (decision?.quorum?.m ?? 2) : true,
    ).length === steps.length;

  const canSign = !!decision && decision.outcome !== 'deny' && stepsSatisfied && amountNum > 0 && amountNum + fee <= balance && validation.ok;

  const sign = () => {
    if (!wallet || !decision) return;
    const tx = addTx({
      walletId: wallet.id,
      assetId,
      amount: amountNum,
      amountUsd,
      toAddress: to.trim(),
      txClass: 'send',
      status: decision.holdSeconds > 0 ? 'held' : 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      feeRate: preset.rate,
      feeUsd: fee * price,
      confirmations: 0,
      txid: '',
      decision,
      notes: `Fee tier: ${preset.label}`,
    });
    recordDecision('policy', 'Send evaluated by policy', `${fmtAmount(amountNum, asset)} ${asset.symbol} → ${to.trim().slice(0, 12)}…`, decision.outcome === 'deny' ? 'critical' : 'info', decision);

    if (decision.holdSeconds > 0) {
      setHeld({ txId: tx.id, seconds: decision.holdSeconds });
      toast(`Held by policy for ${formatDuration(decision.holdSeconds)} — you can cancel`, 'warn');
      return;
    }
    finalize(tx.id);
  };

  const finalize = (txId: string) => {
    if (!wallet) return;
    updateTx(txId, { status: 'broadcast', updatedAt: Date.now(), txid: `0x${Math.random().toString(16).slice(2, 18)}` });
    window.setTimeout(() => {
      updateTx(txId, { status: 'confirmed', confirmations: 1, updatedAt: Date.now() });
      updateWallet(wallet.id, {
        balances: { ...wallet.balances, [assetId]: Math.max(0, balance - amountNum - fee) },
      });
      toast(`Sent ${fmtAmount(amountNum, asset)} ${asset.symbol}`, 'ok');
      setAmount('');
      setTo('');
      setPasskeyDone(false);
      setSecureDone(false);
      setSecondDeviceDone(false);
      setShardsApproved(0);
    }, 1400);
  };

  if (!state || !wallet) return null;

  return (
    <div className="grid side-main">
      <Card title="Send" subtitle="Every movement is screened, then judged by policy" icon="send">
        <div className="stack">
          <Field label="From">
            <Select
              value={walletId}
              onChange={(v) => {
                setWalletId(v);
                const w = state.wallets.find((x) => x.id === v);
                if (w?.accounts[0]) setAssetId(w.accounts[0].assetId);
              }}
              options={state.wallets
                .filter((w) => w.visibility !== 'hidden')
                .map((w) => ({ value: w.id, label: `${w.label} · T${w.tier} ${TIER_MAP[w.tier].codename}` }))}
            />
          </Field>

          <Field label="Asset">
            <Select
              value={assetId}
              onChange={setAssetId}
              options={wallet.accounts.map((a) => ({ value: a.assetId, label: getAsset(a.assetId).symbol }))}
            />
          </Field>

          <Field
            label="Amount"
            right={
              <button
                className="btn ghost sm"
                onClick={() => setAmount(String(Math.max(0, balance - fee)))}
                type="button"
              >
                Max {fmtAmount(Math.max(0, balance - fee), asset)}
              </button>
            }
          >
            <Input mono value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00000000" inputMode="decimal" />
            <div className="help row between">
              <span>Available {fmtAmount(balance, asset)} {asset.symbol}</span>
              <span className="mono">{fmtUsd(amountUsd)}</span>
            </div>
          </Field>

          <Field label="Destination address">
            <Textarea mono rows={2} value={to} onChange={(e) => setTo(e.target.value)} placeholder={`${asset.symbol} address`} />
            <div className="row between" style={{ marginTop: 6 }}>
              {to.trim() ? (
                <Badge tone={validation.ok ? 'ok' : 'bad'} icon={validation.ok ? 'check' : 'alert'}>
                  {validation.ok ? 'Checksum valid' : validation.reason}
                </Badge>
              ) : (
                <span className="tiny muted">Paste carefully — then verify the fingerprint, not the middle.</span>
              )}
              {isNewAddress && to.trim() && <Badge tone="info" icon="spark">first contact</Badge>}
              {destinationOwnedByVault && to.trim() && <Badge tone="violet" icon="vault">your own wallet</Badge>}
            </div>
          </Field>

          <Field label="Fee tier" help={`Estimated fee ${fee} ${asset.symbol} · ${preset.blurb}`}>
            <div className="row wrap" style={{ gap: 6 }}>
              {FEE_PRESETS.map((p) => (
                <button
                  key={p.id}
                  className={`btn sm ${feeId === p.id ? 'primary' : ''}`}
                  onClick={() => setFeeId(p.id as typeof feeId)}
                  type="button"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </Field>
        </div>
      </Card>

      <div className="stack">
        {verdict.level !== 'clean' && (
          <Card title="Phishing shield" icon="shield" tone={verdict.level === 'dangerous' ? 'bad' : 'warn'}>
            <div className="stack sm">
              <div className="row" style={{ gap: 8 }}>
                <Badge tone={verdict.level === 'dangerous' ? 'bad' : 'warn'} icon="alert">
                  {verdict.level} · score {verdict.score}
                </Badge>
              </div>
              {verdict.findings.map((f) => (
                <div key={f.code} className="stack sm" style={{ padding: '8px 10px', background: 'var(--panel-2)', borderRadius: 8 }}>
                  <span className="small strong">{f.label}</span>
                  <span className="tiny muted" style={{ lineHeight: 1.55 }}>{f.detail}</span>
                </div>
              ))}
              <div className="small" style={{ color: verdict.level === 'dangerous' ? 'var(--bad)' : 'var(--warn)' }}>
                {verdict.recommendation}
              </div>
            </div>
          </Card>
        )}

        {decision && (
          <Card title="Policy decision" subtitle={`Tier ${wallet.tier} · ${TIER_MAP[wallet.tier].codename}`} icon="sliders">
            <div className="stack">
              <DecisionVerdict decision={decision} />
              <RequiredSteps steps={decision.requiredSteps} />

              {steps.includes('secureSend') && (
                <div className="stack sm">
                  <div className="divider" />
                  <div className="small strong">Secure Send verification</div>
                  <div className="tiny muted">
                    Read this to the payee over a second channel (call, in person, Signal). If they do not read back the
                    same fingerprint and words, the address you hold is not theirs.
                  </div>
                  <div className="row wrap" style={{ gap: 8 }}>
                    <Badge tone="info" icon="fingerprint">{verdict.fingerprint}</Badge>
                    <Badge tone="info" icon="spark">{verdict.words}</Badge>
                  </div>
                  <CheckRow checked={secureDone} onChange={setSecureDone}>
                    The payee confirmed this fingerprint and these words out-of-band.
                  </CheckRow>
                </div>
              )}

              {steps.includes('passkey') && (
                <CheckRow checked={passkeyDone} onChange={setPasskeyDone}>
                  Re-authenticate with this device's passkey to continue.
                </CheckRow>
              )}

              {steps.includes('secondDevice') && (
                <CheckRow checked={secondDeviceDone} onChange={setSecondDeviceDone}>
                  A second enrolled device has approved this transaction.
                </CheckRow>
              )}

              {steps.includes('shards') && (
                <div className="stack sm">
                  <div className="divider" />
                  <div className="row between">
                    <span className="small strong">Horcrux quorum</span>
                    <Badge tone={shardsApproved >= (decision.quorum?.m ?? 2) ? 'ok' : 'violet'} icon="gem">
                      {shardsApproved}/{decision.quorum?.m ?? 2} shards
                    </Badge>
                  </div>
                  <Button size="sm" icon="gem" onClick={() => setShardModal(true)}>
                    Present shards
                  </Button>
                </div>
              )}

              <div className="divider" />
              <TraceList traces={decision.traces} />

              <div className="row between">
                <div className="stack sm">
                  {decision.holdSeconds > 0 && (
                    <span className="tiny muted row" style={{ gap: 6 }}>
                      <Icon name="clock" size={12} /> Held {formatDuration(decision.holdSeconds)} — cancellable
                    </span>
                  )}
                  {amountNum + fee > balance && to.trim() && (
                    <span className="tiny" style={{ color: 'var(--bad)' }}>
                      Amount plus fee exceeds this wallet's balance.
                    </span>
                  )}
                </div>
                <Button variant="primary" icon="send" disabled={!canSign} onClick={sign}>
                  {decision.outcome === 'deny' ? 'Blocked by policy' : decision.holdSeconds > 0 ? 'Queue with time-lock' : 'Sign & broadcast'}
                </Button>
              </div>
            </div>
          </Card>
        )}

        {!decision && (
          <Card title="Policy decision" icon="sliders">
            <div className="small muted">
              Enter an amount and a destination. The policy engine will show you exactly which rules engage, and why —
              before anything is signed.
            </div>
          </Card>
        )}

        {state.frozenWallets.includes(wallet.id) && (
          <Callout tone="bad" icon="pause">
            This wallet is frozen. Release it from the Wallets page or the Reacts console before sending.
          </Callout>
        )}
      </div>

      {shardModal && (
        <Modal
          title="Present Horcrux shards"
          subtitle={`${decision?.quorum?.m ?? 2} of ${decision?.quorum?.n ?? 3} required`}
          icon="gem"
          onClose={() => setShardModal(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setShardModal(false)}>Cancel</Button>
              <Button
                variant="primary"
                onClick={() => {
                  const lines = shardInput
                    .split('\n')
                    .map((l) => l.trim())
                    .filter(Boolean);
                  const results = lines.map((l) => verifyShard(l));
                  const valid = results.filter((r) => r.ok).length;
                  const needed = decision?.quorum?.m ?? 2;
                  if (valid >= needed) {
                    setShardsApproved(valid);
                    setShardModal(false);
                    toast(`${valid} shards accepted`, 'ok');
                    audit({
                      at: Date.now(),
                      kind: 'horcrux',
                      title: 'Shard quorum satisfied',
                      detail: `${valid}/${needed} shards presented and verified for a policy exception.`,
                      severity: 'warn',
                    });
                  } else {
                    toast(`Only ${valid} valid shard(s); ${needed} required`, 'bad');
                  }
                }}
              >
                Verify shards
              </Button>
            </>
          }
        >
          <Field label="Shards" help="Paste one shard per line. They are verified by checksum and index — never transmitted.">
            <Textarea mono rows={6} value={shardInput} onChange={(e) => setShardInput(e.target.value)} placeholder="01a3f…" />
          </Field>
          <Callout tone="warn" icon="alert">
            Presenting shards authorises a policy exception. Do it in a room where nobody else can see the screen.
          </Callout>
        </Modal>
      )}

      {held && (
        <Modal
          title="Transaction held by policy"
          subtitle={`Releases in ${formatDuration(held.seconds)}`}
          icon="clock"
          onClose={() => setHeld(null)}
          footer={
            <>
              <Button
                variant="danger"
                icon="x"
                onClick={() => {
                  updateTx(held.txId, { status: 'cancelled', updatedAt: Date.now() });
                  audit({
                    at: Date.now(),
                    kind: 'policy',
                    title: 'Time-locked transaction cancelled',
                    detail: 'The operator cancelled during the hold window — exactly what the hold is for.',
                    severity: 'warn',
                  });
                  toast('Transaction cancelled during the hold', 'warn');
                  setHeld(null);
                }}
              >
                Cancel transaction
              </Button>
              <Button
                variant="primary"
                icon="send"
                onClick={() => {
                  setHeld(null);
                  finalize(held.txId);
                }}
              >
                Release now
              </Button>
            </>
          }
        >
          <div className="stack sm">
            <div className="small muted">
              The transaction is queued and cannot be broadcast until the hold expires. This window is your chance to
              notice a clipboard hijack, a coerced signature, or a plain mistake.
            </div>
            <div className="mono small">
              {fmtAmount(amountNum, asset)} {asset.symbol} → {to.trim().slice(0, 16)}…
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
