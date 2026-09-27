import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type {
  Account, AuditEntry, Contact, Decision, Horcrux, RecoveryClaim, RuleConfig, RuleId,
  Settings, TierId, TxRecord, VaultEvent, VaultState, Wallet,
} from '../core/types';
import { beginSession, decryptJson, encryptJson, hasSession, lockSession, openSecret, openVault, resealVault } from '../core/crypto/keystore';
import { createInitialVault, createRestoredVault, buildWallet, DEFAULT_SETTINGS, rotateAccount, type NewWalletInput } from './seed';
import { defaultRulesFor } from '../core/policy/tiers';
import { effectiveRules } from '../core/policy/evaluate';
import { executeReact, reactsMatching, type SweepRequest } from '../core/automation/engine';
import { nextSimEvent } from '../core/chain/sim';
import { createHorcrux, type Custodian } from '../core/horcrux/vault';
import { priceUsdAt, getAsset, change24h } from '../core/assets';

const VAULT_KEY = 'blackvault.v1.envelope';
const SHELL_KEY = 'blackvault.v1.shell';
const DURESS_KEY = 'blackvault.v1.duress';

export type Status = 'loading' | 'empty' | 'locked' | 'unlocked';

/* ------------------------------------------------------------------ reducer */

type Action =
  | { type: 'set'; state: VaultState }
  | { type: 'patch'; patch: Partial<VaultState> }
  | { type: 'wallet/add'; wallet: Wallet }
  | { type: 'wallet/update'; id: string; patch: Partial<Wallet> }
  | { type: 'wallet/remove'; id: string }
  | { type: 'policy/tier'; tier: TierId }
  | { type: 'policy/rule'; ruleId: RuleId; walletId?: string; patch: Partial<RuleConfig> }
  | { type: 'policy/reset'; walletId: string }
  | { type: 'react/toggle'; id: string }
  | { type: 'react/update'; id: string; patch: Partial<VaultState['reacts'][number]> }
  | { type: 'event/add'; event: VaultEvent }
  | { type: 'event/ack'; id?: string }
  | { type: 'run/add'; run: VaultState['reactRuns'][number] }
  | { type: 'audit/add'; entry: AuditEntry }
  | { type: 'tx/add'; tx: TxRecord }
  | { type: 'tx/update'; id: string; patch: Partial<TxRecord> }
  | { type: 'horcrux/add'; horcrux: Horcrux }
  | { type: 'horcrux/update'; id: string; patch: Partial<Horcrux> }
  | { type: 'horcrux/remove'; id: string }
  | { type: 'claim/add'; claim: RecoveryClaim }
  | { type: 'claim/update'; id: string; patch: Partial<RecoveryClaim> }
  | { type: 'contact/add'; contact: Contact }
  | { type: 'contact/update'; id: string; patch: Partial<Contact> }
  | { type: 'contact/remove'; id: string }
  | { type: 'settings/update'; patch: Partial<Settings> }
  | { type: 'freeze'; walletId: string }
  | { type: 'unfreeze'; walletId: string }
  | { type: 'duress'; active: boolean }
  | { type: 'sweep/queue'; request: SweepRequest }
  | { type: 'touch' };

const MAX_LOG = 400;
const trim = <T,>(arr: T[]): T[] => (arr.length > MAX_LOG ? arr.slice(arr.length - MAX_LOG) : arr);

