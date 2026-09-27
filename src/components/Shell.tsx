import React, { useEffect, useMemo, useState } from 'react';
import { Icon, type IconName } from '../ui/icons';
import { Badge, IconButton, Ring, useToast } from '../ui/primitives';
import { useVault } from '../state/store';
import { postureReport } from '../core/security/posture';
import { formatDuration } from '../core/policy/evaluate';

export interface NavPage {
  id: string;
  label: string;
  icon: IconName;
  group: string;
  title: string;
  subtitle: string;
}

export const NAV: NavPage[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'vault', group: 'Money', title: 'Dashboard', subtitle: 'Everything you own, and everything watching it' },
  { id: 'wallets', label: 'Wallets', icon: 'layers', group: 'Money', title: 'Wallets', subtitle: 'Self-custody made easy — create and tier any number of wallets' },
  { id: 'send', label: 'Send', icon: 'send', group: 'Money', title: 'Send', subtitle: 'Secure Send: verify the destination before you sign' },
  { id: 'receive', label: 'Receive', icon: 'receive', group: 'Money', title: 'Receive', subtitle: 'Fresh address, verified derivation, no reuse' },
  { id: 'swap', label: 'Swap', icon: 'swap', group: 'Money', title: 'No-KYC swap', subtitle: 'Best rate across accountless providers, privacy coins included' },

  { id: 'policy', label: 'Policy studio', icon: 'sliders', group: 'Control', title: 'Policy studio', subtitle: 'Smart-contract behaviour per tier, with a simulator' },
  { id: 'reacts', label: 'Reacts', icon: 'bolt', group: 'Control', title: 'Defensive reacts', subtitle: 'What the vault does when you are not in the room' },
  { id: 'sweep', label: 'Consolidation', icon: 'download', group: 'Control', title: 'Consolidation', subtitle: 'Move what you own into the tier that should hold it' },

  { id: 'horcrux', label: 'Horcrux', icon: 'gem', group: 'Continuity', title: 'Horcrux', subtitle: 'Split your secrets so no single place can lose them' },
  { id: 'recovery', label: 'Recovery', icon: 'key', group: 'Continuity', title: 'Recovery console', subtitle: 'Reclaim key material you already hold — attested and logged' },

  { id: 'security', label: 'Security', icon: 'shield', group: 'Operations', title: 'Security centre', subtitle: 'Duress mode, phishing protection, posture' },
  { id: 'activity', label: 'Activity', icon: 'activity', group: 'Operations', title: 'Activity', subtitle: 'Transactions, policy decisions and the audit trail' },
  { id: 'settings', label: 'Settings', icon: 'settings', group: 'Operations', title: 'Settings', subtitle: 'Network, privacy, lock policy and the kill switch' },
];

const GROUPS = ['Money', 'Control', 'Continuity', 'Operations'];

