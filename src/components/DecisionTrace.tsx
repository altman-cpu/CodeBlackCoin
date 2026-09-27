import type { Decision, RuleTrace } from '../core/types';
import { formatDuration } from '../core/policy/evaluate';
import { Icon, type IconName } from '../ui/icons';
import { Badge } from '../ui/primitives';

const OUTCOME_ICON: Record<string, IconName> = {
  pass: 'check',
  challenge: 'shield',
  delay: 'clock',
  quorum: 'gem',
  deny: 'x',
};

const OUTCOME_TONE: Record<string, string> = {
  pass: 'var(--ok)',
  challenge: 'var(--info)',
  delay: 'var(--warn)',
  quorum: 'var(--violet)',
  deny: 'var(--bad)',
};

const DECISION_TONE: Record<Decision['outcome'], 'ok' | 'info' | 'warn' | 'violet' | 'bad'> = {
  allow: 'ok',
  challenge: 'info',
  delay: 'warn',
  quorum: 'violet',
  deny: 'bad',
};

const DECISION_ICON: Record<Decision['outcome'], IconName> = {
  allow: 'shield-check',
  challenge: 'fingerprint',
  delay: 'clock',
  quorum: 'gem',
  deny: 'shield-off',
};

const DECISION_LABEL: Record<Decision['outcome'], string> = {
  allow: 'Allowed',
  challenge: 'Verification required',
  delay: 'Held',
  quorum: 'Quorum required',
  deny: 'Blocked',
};

/** The whole point of the wallet: show the reasoning, not just the verdict. */
export function DecisionVerdict({ decision, compact }: { decision: Decision; compact?: boolean }) {
  const tone = DECISION_TONE[decision.outcome];
  const color = OUTCOME_TONE[decision.outcome];
  return (
    <div className={`verdict ${decision.outcome}`}>
      <div
        className="glyph"
        style={{ background: `color-mix(in srgb, ${color} 18%, transparent)`, color }}
      >
        <Icon name={DECISION_ICON[decision.outcome]} size={18} />
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="row wrap" style={{ gap: 8 }}>
          <span className="strong">{DECISION_LABEL[decision.outcome]}</span>
          <Badge tone={tone}>{decision.traces.filter((t) => t.outcome !== 'pass').length} rule(s) engaged</Badge>
          {decision.holdSeconds > 0 && <Badge tone="warn" icon="clock">{formatDuration(decision.holdSeconds)} hold</Badge>}
          {decision.quorum && <Badge tone="violet" icon="gem">{decision.quorum.m}-of-{decision.quorum.n} shards</Badge>}
        </div>
        {!compact && <div className="small muted" style={{ marginTop: 3 }}>{decision.headline}</div>}
      </div>
    </div>
  );
}

export function TraceList({ traces }: { traces: RuleTrace[] }) {
  if (traces.length === 0) {
    return (
      <div className="small muted">
        No rule was engaged by this request. That is either a small, routine movement — or a policy with holes in it.
      </div>
    );
  }
  return (
    <div className="trace">
      {traces.map((t, i) => (
        <div key={`${t.ruleId}-${i}`} className={`trace-item ${t.outcome}`}>
          <span style={{ color: OUTCOME_TONE[t.outcome], marginTop: 1 }}>
            <Icon name={OUTCOME_ICON[t.outcome]} size={14} />
          </span>
          <div style={{ minWidth: 0 }}>
            <div className="t-head">
              <span className="strong" style={{ fontSize: 12.5 }}>{t.label}</span>
              <Badge tone={t.severity === 'critical' ? 'bad' : t.severity === 'warn' ? 'warn' : 'default'}>
                {t.outcome}
              </Badge>
            </div>
            <div className="small muted" style={{ marginTop: 3, lineHeight: 1.55 }}>{t.detail}</div>
            {t.remediation && (
              <div className="tiny" style={{ marginTop: 5, color: 'var(--text-2)' }}>
                <Icon name="arrow-right" size={11} /> {t.remediation}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export function RequiredSteps({ steps }: { steps: Decision['requiredSteps'] }) {
  if (steps.length === 0) return null;
  const labels: Record<string, string> = {
    passkey: 'Passkey',
    secondDevice: 'Second device',
    secureSend: 'Secure Send',
    shards: 'Horcrux shards',
    duressCheck: 'Duress check',
  };
  return (
    <div className="row wrap" style={{ gap: 6 }}>
      <span className="tiny muted">Required:</span>
      {steps.map((s) => (
        <Badge key={s} tone="info" icon="check">{labels[s] ?? s}</Badge>
      ))}
    </div>
  );
}