function reducer(state: VaultState, action: Action): VaultState {
  switch (action.type) {
    case 'set':
      return action.state;
    case 'patch':
      return { ...state, ...action.patch };
    case 'touch':
      return { ...state, lastSeenAt: Date.now() };

    case 'wallet/add':
      return { ...state, wallets: [...state.wallets, action.wallet] };

    case 'wallet/update':
      return {
        ...state,
        wallets: state.wallets.map((w) => (w.id === action.id ? { ...w, ...action.patch } : w)),
      };

    case 'wallet/remove':
      return {
        ...state,
        wallets: state.wallets.filter((w) => w.id !== action.id),
        frozenWallets: state.frozenWallets.filter((id) => id !== action.id),
        audit: [
          ...state.audit,
          { id: uid('aud'), at: Date.now(), kind: 'wallet', title: 'Wallet removed', detail: `Removed a wallet from the vault.`, severity: 'warn' },
        ],
      };

    case 'policy/tier':
      return {
        ...state,
        policy: { ...state.policy, tier: action.tier, rules: defaultRulesFor(action.tier), updatedAt: Date.now() },
        audit: [
          ...state.audit,
          {
            id: uid('aud'),
            at: Date.now(),
            kind: 'policy',
            title: `Vault policy set to tier ${action.tier}`,
            detail: 'Tier defaults were applied to the vault-wide policy. Per-wallet overrides were kept.',
            severity: 'warn',
          },
        ],
      };

    case 'policy/rule': {
      const target = action.walletId;
      const apply = (rules: RuleConfig[]): RuleConfig[] => {
        const exists = rules.some((r) => r.id === action.ruleId);
        if (!exists) return [...rules, { id: action.ruleId, enabled: true, params: {} , ...action.patch} as RuleConfig];
        return rules.map((r) => (r.id === action.ruleId ? { ...r, ...action.patch, params: { ...r.params, ...(action.patch.params ?? {}) } } : r));
      };
      if (!target) {
        // Vault-wide edits are flagged `custom` so they survive as overrides on
        // top of each wallet's tier defaults.
        const next = apply(state.policy.rules).map((r) =>
          r.id === action.ruleId ? { ...r, custom: true } : r,
        );
        return { ...state, policy: { ...state.policy, rules: next, updatedAt: Date.now() } };
      }
      const current = state.policy.overrides[target] ?? effectiveRules(state.policy, target);
      return {
        ...state,
        policy: {
          ...state.policy,
          overrides: { ...state.policy.overrides, [target]: apply(current) },
          updatedAt: Date.now(),
        },
      };
    }

    case 'policy/reset': {
      const overrides = { ...state.policy.overrides };
      delete overrides[action.walletId];
      return { ...state, policy: { ...state.policy, overrides, updatedAt: Date.now() } };
    }

    case 'react/toggle':
      return {
        ...state,
        reacts: state.reacts.map((r) =>
          r.id === action.id
            ? { ...r, enabled: !r.enabled }
            : r,
        ),
        audit: [
          ...state.audit,
          {
            id: uid('aud'),
            at: Date.now(),
            kind: 'react',
            title: 'React configuration changed',
            detail: `Toggled a react. Aggressive reacts stay gated by tier and ownership attestation.`,
            severity: 'warn',
          },
        ],
      };

    case 'react/update':
      return { ...state, reacts: state.reacts.map((r) => (r.id === action.id ? { ...r, ...action.patch } : r)) };

    case 'event/add':
      return { ...state, events: trim([action.event, ...state.events]) };

    case 'event/ack':
      return {
        ...state,
        events: state.events.map((e) =>
          action.id ? (e.id === action.id ? { ...e, acknowledged: true } : e) : { ...e, acknowledged: true },
        ),
      };

    case 'run/add':
      return { ...state, reactRuns: trim([action.run, ...state.reactRuns]) };

    case 'audit/add':
      return { ...state, audit: trim([action.entry, ...state.audit]) };

    case 'tx/add':
      return { ...state, txs: trim([action.tx, ...state.txs]) };

    case 'tx/update':
      return { ...state, txs: state.txs.map((t) => (t.id === action.id ? { ...t, ...action.patch } : t)) };

    case 'horcrux/add':
      return {
        ...state,
        horcruxes: [...state.horcruxes, action.horcrux],
        audit: [
          ...state.audit,
          {
            id: uid('aud'),
            at: Date.now(),
            kind: 'horcrux',
            title: `Horcrux created: ${action.horcrux.label}`,
            detail: `Split into ${action.horcrux.n} shards, ${action.horcrux.m} required to reconstruct.`,
            severity: 'warn',
          },
        ],
      };

    case 'horcrux/update':
      return { ...state, horcruxes: state.horcruxes.map((h) => (h.id === action.id ? { ...h, ...action.patch } : h)) };

    case 'horcrux/remove':
      return { ...state, horcruxes: state.horcruxes.filter((h) => h.id !== action.id) };

    case 'claim/add':
      return { ...state, claims: [action.claim, ...state.claims] };

    case 'claim/update':
      return { ...state, claims: state.claims.map((c) => (c.id === action.id ? { ...c, ...action.patch } : c)) };

    case 'contact/add':
      return { ...state, contacts: [...state.contacts, action.contact] };

    case 'contact/update':
      return { ...state, contacts: state.contacts.map((c) => (c.id === action.id ? { ...c, ...action.patch } : c)) };

    case 'contact/remove':
      return { ...state, contacts: state.contacts.filter((c) => c.id !== action.id) };

    case 'settings/update':
      return { ...state, settings: { ...state.settings, ...action.patch } };

    case 'freeze':
      return {
        ...state,
        frozenWallets: state.frozenWallets.includes(action.walletId)
          ? state.frozenWallets
          : [...state.frozenWallets, action.walletId],
      };

    case 'unfreeze':
      return { ...state, frozenWallets: state.frozenWallets.filter((id) => id !== action.walletId) };

    case 'duress':
      return { ...state, duressActive: action.active };

    case 'sweep/queue':
      return {
        ...state,
        audit: [
          ...state.audit,
          {
            id: uid('aud'),
            at: Date.now(),
            kind: 'sweep',
            title: 'Consolidation queued',
            detail: `${action.request.reason}: ${action.request.sources.length} attested-owned source(s).`,
            severity: 'warn',
          },
        ],
      };

    default:
      return state;
  }
}