export function Shell({
  page,
  onNavigate,
  children,
}: {
  page: string;
  onNavigate: (id: string) => void;
  children: React.ReactNode;
}) {
  const { state, lock, totals, injectEvent, setDuress, duress, status } = useVault();
  const toast = useToast();
  const [palette, setPalette] = useState(false);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);

  const meta = NAV.find((n) => n.id === page) ?? NAV[0];
  const posture = useMemo(() => (state ? postureReport(state) : null), [state]);
  const critical = state?.events.filter((e) => e.severity === 'critical' && !e.acknowledged).length ?? 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((p) => !p);
        setQuery('');
        setCursor(0);
      }
      if (e.key === 'Escape') setPalette(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const commands = useMemo(() => {
    const navCmds = NAV.map((n) => ({ id: n.id, label: n.label, hint: n.group, icon: n.icon, run: () => onNavigate(n.id) }));
    const actions = [
      { id: 'act-event', label: 'Simulate a watchtower event', hint: 'action', icon: 'radar' as IconName, run: () => { injectEvent(); toast('Watchtower event injected'); } },
      { id: 'act-lock', label: 'Lock vault now', hint: 'action', icon: 'lock' as IconName, run: () => lock() },
      {
        id: 'act-duress',
        label: duress ? 'Exit duress mode' : 'Enter duress mode',
        hint: 'action',
        icon: 'skull' as IconName,
        run: () => {
          setDuress(!duress);
          toast(duress ? 'Duress mode off' : 'Duress mode on — real wallets hidden', duress ? 'ok' : 'bad');
        },
      },
    ];
    return [...navCmds, ...actions].filter((c) => c.label.toLowerCase().includes(query.toLowerCase()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, onNavigate, injectEvent, lock, duress]);

  const runCommand = (index: number) => {
    const cmd = commands[index];
    if (!cmd) return;
    cmd.run();
    setPalette(false);
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Icon name="vault" size={16} />
          </div>
          <div>
            <div className="brand-name">BLACKVAULT</div>
            <div className="brand-sub">NON-CUSTODIAL</div>
          </div>
        </div>

        {GROUPS.map((group) => (
          <div className="nav-group" key={group}>
            <div className="nav-label">{group}</div>
            {NAV.filter((n) => n.group === group).map((n) => (
              <button
                key={n.id}
                className={`nav-item ${page === n.id ? 'active' : ''}`}
                onClick={() => onNavigate(n.id)}
              >
                <Icon name={n.icon} size={15} />
                <span>{n.label}</span>
                {n.id === 'activity' && critical > 0 ? <span className="dot" style={{ background: 'var(--bad)' }} /> : <span className="dot" />}
              </button>
            ))}
          </div>
        ))}

        <div className="spacer" />

        <div className="stack sm" style={{ padding: '0 6px' }}>
          <div className="row between">
            <span className="tiny muted">Search</span>
            <span className="badge">⌘K</span>
          </div>
          {posture && (
            <div className="row" style={{ gap: 10 }}>
              <Ring value={posture.score} size={40} stroke={4} tone={posture.score >= 72 ? 'var(--ok)' : posture.score >= 50 ? 'var(--warn)' : 'var(--bad)'}>
                <span className="mono tiny strong">{posture.score}</span>
              </Ring>
              <div style={{ minWidth: 0 }}>
                <div className="tiny strong">Posture {posture.grade}</div>
                <div className="tiny muted" style={{ lineHeight: 1.35 }}>{posture.label}</div>
              </div>
            </div>
          )}
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div style={{ minWidth: 0 }}>
            <div className="row" style={{ gap: 8 }}>
              <span className="topbar-title">{meta.title}</span>
              {duress && <Badge tone="bad" icon="skull">DURESS</Badge>}
              {state?.settings.chainMode === 'live' && <Badge tone="info" icon="globe">LIVE CHAIN</Badge>}
            </div>
            <div className="topbar-sub">{meta.subtitle}</div>
          </div>
          <div className="spacer" />
          <div className="row" style={{ gap: 8 }}>
            <Badge tone={totals.totalUsd > 0 ? 'ok' : 'default'}>
              <span className="mono">{totals.totalUsd.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}</span>
            </Badge>
            {critical > 0 && (
              <button className="btn sm danger" onClick={() => onNavigate('activity')}>
                <Icon name="alert" size={13} /> {critical}
              </button>
            )}
            <IconButton name="radar" title="Simulate watchtower event" onClick={injectEvent} />
            <button className="btn sm" onClick={() => status === 'unlocked' && lock()}>
              <Icon name="lock" size={13} /> Lock
            </button>
          </div>
        </header>

        <div className={`content ${page === 'dashboard' ? 'wide' : ''}`}>{children}</div>
      </main>

      {palette && (
        <div className="cmdk" onClick={() => setPalette(false)}>
          <div className="cmdk-box" onClick={(e) => e.stopPropagation()}>
            <input
              className="cmdk-input"
              autoFocus
              placeholder="Jump to a page or run an action…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setCursor(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setCursor((c) => Math.min(commands.length - 1, c + 1));
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setCursor((c) => Math.max(0, c - 1));
                }
                if (e.key === 'Enter') runCommand(cursor);
              }}
            />
            <div className="cmdk-list">
              {commands.length === 0 && <div className="empty small">Nothing matches.</div>}
              {commands.map((c, i) => (
                <div
                  key={c.id}
                  className={`cmdk-item ${i === cursor ? 'active' : ''}`}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => runCommand(i)}
                >
                  <Icon name={c.icon} size={14} />
                  <span>{c.label}</span>
                  <span className="spacer" />
                  <span className="tiny muted">{c.hint}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Small helper used by pages to show a "held for X" line. */
export function HoldNote({ seconds }: { seconds: number }) {
  if (seconds <= 0) return null;
  return (
    <div className="row" style={{ gap: 6 }}>
      <Icon name="clock" size={13} className="muted" />
      <span className="small muted">Held for {formatDuration(seconds)} — cancellable until release</span>
    </div>
  );
}
