import { Icon, type IconName } from '../ui/icons';
import { Button, Callout } from '../ui/primitives';
import { ROUTER_ASSET_COUNT, ASSETS } from '../core/assets';
import { TIERS } from '../core/policy/tiers';

const FEATURES: { icon: IconName; title: string; body: string }[] = [
  {
    icon: 'layers',
    title: 'Self-custody made easy',
    body: 'Non-custodial does not have to mean complicated. Create and manage any number of wallets, each with its own tier, policy and visibility. It is your own bank where you are the only client.',
  },
  {
    icon: 'fingerprint',
    title: 'Passkey wallets',
    body: 'Create and restore non-custodial wallets tied to your own biometrics. Self-custody without the seed-phrase anxiety: your face and fingerprint become the vault only you can open.',
  },
  {
    icon: 'vault',
    title: 'Bitcoin, done properly',
    body: 'Native segwit addresses derived on-device from real BIP-39 entropy. No address reuse, no third-party derivation service, no custodian in the middle.',
  },
  {
    icon: 'moon',
    title: 'Privacy coin wallet',
    body: 'Monero and Zcash with the features that make them worth holding. Shielded-first thinking: swap privately, and route around the transparent rails when it matters.',
  },
  {
    icon: 'swap',
    title: 'No-KYC swaps',
    body: 'Exchange one crypto for another privately and unconditionally. Quotes from accountless providers, ranked by what actually lands in your wallet after fees.',
  },
  {
    icon: 'shield-check',
    title: 'Security that works',
    body: 'Duress mode hides critical wallets under pressure. The phishing shield kills clipboard hijacks and poisoned lookalikes. Secure Send verifies you are paying who you think you are paying.',
  },
  {
    icon: 'sliders',
    title: 'Smart-contract policy tiers',
    body: 'Five tiers of programmable behaviour: spend ceilings, velocity brakes, cancellable time-locks, shard quorums and signing windows — enforced before anything is signed.',
  },
  {
    icon: 'bolt',
    title: 'Defensive automation',
    body: 'Reacts fire on the threats that actually cost people money: drainers, anomalous outflows, unrecognised devices, missed heartbeats. You sleep; the vault does not.',
  },
  {
    icon: 'gem',
    title: 'Horcrux continuity',
    body: 'Shamir-split your recovery material into shards held by people and places you trust. m-of-n reconstruction, a heartbeat, and an inheritance timelock your heirs can actually use.',
  },
];

