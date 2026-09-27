import type { VaultState } from '../types';
import { effectiveRules, ruleOf } from '../policy/evaluate';
import { heartbeatDue } from '../horcrux/vault';

/**
 * Security posture: an honest score of how hard this vault is to rob, coerce or
 * lose. Deliberately unforgiving — a vault with a mnemonic and no shard set, no
 * duress PIN and no decoy scores badly even though it "works".
 */

export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface PostureCheck {
  id: string;
  label: string;
  detail: string;
  status: CheckStatus;
  weight: number;
  /** Where to go to fix it. */
  fix: string;
}

export interface PostureReport {
  score: number;
  grade: 'F' | 'D' | 'C' | 'B' | 'A' | 'A+';
  label: string;
  checks: PostureCheck[];
  passedWeight: number;
  totalWeight: number;
}

const GRADE_THRESHOLDS: [number, PostureReport['grade'], string][] = [
  [95, 'A+', 'Hostile to attackers, forgiving to heirs'],
  [85, 'A', 'Hard target'],
  [72, 'B', 'Solid, with gaps'],
  [58, 'C', 'Defended against amateurs only'],
  [40, 'D', 'One bad day from zero'],
  [0, 'F', 'Unprotected'],
];

export function postureReport(state: VaultState, now = Date.now()): PostureReport {
  const visibleWallets = state.wallets.filter((w) => w.visibility !== 'decoy');
  const checks: PostureCheck[] = [];

  /* 1. Key material is backed up in more than one place. */
  const sharded = state.horcruxes.length > 0;
  checks.push({
    id: 'backup',
    label: 'Seed material is sharded',
    detail: sharded
      ? `${state.horcruxes.length} Horcrux set(s): ${state.horcruxes.map((h) => `${h.m}-of-${h.n}`).join(', ')}`
      : 'A single mnemonic is a single point of failure: lose it, or have it found, and the money is gone.',
    status: sharded ? 'pass' : 'fail',
    weight: 12,
    fix: 'horcrux',
  });

  /* 2. Passkey enrolment. */
  const passkeys = state.wallets.filter((w) => w.passkeyId).length;
  checks.push({
    id: 'passkey',
    label: 'At least one passkey-backed wallet',
    detail:
      passkeys > 0
        ? `${passkeys} wallet(s) are gated by a platform passkey`
        : 'Every wallet opens with something you type. Something you type can be filmed, phished or forced out of you.',
    status: passkeys > 0 ? 'pass' : 'warn',
    weight: 8,
    fix: 'wallets',
  });

  /* 3. Duress mode configured. */
  const duress = !!state.settings.duressPin;
  const decoys = state.wallets.filter((w) => w.visibility === 'decoy').length;
  checks.push({
    id: 'duress',
    label: 'Duress mode + decoy wallet',
    detail:
      duress && decoys > 0
        ? `Duress PIN set, ${decoys} decoy wallet(s) ready to hand over`
        : duress
          ? 'Duress PIN set, but no decoy wallet — there is nothing credible to surrender'
          : 'No duress PIN. The most likely attack on you is a person, not a script.',
    status: duress && decoys > 0 ? 'pass' : duress ? 'warn' : 'fail',
    weight: 12,
    fix: 'security',
  });

  /* 4. Phishing shield on everywhere. */
  const missingShield = visibleWallets.filter((w) => {
    const rules = effectiveRules(state.policy, w.id, w.tier);
    return !ruleOf(rules, 'phishingShield')?.enabled;
  });
  checks.push({
    id: 'shield',
    label: 'Phishing shield enabled on every wallet',
    detail:
      missingShield.length === 0
        ? 'All wallets screen destinations before signing'
        : `${missingShield.length} wallet(s) sign without screening: ${missingShield.map((w) => w.label).join(', ')}`,
    status: missingShield.length === 0 ? 'pass' : 'fail',
    weight: 10,
    fix: 'policy',
  });

  /* 5. A cold tier exists for savings. */
  const cold = state.wallets.filter((w) => w.tier === 0).length;
  checks.push({
    id: 'cold',
    label: 'Savings sit in a cold tier',
    detail:
      cold > 0
        ? `${cold} wallet(s) at tier 0 (Glacier) — movements are ceremonies`
        : 'Every wallet can spend quickly. Nothing is protected from a bad five minutes.',
    status: cold > 0 ? 'pass' : visibleWallets.length > 0 ? 'warn' : 'fail',
    weight: 9,
    fix: 'wallets',
  });

  /* 6. Dead-man / inheritance plan alive. */
  const overdue = state.horcruxes.filter((h) => heartbeatDue(h, now));
  checks.push({
    id: 'inheritance',
    label: 'Inheritance plan is alive',
    detail:
      state.horcruxes.length === 0
        ? 'No Horcrux plan: if you disappear, the money does too.'
        : overdue.length === 0
          ? `${state.horcruxes.length} plan(s) within the heartbeat window`
          : `${overdue.length} plan(s) past due heartbeat — beneficiaries get closer to a claim each day`,
    status: state.horcruxes.length === 0 ? 'fail' : overdue.length === 0 ? 'pass' : 'warn',
    weight: 8,
    fix: 'horcrux',
  });

  /* 7. Verified payees. */
  const verifiedContacts = state.contacts.filter((c) => c.verifiedAt);
  checks.push({
    id: 'contacts',
    label: 'Payees verified out-of-band',
    detail:
      verifiedContacts.length > 0
        ? `${verifiedContacts.length} contact(s) confirmed by fingerprint over a second channel`
        : 'No verified payees: every send relies on trusting a string you copied.',
    status: verifiedContacts.length > 0 ? 'pass' : state.contacts.length > 0 ? 'warn' : 'fail',
    weight: 6,
    fix: 'security',
  });

  /* 8. Auto-lock. */
  const autoLock = state.settings.autoLockMinutes;
  checks.push({
    id: 'autolock',
    label: 'Session auto-locks',
    detail:
      autoLock <= 10
        ? `Locks after ${autoLock} minutes idle`
        : autoLock <= 30
          ? `Locks after ${autoLock} minutes — a long window to leave a laptop open`
          : 'Auto-lock is effectively off',
    status: autoLock <= 10 ? 'pass' : autoLock <= 30 ? 'warn' : 'fail',
    weight: 5,
    fix: 'settings',
  });

  /* 9. Unacknowledged critical events. */
  const openEvents = state.events.filter((e) => e.severity === 'critical' && !e.acknowledged);
  checks.push({
    id: 'events',
    label: 'No unacknowledged critical alerts',
    detail:
      openEvents.length === 0
        ? 'Nothing critical is waiting on you'
        : `${openEvents.length} critical event(s) unread — an attacker loves an operator who ignores alerts`,
    status: openEvents.length === 0 ? 'pass' : 'fail',
    weight: 8,
    fix: 'activity',
  });

  /* 10. Defensive reacts armed. */
  const defensive = state.reacts.filter((r) => r.risk === 'defensive' && r.enabled).length;
  const totalDefensive = state.reacts.filter((r) => r.risk === 'defensive').length;
  checks.push({
    id: 'reacts',
    label: 'Defensive reacts armed',
    detail: `${defensive}/${totalDefensive} defensive reacts enabled`,
    status: defensive === totalDefensive ? 'pass' : defensive >= totalDefensive / 2 ? 'warn' : 'fail',
    weight: 9,
    fix: 'reacts',
  });

  /* 11. Aggressive reacts are deliberate, not accidental. */
  const aggressiveOn = state.reacts.filter((r) => r.risk === 'aggressive' && r.enabled).length;
  const hasTier3 = state.wallets.some((w) => w.tier >= 3);
  checks.push({
    id: 'aggressive',
    label: 'Aggressive automation is deliberate',
    detail:
      aggressiveOn === 0
        ? 'No unattended fund movement configured — safest, but you must react yourself'
        : hasTier3
          ? `${aggressiveOn} aggressive react(s) armed on tier 3+ wallets with attestation gating`
          : `${aggressiveOn} aggressive react(s) enabled but no tier 3+ wallet can authorise them`,
    status: aggressiveOn === 0 ? 'pass' : hasTier3 ? 'pass' : 'warn',
    weight: 4,
    fix: 'reacts',
  });

  /* 12. Recovery policy acknowledged. */
  checks.push({
    id: 'recovery-policy',
    label: 'Recovery policy acknowledged',
    detail: state.settings.recoveryPolicyAcceptedAt
      ? 'You accepted that consolidation only ever touches key material you own'
      : 'Read and accept the recovery/consolidation policy before any sweep runs.',
    status: state.settings.recoveryPolicyAcceptedAt ? 'pass' : 'warn',
    weight: 4,
    fix: 'recovery',
  });

  /* 13. Telemetry. */
  checks.push({
    id: 'telemetry',
    label: 'No telemetry',
    detail: state.settings.telemetry
      ? 'Telemetry is ON. This app is supposed to know nothing about you.'
      : 'Zero analytics, zero crash reporting, zero accounts',
    status: state.settings.telemetry ? 'fail' : 'pass',
    weight: 3,
    fix: 'settings',
  });

  /* 14. Frozen wallets reviewed. */
  checks.push({
    id: 'frozen',
    label: 'No wallets left frozen',
    detail:
      state.frozenWallets.length === 0
        ? 'All wallets able to move'
        : `${state.frozenWallets.length} wallet(s) frozen by a react — review and release`,
    status: state.frozenWallets.length === 0 ? 'pass' : 'warn',
    weight: 2,
    fix: 'reacts',
  });

  const totalWeight = checks.reduce((n, c) => n + c.weight, 0);
  const passedWeight = checks.reduce((n, c) => n + (c.status === 'pass' ? c.weight : c.status === 'warn' ? c.weight * 0.5 : 0), 0);
  const score = Math.round((passedWeight / totalWeight) * 100);
  const [, grade, label] = GRADE_THRESHOLDS.find(([min]) => score >= min)!;

  return { score, grade, label, checks, passedWeight, totalWeight };
}

export function toneFor(status: CheckStatus): string {
  return status === 'pass' ? 'ok' : status === 'warn' ? 'warn' : 'bad';
}
