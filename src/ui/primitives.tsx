import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Icon, type IconName } from './icons';

/* ------------------------------------------------------------------ toasts */

type ToastTone = 'ok' | 'warn' | 'bad' | 'info';
interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

const ToastContext = createContext<(message: string, tone?: ToastTone) => void>(() => {});

export const useToast = () => useContext(ToastContext);

export function ToastHost({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, tone: ToastTone = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, tone }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone}`}>
            <Icon name={t.tone === 'ok' ? 'check' : t.tone === 'bad' ? 'alert' : 'info'} size={15} />
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* ------------------------------------------------------------------ button */

export function Button({
  children,
  variant = 'default',
  size,
  icon,
  iconRight,
  loading,
  block,
  className = '',
  ...rest
}: {
  children?: React.ReactNode;
  variant?: 'default' | 'primary' | 'danger' | 'ghost' | 'outline';
  size?: 'sm' | 'lg';
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
  block?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const cls = [
    'btn',
    variant !== 'default' ? variant : '',
    size ? size : '',
    block ? 'block' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button className={cls} disabled={loading || rest.disabled} {...rest}>
      {loading ? <Icon name="refresh" size={14} className="pulse" /> : icon ? <Icon name={icon} size={15} /> : null}
      {children}
      {iconRight && !loading ? <Icon name={iconRight} size={15} /> : null}
    </button>
  );
}

export function IconButton({
  name,
  onClick,
  title,
  size = 15,
}: {
  name: IconName;
  onClick?: () => void;
  title?: string;
  size?: number;
}) {
  return (
    <button className="icon-btn" onClick={onClick} title={title} aria-label={title} type="button">
      <Icon name={name} size={size} />
    </button>
  );
}

/* -------------------------------------------------------------------- card */

export function Card({
  title,
  subtitle,
  icon,
  actions,
  children,
  footer,
  tone,
  className = '',
  bodyClass = '',
}: {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: IconName;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  tone?: 'ok' | 'warn' | 'bad' | 'violet';
  className?: string;
  bodyClass?: string;
}) {
  return (
    <div className={`card ${tone ? `accent-${tone}` : ''} ${className}`}>
      {(title || actions) && (
        <div className="card-head">
          {icon && <Icon name={icon} size={15} className="muted" />}
          <div style={{ minWidth: 0 }}>
            <h3>{title}</h3>
            {subtitle && <div className="tiny muted">{subtitle}</div>}
          </div>
          <div className="spacer" />
          {actions}
        </div>
      )}
      <div className={`card-body ${bodyClass}`}>{children}</div>
      {footer && <div className="card-foot">{footer}</div>}
    </div>
  );
}

/* -------------------------------------------------------------- indicators */

export function Badge({
  children,
  tone = 'default',
  icon,
  title,
}: {
  children: React.ReactNode;
  tone?: 'default' | 'ok' | 'warn' | 'bad' | 'info' | 'violet';
  icon?: IconName;
  title?: string;
}) {
  return (
    <span className={`badge ${tone === 'default' ? '' : tone}`} title={title}>
      {icon && <Icon name={icon} size={11} />}
      {children}
    </span>
  );
}

export function TierBadge({ tier, label }: { tier: number; label?: string }) {
  const colors = ['var(--t0)', 'var(--t1)', 'var(--t2)', 'var(--t3)', 'var(--t4)'];
  return (
    <span className="badge tier" style={{ borderColor: colors[tier] + '55', color: colors[tier], background: colors[tier] + '14' }}>
      T{tier} · {label}
    </span>
  );
}

export function Stat({ k, v, sub, tone }: { k: string; v: React.ReactNode; sub?: React.ReactNode; tone?: string }) {
  return (
    <div className="stat">
      <div className="k">{k}</div>
      <div className="v" style={tone ? { color: tone } : undefined}>{v}</div>
      {sub && <div className="s">{sub}</div>}
    </div>
  );
}

export function Meter({ value, max = 100, tone = 'var(--accent)' }: { value: number; max?: number; tone?: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="meter">
      <span style={{ width: `${pct}%`, background: tone }} />
    </div>
  );
}

export function Ring({
  value,
  size = 78,
  stroke = 7,
  tone = 'var(--accent)',
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  tone?: string;
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#151a22" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={tone}
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={c - (c * pct) / 100}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
      </svg>
      <div className="ring-label">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ inputs */

export function Field({
  label,
  help,
  children,
  right,
}: {
  label?: React.ReactNode;
  help?: React.ReactNode;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="field">
      {label && (
        <div className="row between">
          <span className="label">{label}</span>
          {right}
        </div>
      )}
      {children}
      {help && <div className="help">{help}</div>}
    </div>
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { mono?: boolean }>(
  ({ mono, className = '', ...rest }, ref) => (
    <input ref={ref} className={`input ${mono ? 'mono' : ''} ${className}`} {...rest} />
  ),
);
Input.displayName = 'Input';

export function Select({
  options,
  value,
  onChange,
  ...rest
}: {
  options: { value: string; label: string; disabled?: boolean }[];
  value: string;
  onChange: (value: string) => void;
} & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value'>) {
  return (
    <select className="select" value={value} onChange={(e) => onChange(e.target.value)} {...rest}>
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { mono?: boolean }) {
  const { mono, className = '', ...rest } = props;
  return <textarea className={`textarea ${mono ? 'mono' : ''} ${className}`} {...rest} />;
}

export function Toggle({
  on,
  onChange,
  disabled,
  title,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      className={`toggle ${on ? 'on' : ''} ${disabled ? 'disabled' : ''}`}
      onClick={() => !disabled && onChange(!on)}
      aria-pressed={on}
      title={title}
    />
  );
}

export function ToggleRow({
  label,
  help,
  on,
  onChange,
  disabled,
  badge,
}: {
  label: React.ReactNode;
  help?: React.ReactNode;
  on: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  badge?: React.ReactNode;
}) {
  return (
    <div className="row between" style={{ alignItems: 'flex-start', gap: 14 }}>
      <div style={{ minWidth: 0 }}>
        <div className="row" style={{ gap: 8 }}>
          <span className="strong" style={{ fontSize: 13 }}>{label}</span>
          {badge}
        </div>
        {help && <div className="help" style={{ marginTop: 3 }}>{help}</div>}
      </div>
      <Toggle on={on} onChange={onChange} disabled={disabled} />
    </div>
  );
}

export function CheckRow({
  checked,
  onChange,
  children,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <div
      className="checkline"
      onClick={() => !disabled && onChange(!checked)}
      style={disabled ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
    >
      <div className={`checkbox ${checked ? 'on' : ''}`}>{checked && <Icon name="check" size={12} strokeWidth={3} />}</div>
      <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.55 }}>{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------- modal */

export function Modal({
  title,
  subtitle,
  icon,
  onClose,
  children,
  footer,
  wide,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: IconName;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className={`modal ${wide ? 'wide' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          {icon && <Icon name={icon} size={16} className="muted" />}
          <div style={{ minWidth: 0 }}>
            <h3>{title}</h3>
            {subtitle && <div className="tiny muted">{subtitle}</div>}
          </div>
          <div className="spacer" />
          <IconButton name="x" onClick={onClose} title="Close" />
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- tabs */

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: string; count?: number; icon?: IconName }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <button
          key={t.id}
          className={`tab ${value === t.id ? 'active' : ''}`}
          onClick={() => onChange(t.id)}
          type="button"
        >
          {t.icon && <Icon name={t.icon} size={14} />}
          {t.label}
          {t.count !== undefined && <span className="count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------- misc */

export function Empty({
  icon = 'search',
  title,
  children,
  action,
}: {
  icon?: IconName;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <div className="ico">
        <Icon name={icon} size={18} />
      </div>
      <div className="strong" style={{ color: 'var(--text-2)' }}>{title}</div>
      {children && <div className="small" style={{ maxWidth: 420 }}>{children}</div>}
      {action}
    </div>
  );
}

export function Callout({
  tone = 'default',
  icon,
  children,
}: {
  tone?: 'default' | 'ok' | 'warn' | 'bad';
  icon?: IconName;
  children: React.ReactNode;
}) {
  return (
    <div className={`callout ${tone === 'default' ? '' : tone}`}>
      {icon && (
        <span className="ico" style={{ color: tone === 'bad' ? 'var(--bad)' : tone === 'warn' ? 'var(--warn)' : tone === 'ok' ? 'var(--ok)' : 'var(--muted)' }}>
          <Icon name={icon} size={15} />
        </span>
      )}
      <div>{children}</div>
    </div>
  );
}

export function CopyText({ value, display, mono = true }: { value: string; display?: string; mono?: boolean }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const copy = useCallback(
    async (e?: React.MouseEvent) => {
      e?.stopPropagation();
      try {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        toast('Copied to clipboard');
        window.setTimeout(() => setCopied(false), 1400);
      } catch {
        toast('Clipboard blocked by the browser', 'warn');
      }
    },
    [value, toast],
  );
  return (
    <span className="copyable" onClick={copy} title="Click to copy" style={{ cursor: 'pointer' }}>
      <span className={mono ? 'mono' : ''}>{display ?? value}</span>
      <Icon name={copied ? 'check' : 'copy'} size={12} className="muted" />
    </span>
  );
}

export function KeyValue({ k, v }: { k: React.ReactNode; v: React.ReactNode }) {
  return (
    <div className="kv">
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  );
}

export function Steps({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="stack sm">
      <div className="progress-steps">
        {steps.map((_, i) => (
          <div key={i} className={`step ${i <= current ? 'done' : ''}`} />
        ))}
      </div>
      <div className="row between">
        <span className="tiny muted">Step {current + 1} of {steps.length}</span>
        <span className="tiny strong">{steps[current]}</span>
      </div>
    </div>
  );
}

export function AssetLogo({ symbol, color, size = 26 }: { symbol: string; color: string; size?: number }) {
  return (
    <div
      className="asset-logo"
      style={{ background: color, width: size, height: size, fontSize: size * 0.36 }}
      title={symbol}
    >
      {symbol.slice(0, 3)}
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div style={{ position: 'relative' }}>
      <span style={{ position: 'absolute', left: 10, top: 9, color: 'var(--faint)', display: 'grid' }}>
        <Icon name="search" size={14} />
      </span>
      <input
        className="input"
        style={{ paddingLeft: 32 }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

/** Masked value that can be revealed — for balances in public places. */
export function Maskable({ children, hidden }: { children: React.ReactNode; hidden: boolean }) {
  const [show, setShow] = useState(false);
  const masked = hidden && !show;
  return (
    <span className="row" style={{ gap: 6 }}>
      <span style={{ filter: masked ? 'blur(6px)' : undefined, transition: 'filter .15s ease' }}>{children}</span>
      {hidden && (
        <button
          className="icon-btn"
          style={{ width: 20, height: 20 }}
          onClick={() => setShow((s) => !s)}
          title={show ? 'Hide' : 'Reveal'}
          type="button"
        >
          <Icon name={show ? 'eye-off' : 'eye'} size={12} />
        </button>
      )}
    </span>
  );
}

export function useLocalState<T>(initial: T): [T, (v: T) => void] {
  const [v, setV] = useState(initial);
  return useMemo(() => [v, setV], [v]);
}