const uid = (prefix: string): string => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/* ------------------------------------------------------------------ context */

export interface Totals {
  totalUsd: number;
  byAsset: { assetId: string; amount: number; usd: number }[];
  byTier: { tier: TierId; usd: number }[];
  visibleWallets: Wallet[];
  privacyUsd: number;
  change24hUsd: number;
}

export interface VaultContextValue {
  status: Status;
  state: VaultState | null;
  busy: boolean;
  error: string | null;
  duress: boolean;
  totals: Totals;
  shell: { hasVault: boolean; updatedAt?: number; passkeyId?: string };

  createVault(passphrase: string, opts?: { passkeyId?: string; restoreMnemonic?: string }): Promise<void>;
  unlock(passphrase: string): Promise<void>;
  unlockDuress(pin: string): Promise<boolean>;
  lock(): void;
  wipe(): Promise<void>;

  addWallet(input: NewWalletInput): Promise<Wallet>;
  updateWallet(id: string, patch: Partial<Wallet>): void;
  setWalletTier(id: string, tier: TierId): void;
  removeWallet(id: string): void;
  setPolicyTier(tier: TierId): void;
  setRule(ruleId: RuleId, patch: Partial<RuleConfig>, walletId?: string): void;
  resetWalletPolicy(walletId: string): void;
  toggleReact(id: string): void;
  updateReact(id: string, patch: Partial<VaultState['reacts'][number]>): void;

  ackEvent(id?: string): void;
  injectEvent(): void;
  freeze(walletId: string): void;
  unfreeze(walletId: string): void;
  setDuress(active: boolean): void;

  addTx(tx: Omit<TxRecord, 'id'>): TxRecord;
  updateTx(id: string, patch: Partial<TxRecord>): void;
  recordDecision(kind: AuditEntry['kind'], title: string, detail: string, severity?: AuditEntry['severity'], decision?: Decision): void;
  audit(entry: Omit<AuditEntry, 'id'>): void;

  addContact(contact: Omit<Contact, 'id'>): void;
  updateContact(id: string, patch: Partial<Contact>): void;
  removeContact(id: string): void;

  shardSecret(opts: {
    label: string;
    purpose: Horcrux['purpose'];
    secretText: string;
    m: number;
    n: number;
    custodians: Custodian[];
    timelockDays: number;
    beneficiaries?: { name: string; sharePct: number; contact: string }[];
  }): Promise<Horcrux>;
  heartbeat(horcruxId: string): void;
  attestShard(horcruxId: string, shardIndex: number): void;
  removeHorcrux(id: string): void;