export function Landing({ onStart, onRestore }: { onStart: () => void; onRestore: () => void }) {
  return (
    <div className="landing">
      <section className="hero">
        <div className="eyebrow">
          <Icon name="lock" size={11} /> Self-custody · No accounts · No KYC
        </div>
        <h1>
          Your money is unconditionally yours.
          <br />
          <span style={{ color: 'var(--accent)' }}>Or it isn't your money.</span>
        </h1>
        <p className="lede">
          BLACKVAULT is a non-custodial wallet built for people who do not accept asking permission to touch their own
          capital — and who want programmable guardrails instead of promises. Real keys, derived on your device.
          Policy tiers that behave like smart contracts. Automation that defends the vault when you are not in the room.
        </p>
        <div className="cta">
          <Button variant="primary" size="lg" icon="vault" onClick={onStart}>
            Create a vault
          </Button>
          <Button size="lg" icon="key" onClick={onRestore}>
            Restore from recovery phrase
          </Button>
        </div>
        <div className="row" style={{ justifyContent: 'center', gap: 16, marginTop: 22, flexWrap: 'wrap' }}>
          <span className="tiny muted">
            <Icon name="coins" size={12} /> {ROUTER_ASSET_COUNT}+ assets routable
          </span>
          <span className="tiny muted">
            <Icon name="shield" size={12} /> Zero analytics, zero accounts
          </span>
          <span className="tiny muted">
            <Icon name="terminal" size={12} /> Open source, auditable
          </span>
        </div>
      </section>

      <section className="convictions">
        <div className="conviction">
          <div className="n">01</div>
          <h3 style={{ margin: '8px 0' }}>Your money is unconditionally yours</h3>
          <p className="small muted">
            A truly non-custodial wallet means nobody can freeze, seize or "temporarily suspend" access to your capital.
            Not us. Not anyone. There is no support line that can reset your password, because there is no back door —
            not even for us.
          </p>
        </div>
        <div className="conviction">
          <div className="n">02</div>
          <h3 style={{ margin: '8px 0' }}>Your money is your private matter</h3>
          <p className="small muted">
            Zero data collection. Zero data sharing. No user accounts keeping your records, no KYC checks that risk
            exposing your financials, no analytics quietly reporting on you. The app has no means to know who you are —
            by design.
          </p>
        </div>
        <div className="conviction">
          <div className="n">03</div>
          <h3 style={{ margin: '8px 0' }}>Securing your money should be easy</h3>
          <p className="small muted">
            Most wallets defend against textbook threats. Real people face phishing, theft, and someone forcing them to
            open their phone. BLACKVAULT targets real-world problems: duress mode, phishing protection, and Secure Send.
          </p>
        </div>
      </section>

      <section style={{ maxWidth: 1180, margin: '0 auto', padding: '0 24px 40px' }}>
        <Callout tone="ok" icon="shield-check">
          <strong>Scope, stated plainly.</strong> Consolidation and recovery tooling here only ever moves funds from key
          material you control — wallets inside your vault, or sources you attest ownership of. There is no feature that
          scans for, or takes, anyone else's assets. Dormant coins in a stranger's wallet are not abandoned property;
          they are theirs.
        </Callout>
      </section>

      <section className="feature-grid">
        {FEATURES.map((f) => (
          <div className="feature" key={f.title}>
            <div className="ico">
              <Icon name={f.icon} size={15} />
            </div>
            <div>
              <div className="strong" style={{ fontSize: 13.5, marginBottom: 4 }}>{f.title}</div>
              <div className="small muted" style={{ lineHeight: 1.6 }}>{f.body}</div>
            </div>
          </div>
        ))}
      </section>

      <section style={{ maxWidth: 1180, margin: '0 auto', padding: '48px 24px 0' }}>
        <h2 style={{ marginBottom: 6 }}>Five tiers. One policy engine.</h2>
        <p className="small muted" style={{ marginBottom: 18, maxWidth: 720 }}>
          Every wallet sits on a tier, and every tier is a bundle of rules evaluated before a signature is produced.
          Move a wallet up a tier to spend faster; drop it down to make spending a ceremony.
        </p>
        <div className="grid g2">
          {TIERS.map((t) => (
            <div className="card" key={t.id} style={{ borderColor: t.color + '33' }}>
              <div className="card-body stack sm">
                <div className="row between">
                  <div className="row" style={{ gap: 8 }}>
                    <span className="badge tier" style={{ borderColor: t.color + '55', color: t.color, background: t.color + '14' }}>
                      T{t.id} · {t.codename}
                    </span>
                    <span className="strong" style={{ fontSize: 13 }}>{t.name}</span>
                  </div>
                  <span className="tiny muted">{t.risk}</span>
                </div>
                <div className="small muted" style={{ lineHeight: 1.6 }}>{t.blurb}</div>
                <div className="tiny" style={{ color: t.color }}>{t.purpose}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ maxWidth: 1180, margin: '0 auto', padding: '48px 24px 0' }}>
        <h2 style={{ marginBottom: 14 }}>Assets with real key derivation</h2>
        <div className="row wrap" style={{ gap: 8 }}>
          {ASSETS.map((a) => (
            <span className="badge" key={a.id} title={a.family === 'sim' ? 'Derivation not implemented — watch-only' : `Family: ${a.family}`}>
              <span style={{ width: 7, height: 7, borderRadius: 4, background: a.color, display: 'inline-block' }} />
              {a.symbol}
              {a.family === 'sim' && <span className="dim"> · watch-only</span>}
            </span>
          ))}
        </div>
        <p className="tiny muted" style={{ marginTop: 10 }}>
          Assets marked watch-only have no derivation implemented in this build; the wallet will refuse to show a deposit
          address for them rather than risk your funds.
        </p>
      </section>

      <section style={{ maxWidth: 1180, margin: '56px auto 0', padding: '0 24px', textAlign: 'center' }}>
        <h2 style={{ marginBottom: 10 }}>Be unstoppable.</h2>
        <p className="small muted" style={{ maxWidth: 560, margin: '0 auto 20px' }}>
          If the above rhymes with you, this is your self-custody wallet. If you are looking for a custodial app with a
          support line that can reset your password, this one is not it.
        </p>
        <div className="row" style={{ justifyContent: 'center', gap: 12 }}>
          <Button variant="primary" size="lg" icon="vault" onClick={onStart}>Create a vault</Button>
          <Button size="lg" icon="key" onClick={onRestore}>Restore</Button>
        </div>
      </section>
    </div>
  );
}