  addClaim(claim: Omit<RecoveryClaim, 'id'>): RecoveryClaim;
  updateClaim(id: string, patch: Partial<RecoveryClaim>): void;

  updateSettings(patch: Partial<Settings>): void;
  rotateAddresses(walletId: string): Promise<void>;
  getMnemonic(walletId: string): Promise<string | null>;
  addressesFor(walletId: string): Record<string, string>;
  queueSweep(request: SweepRequest): void;
  applySweep(walletId: string, assetId: string, amount: number, txids: string[], note: string): void;
}

const VaultContext = createContext<VaultContextValue | null>(null);

export function useVault(): VaultContextValue {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error('useVault must be used inside <VaultProvider>');
  return ctx;
}

export function VaultProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, null as unknown as VaultState);
  const [status, setStatus] = useState<Status>('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duress, setDuressState] = useState(false);
  const [shell, setShell] = useState<{ hasVault: boolean; updatedAt?: number; passkeyId?: string }>({ hasVault: false });
  const saveTimer = useRef<number | null>(null);
  /**
   * KDF binding captured at create/unlock time. Re-sealing must reuse it: the
   * passkey id is mixed into the key derivation, so changing it would make the
   * vault undecryptable with the operator's passphrase.
   */
  const keyMeta = useRef<{ passkeyId: string; hint: string }>({ passkeyId: '', hint: '' });
  const lastActivity = useRef(Date.now());

  /* ------------------------------------------------------------ bootstrap */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SHELL_KEY);
      if (raw) setShell(JSON.parse(raw));
      setStatus(localStorage.getItem(VAULT_KEY) ? 'locked' : 'empty');
    } catch {
      setStatus('empty');
    }
  }, []);

  /* ----------------------------------------------------------- persistence */

  /**
   * The duress vault is a completely separate encrypted envelope, sealed with the
   * duress PIN. Opening it never decrypts — or even reads — the real vault: the
   * two keys are unrelated. It contains only what a coerced operator may see.
   */
  const persistDuress = useCallback(async (next: VaultState, pin: string) => {
    try {
      const decoyIds = new Set(next.wallets.filter((w) => w.visibility === 'decoy').map((w) => w.id));
      const decoyState: VaultState = {
        ...next,
        wallets: next.wallets.filter((w) => w.visibility === 'decoy'),
        txs: next.txs.filter((t) => decoyIds.has(t.walletId)),
        horcruxes: [],
        claims: [],
        events: [],
        reactRuns: [],
        audit: [],
        contacts: next.contacts.filter((c) => c.verifiedAt !== undefined),
        duressActive: true,
      };
      const envelope = await encryptJson(decoyState, pin);
      localStorage.setItem(DURESS_KEY, JSON.stringify(envelope));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the duress vault');
    }
  }, []);

  const persist = useCallback(async (next: VaultState) => {
    try {
      // Never let a duress session write over the real vault: the session key in
      // memory during a duress unlock is derived from the duress PIN.
      if (next.duressActive) {
        if (next.settings.duressPin) await persistDuress(next, next.settings.duressPin);
        return;
      }
      const envelope = await resealVault(next, keyMeta.current.passkeyId);
      envelope.hint = keyMeta.current.hint;
      localStorage.setItem(VAULT_KEY, JSON.stringify(envelope));
      const meta = { hasVault: true, updatedAt: Date.now() };
      localStorage.setItem(SHELL_KEY, JSON.stringify(meta));
      setShell(meta);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the vault');
    }
  }, []);

  useEffect(() => {
    if (!state || status !== 'unlocked' || !hasSession()) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void persist(state), 700);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [state, status, persist]);

  /* Keep the decoy envelope in step with the real one (decoys + PIN changes). */
  useEffect(() => {
    if (!state || status !== 'unlocked' || state.duressActive || !state.settings.duressPin) return;
    const timer = window.setTimeout(() => void persistDuress(state, state.settings.duressPin!), 350);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.settings.duressPin, state?.wallets, status, state?.duressActive]);

  /* ------------------------------------------------------------- autolock */
  useEffect(() => {
    const bump = () => {
      lastActivity.current = Date.now();
    };
    window.addEventListener('pointerdown', bump);
    window.addEventListener('keydown', bump);
    const timer = window.setInterval(() => {
      if (status !== 'unlocked' || !state) return;
      const idle = Date.now() - lastActivity.current;
      if (idle > state.settings.autoLockMinutes * 60_000) lock();
    }, 15_000);
    return () => {
      window.removeEventListener('pointerdown', bump);
      window.removeEventListener('keydown', bump);
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, state?.settings.autoLockMinutes]);

  /* ------------------------------------------------------------ watchtower */
  const injectEvent = useCallback(() => {
    if (!state) return;
    const event = nextSimEvent(Date.now(), state.wallets.map((w) => ({ id: w.id, label: w.label })));
    if (event.payload === undefined && (event.kind === 'dormant_breach' || event.kind === 'key_exposure')) {
      // Aggressive triggers carry their sources so the engine can check attestation.
      const owned = state.wallets
        .filter((w) => w.visibility !== 'decoy')
        .flatMap((w) =>
          w.accounts.slice(0, 1).map((a) => ({
            id: a.id,
            label: `${w.label} · ${getAsset(a.assetId).symbol}`,
            assetId: a.assetId,
            address: a.address,
            amount: w.balances[a.assetId] ?? 0,
            amountUsd: (w.balances[a.assetId] ?? 0) * priceUsdAt(getAsset(a.assetId)),
            idleDays: Math.floor((Date.now() - a.lastActivity) / 86_400_000),
            attested: true, // wallets inside the vault are owned by definition
          })),
        );
      event.payload = { attested: true, sources: owned, address: state.contacts[0]?.address };
    }
    dispatch({ type: 'event/add', event });

    for (const react of reactsMatching(state, event)) {
      const outcome = executeReact(state, react, event);
      dispatch({ type: 'run/add', run: outcome.run });
      for (const extra of outcome.events) dispatch({ type: 'event/add', event: extra });
      for (const entry of outcome.audit) dispatch({ type: 'audit/add', entry });
      for (const walletId of outcome.patches.freeze ?? []) dispatch({ type: 'freeze', walletId });
      for (const address of outcome.patches.denylistAddresses ?? []) {
        for (const wallet of state.wallets) {
          const rules = effectiveRules(state.policy, wallet.id, wallet.tier);
          const denylist = rules.find((r) => r.id === 'denylist');
          const current = Array.isArray(denylist?.params.addresses) ? (denylist!.params.addresses as string[]) : [];
          if (current.includes(address)) continue;
          dispatch({
            type: 'policy/rule',
            walletId: wallet.id,
            ruleId: 'denylist',
            patch: { enabled: true, params: { addresses: [...current, address] } },
          });
        }
      }
      for (const walletId of outcome.patches.rotateWallets ?? []) void rotateAddresses(walletId);
      for (const request of outcome.patches.sweepRequests ?? []) dispatch({ type: 'sweep/queue', request });
      dispatch({
        type: 'react/update',
        id: react.id,
        patch: { runCount: react.runCount + 1, lastRun: Date.now() },
      });
    }
  }, [state]);

  useEffect(() => {
    if (status !== 'unlocked' || !state?.settings.watchtower || duress) return;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      injectEvent();
    }, 45_000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, state?.settings.watchtower, duress]);

  /* -------------------------------------------------------------- actions */

  const createVault = useCallback(
    async (passphrase: string, opts: { passkeyId?: string; restoreMnemonic?: string } = {}) => {
      setBusy(true);
      setError(null);
      try {
        await beginSession(passphrase, opts.passkeyId ?? '');
        keyMeta.current = { passkeyId: opts.passkeyId ?? '', hint: '' };
        const vault = opts.restoreMnemonic
          ? await createRestoredVault(opts.restoreMnemonic)
          : await createInitialVault();
        const envelope = await encryptJson(vault, passphrase, opts.passkeyId ?? '');
        localStorage.setItem(VAULT_KEY, JSON.stringify(envelope));
        const meta = { hasVault: true, updatedAt: Date.now(), passkeyId: opts.passkeyId };
        localStorage.setItem(SHELL_KEY, JSON.stringify(meta));
        setShell(meta);
        dispatch({ type: 'set', state: vault });
        setStatus('unlocked');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not create the vault');
        throw err;
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const unlock = useCallback(async (passphrase: string) => {
    setBusy(true);
    setError(null);
    try {
      const raw = localStorage.getItem(VAULT_KEY);
      if (!raw) throw new Error('No vault on this device');
      const parsed = JSON.parse(raw);
      const vault = await openVault<VaultState>(parsed, passphrase);
      keyMeta.current = { passkeyId: parsed.passkeyId ?? '', hint: parsed.hint ?? '' };
      dispatch({ type: 'set', state: vault });
      setDuressState(false);
      setStatus('unlocked');
      lastActivity.current = Date.now();
    } catch (err) {
      setError('Incorrect passphrase, or the vault on this device is damaged.');
      throw err;
    } finally {
      setBusy(false);
    }
  }, []);

  const unlockDuress = useCallback(async (pin: string): Promise<boolean> => {
    const raw = localStorage.getItem(DURESS_KEY);
    if (!raw) return false;
    try {
      // Decrypts the decoy envelope only. The real vault is not read, not
      // decrypted, and not present in memory at any point during this unlock.
      const decoy = await decryptJson<VaultState>(JSON.parse(raw), pin);
      dispatch({ type: 'set', state: { ...decoy, duressActive: true } });
      setDuressState(true);
      setStatus('unlocked');
      return true;
    } catch {
      return false;
    }
  }, []);

  const lock = useCallback(() => {
    lockSession();
    dispatch({ type: 'set', state: null as unknown as VaultState });
    setDuressState(false);
    setStatus(localStorage.getItem(VAULT_KEY) ? 'locked' : 'empty');
  }, []);

  const wipe = useCallback(async () => {
    localStorage.removeItem(VAULT_KEY);
    localStorage.removeItem(SHELL_KEY);
    localStorage.removeItem(DURESS_KEY);
    lockSession();
    dispatch({ type: 'set', state: null as unknown as VaultState });
    setShell({ hasVault: false });
    setStatus('empty');
  }, []);

  const addWallet = useCallback(
    async (input: NewWalletInput) => {
      const wallet = await buildWallet(input, state?.wallets.length ?? 0);
      dispatch({ type: 'wallet/add', wallet });
      dispatch({
        type: 'audit/add',
        entry: {
          id: uid('aud'),
          at: Date.now(),
          kind: 'wallet',
          title: `Wallet created: ${wallet.label}`,
          detail: `Tier ${wallet.tier} · ${wallet.accounts.length} account(s) derived on-device.`,
          severity: 'info',
        },
      });
      return wallet;
    },
    [state?.wallets.length],
  );

  const rotateAddresses = useCallback(
    async (walletId: string) => {
      if (!state) return;
      const wallet = state.wallets.find((w) => w.id === walletId);
      if (!wallet?.mnemonicEnc) return;
      const mnemonic = await openSecret(wallet.mnemonicEnc);
      const accounts: Account[] = [...wallet.accounts];
      for (const acc of wallet.accounts) {
        const rotated = await rotateAccount(wallet, acc.assetId, mnemonic);
        if (!accounts.some((a) => a.address === rotated.address)) accounts.push(rotated);
      }
      dispatch({ type: 'wallet/update', id: walletId, patch: { accounts } });
    },
    [state],
  );

  const getMnemonic = useCallback(
    async (walletId: string): Promise<string | null> => {
      const wallet = state?.wallets.find((w) => w.id === walletId);
      if (!wallet?.mnemonicEnc) return null;
      return openSecret(wallet.mnemonicEnc);
    },
    [state],
  );

  const shardSecret = useCallback(
    async (opts: {
      label: string;
      purpose: Horcrux['purpose'];
      secretText: string;
      m: number;
      n: number;
      custodians: Custodian[];
      timelockDays: number;
      beneficiaries?: { name: string; sharePct: number; contact: string }[];
    }): Promise<Horcrux> => {
      const horcrux = createHorcrux({
        label: opts.label,
        purpose: opts.purpose,
        secret: new TextEncoder().encode(opts.secretText),
        m: opts.m,
        n: opts.n,
        custodians: opts.custodians,
        timelockDays: opts.timelockDays,
        beneficiaries: opts.beneficiaries,
      });
      dispatch({ type: 'horcrux/add', horcrux });
      return horcrux;
    },
    [],
  );

  const addressesFor = useCallback(
    (walletId: string): Record<string, string> => {
      const wallet = state?.wallets.find((w) => w.id === walletId);
      if (!wallet) return {};
      const out: Record<string, string> = {};
      for (const acc of wallet.accounts) out[acc.assetId] = acc.address;
      return out;
    },
    [state],
  );

  const applySweep = useCallback(
    (walletId: string, assetId: string, amount: number, txids: string[], note: string) => {
      const asset = getAsset(assetId);
      dispatch({
        type: 'tx/add',
        tx: {
          id: uid('tx'),
          walletId,
          assetId,
          amount,
          amountUsd: amount * priceUsdAt(asset),
          toAddress: addressesFor(walletId)[assetId] ?? '',
          txClass: 'sweep',
          status: 'confirmed',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          feeRate: 25,
          feeUsd: 0,
          confirmations: 1,
          txid: txids[0] ?? uid('txid'),
          notes: note,
        },
      });
      dispatch({
        type: 'audit/add',
        entry: {
          id: uid('aud'),
          at: Date.now(),
          kind: 'sweep',
          title: 'Consolidation complete',
          detail: `${txids.length} transaction(s) consolidated ${asset.symbol} into ${state?.wallets.find((w) => w.id === walletId)?.label ?? 'vault'}. ${note}`,
          severity: 'warn',
        },
      });
    },
    [addressesFor, state],
  );

  /* --------------------------------------------------------------- totals */

  const totals = useMemo<Totals>(() => {
    const empty: Totals = { totalUsd: 0, byAsset: [], byTier: [], visibleWallets: [], privacyUsd: 0, change24hUsd: 0 };
    if (!state) return empty;
    // Under duress only decoys exist; otherwise only wallets marked visible.
    const wallets = state.duressActive
      ? state.wallets.filter((w) => w.visibility === 'decoy')
      : state.wallets.filter((w) => w.visibility === 'visible');

    const byAssetMap = new Map<string, { amount: number; usd: number }>();
    const byTierMap = new Map<TierId, number>();
    let privacyUsd = 0;
    let changeUsd = 0;

    for (const w of wallets) {
      for (const acc of w.accounts) {
        const asset = getAsset(acc.assetId);
        const amount = w.balances[acc.assetId] ?? 0;
        const usd = amount * priceUsdAt(asset);
        const prev = byAssetMap.get(acc.assetId) ?? { amount: 0, usd: 0 };
        byAssetMap.set(acc.assetId, { amount: prev.amount + amount, usd: prev.usd + usd });
        byTierMap.set(w.tier, (byTierMap.get(w.tier) ?? 0) + usd);
        if (asset.privacyScore >= 70) privacyUsd += usd;
        changeUsd += (usd * change24h(asset)) / 100;
      }
    }

    return {
      totalUsd: [...byAssetMap.values()].reduce((n, v) => n + v.usd, 0),
      byAsset: [...byAssetMap.entries()]
        .map(([assetId, v]) => ({ assetId, ...v }))
        .sort((a, b) => b.usd - a.usd),
      byTier: [...byTierMap.entries()].map(([tier, usd]) => ({ tier, usd })).sort((a, b) => a.tier - b.tier),
      visibleWallets: wallets,
      privacyUsd,
      change24hUsd: changeUsd,
    };
  }, [state]);

  /* ---------------------------------------------------------------- value */

  const value: VaultContextValue = {
    status,
    state,
    busy,
    error,
    duress,
    totals,
    shell,
    createVault,
    unlock,
    unlockDuress,
    lock,
    wipe,
    addWallet,
    updateWallet: (id, patch) => dispatch({ type: 'wallet/update', id, patch }),
    setWalletTier: (id, tier) => {
      dispatch({ type: 'wallet/update', id, patch: { tier } });
      dispatch({
        type: 'audit/add',
        entry: {
          id: uid('aud'),
          at: Date.now(),
          kind: 'policy',
          title: 'Wallet tier changed',
          detail: `A wallet moved to tier ${tier}. Its effective policy now follows that tier's defaults plus overrides.`,
          severity: 'warn',
        },
      });
    },
    removeWallet: (id) => dispatch({ type: 'wallet/remove', id }),
    setPolicyTier: (tier) => dispatch({ type: 'policy/tier', tier }),
    setRule: (ruleId, patch, walletId) => dispatch({ type: 'policy/rule', ruleId, patch, walletId }),
    resetWalletPolicy: (walletId) => dispatch({ type: 'policy/reset', walletId }),
    toggleReact: (id) => dispatch({ type: 'react/toggle', id }),
    updateReact: (id, patch) => dispatch({ type: 'react/update', id, patch }),
    ackEvent: (id) => dispatch({ type: 'event/ack', id }),
    injectEvent,
    freeze: (walletId) => dispatch({ type: 'freeze', walletId }),
    unfreeze: (walletId) => dispatch({ type: 'unfreeze', walletId }),
    setDuress: (active) => {
      setDuressState(active);
      dispatch({ type: 'duress', active });
    },
    addTx: (tx) => {
      const record: TxRecord = { ...tx, id: uid('tx') };
      dispatch({ type: 'tx/add', tx: record });
      return record;
    },
    updateTx: (id, patch) => dispatch({ type: 'tx/update', id, patch }),
    recordDecision: (kind, title, detail, severity = 'info', decision) =>
      dispatch({
        type: 'audit/add',
        entry: {
          id: uid('aud'),
          at: Date.now(),
          kind,
          title,
          detail: decision ? `${detail} — policy: ${decision.outcome.toUpperCase()} (${decision.headline})` : detail,
          severity,
        },
      }),
    audit: (entry) => dispatch({ type: 'audit/add', entry: { ...entry, id: uid('aud') } }),
    addContact: (contact) => dispatch({ type: 'contact/add', contact: { ...contact, id: uid('c') } }),
    updateContact: (id, patch) => dispatch({ type: 'contact/update', id, patch }),
    removeContact: (id) => dispatch({ type: 'contact/remove', id }),
    shardSecret,
    heartbeat: (horcruxId) => {
      dispatch({ type: 'horcrux/update', id: horcruxId, patch: { lastHeartbeat: Date.now() } });
      dispatch({
        type: 'audit/add',
        entry: {
          id: uid('aud'),
          at: Date.now(),
          kind: 'horcrux',
          title: 'Inheritance heartbeat recorded',
          detail: 'The claim clock reset. Beneficiaries move further from a claim, not closer.',
          severity: 'info',
        },
      });
    },
    attestShard: (horcruxId, shardIndex) => {
      const h = state?.horcruxes.find((x) => x.id === horcruxId);
      if (!h) return;
      dispatch({
        type: 'horcrux/update',
        id: horcruxId,
        patch: {
          shards: h.shards.map((s) => (s.index === shardIndex ? { ...s, attestedAt: Date.now() } : s)),
        },
      });
    },
    removeHorcrux: (id) => dispatch({ type: 'horcrux/remove', id }),
    addClaim: (claim) => {
      const record: RecoveryClaim = { ...claim, id: uid('claim') };
      dispatch({ type: 'claim/add', claim: record });
      return record;
    },
    updateClaim: (id, patch) => dispatch({ type: 'claim/update', id, patch }),
    updateSettings: (patch) => dispatch({ type: 'settings/update', patch }),
    rotateAddresses,
    getMnemonic,
    addressesFor,
    queueSweep: (request) => dispatch({ type: 'sweep/queue', request }),
    applySweep,
  };

  // `state` is null until unlocked; the reducer type needs a cast at the boundary.
  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

export { DEFAULT_SETTINGS };
