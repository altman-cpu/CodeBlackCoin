# BLACKVAULT

**A self-custody crypto wallet where "smart contract" means *behaviour*, not bytecode.**

Every wallet in the vault carries its own executable policy — caps, time-locks, shard quorums,
cool-downs, privacy floors — that is evaluated locally before a transaction is ever signed, and
defensive *reacts* that fire automatically when the vault is attacked. No KYC. No accounts. No
server. Keys are generated in the browser from BIP-39 entropy and never leave the device.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # 87 tests
npm run build    # tsc -b && vite build
```

---

## What the original brief asked for, and what was built

> *"Defensive reacts and aggressive wallet functions that control and sweep to our wallets when
> finding dormant wallets in the background and in any discovered horcrux… a piece of someone's
> soul that could be carrying abandoned assets."*

The **dormant-wallet hunting** part is not in this build, and it will not be added later.

Scanning the chain for strangers' dormant or abandoned wallets and sweeping their funds is
**theft**, not security. There is no legal or moral framing that makes "find an inactive key and
take its money" a defensive feature — and a wallet that ships with that capability is a wallet
that can be compelled, by subpoena or by malware, to run it against its own users.

Everything else in the brief is implemented, and the aggression was re-aimed at a target that is
actually yours:

| Asked for | Built as |
| --- | --- |
| Smart-contract behaviours, different levels at each tier | **5 policy tiers (0–4)** × **17 rules** × per-wallet overrides. Every send is evaluated against the effective rule set and returns a signed decision with a full audit trace. |
| Defensive reacts | **12 react actions** across **11 triggers**, with an explicit gate: aggressive reacts require consolidation enabled, a destination wallet, and a signed ownership attestation on **every** source. |
| Aggressive sweep functions | **Consolidation sweeper** — sweeps wallets *this vault owns* into a destination vault you choose. Optional idle/value filters, plan-then-execute, per-step progress. |
| Horcrux (sharded soul pieces) | **Horcrux vault** — Shamir m-of-n shards over GF(256), timelock, custodians, beneficiaries, heartbeat, inheritance claims, and a reconstruct path. |
| Recovery | **Recovery console** — recover from key material **you own** (mnemonic, shard set, keystore, watch-only) with a mandatory ownership attestation before anything moves. |
| Self-custody, no KYC, 200+ coins | 15 natively-derived assets (BTC, XMR, ZEC, ZANO, ETH + stables, LTC, DASH, SOL, TON, DOT, POL, ARB, BASE, USDT/USDC) across 5 seeded wallets; swap router quotes **214** pairs through pluggable adapters. No signup, no email, no analytics. |

The rule is enforced in code, not just in the UI copy:

- `src/core/automation/engine.ts` → `gateReact()` rejects any aggressive react whose sources are
  not individually attested.
- `src/core/sweep/planner.ts` → a source without an attestation is marked `blockedByAttestation`
  and dropped from the plan.
- `src/core/horcrux/vault.ts` → `scanKeyMaterial()` is **read-only**: it reports what a key can
  reach. It never moves funds.

---

## The five tiers

Tiers are not marketing labels — each one ships a different default rule set, and the Policy
Studio shows exactly which rules are locked at that tier.

| Tier | Codename | Posture | What it is for |
| --- | --- | --- | --- |
| **0** | **GLACIER** · Deep Cold | defensive | Long-term treasure. 48-hour time-lock, 2-of-3 shard quorum, second-device co-signature. Per-tx and velocity ceilings of zero — every movement needs a higher-order approval. |
| **1** | **SENTINEL** · Guarded | defensive | Everyday custody where mistakes must be cheap. $5k/tx, $10k/day, 30-minute cool-down on new destinations, phishing shield locked on. |
| **2** | **OPERATOR** · Operational | balanced | Money you actually move. $50k/tx, $250k/day, instant to allowlisted destinations, passkey above $10k. |
| **3** | **REACTOR** · Automated | balanced→aggressive | Policy drives the wallet: auto-consolidation, address rotation, allowance revocation, drainer blocking. |
| **4** | **RECLAIMER** · Recovery | aggressive | Moves fast and pays for priority — but **only** into addresses this vault owns, and only with an attestation on file. Aggression pointed at consolidation, never at discovery. |

A wallet's tier is independent of the vault's default tier, so you can keep a GLACIER hoard and an
OPERATOR spending wallet in the same vault.

## The 17 rules

`maxPerTx` · `dailyVelocity` · `hourlyVelocity` · `allowlist` · `denylist` · `newAddressCooldown` ·
`timelock` · `timeWindow` · `shardQuorum` · `passkeyThreshold` · `secondDevice` · `phishingShield` ·
`secureSend` · `duressTrigger` · `allowanceHygiene` · `privacyFloor` · `autoSweep`

Resolution order for the rules that govern a transaction:

```
defaultRulesFor(wallet.tier)      ← tier baseline (some rules locked ON, cannot be disabled)
  → policy.rules where custom     ← your vault-wide edits
  → policy.overrides[walletId]    ← per-wallet overrides
```

Each evaluated rule emits a `RuleTrace`: allow / hold / deny, the parameters used, and a
human-readable reason. The Send page renders the whole trace, so a denied transaction always comes
with a receipt explaining which rule denied it and what would satisfy it.

## Defensive reacts

**Triggers** — `phishing_detected` · `duress_unlock` · `large_outflow` · `new_device` ·
`drainer_approval` · `dormant_breach` · `heartbeat_missed` · `key_exposure` · `inbound_to_decoy` ·
`balance_anomaly` · `sweep_requested`

**Actions** — `freeze_outbound` · `require_quorum` · `notify` · `self_sweep` · `hide_wallets` ·
`switch_decoy` · `revoke_allowances` · `rotate_addresses` · `rate_limit` · `wipe_session` ·
`denylist_destination` · `log_only`

Every react has a dry-run mode, a per-react cooldown, and an audited run log (Activity → React
runs). `self_sweep` is the aggressive action, and it is the one that requires: react enabled →
wallet consolidation enabled → destination wallet set → **attestation on every source**.

---

## The pages

| Page | What it does |
| --- | --- |
| **Dashboard** | Vault balance, tier mix, posture ring, pending holds, react feed, quick actions. |
| **Wallets** | Per-wallet tier, balances, addresses (with derivation path), visibility (visible / hidden / decoy), funding and transfer. |
| **Send** | Build a transfer → live policy decision with the full rule trace → hold / deny / allow, then sign. |
| **Receive** | Fresh address per request, address rotation, privacy notes, amount+label QR payload. |
| **Swap** | No-KYC swap quotes across BTC / XMR / ZEC + the rest of the catalogue, with policy applied to the route. |
| **Policy** | The tier studio: pick a tier, edit rules vault-wide, override per wallet, and see what is locked. |
| **Reacts** | The automation builder: trigger → actions → scope → dry run → enable. |
| **Sweep** | Consolidation: filter candidates by value and idle time, choose destination + privacy mode + fee tier, plan, execute with per-step progress. |
| **Horcrux** | Create m-of-n shard sets from a mnemonic or wallet, custodian and beneficiary management, heartbeat, inheritance claims, reconstruct. |
| **Recovery** | Recover key material you own. Mandatory attestation (two checks + authorization reference + signer + policy acceptance) before a plan can be built. |
| **Security** | Posture score with fix-it links, duress PIN + decoy wallets, phishing tools (address screen, domain screen, denylist), Secure Send contacts. |
| **Activity** | Transactions, the append-only audit trail with JSON export, react runs, and the event log. |
| **Settings** | Privacy toggles, auto-lock, chain data mode (simulated / live read-only), watchtower, vault stats, and a typed-`WIPE` destroy. |

---

## Security model

**Encryption.** Vault state is sealed with AES-256-GCM under a key derived from the passphrase with
PBKDF2-SHA256 at 600,000 iterations (OWASP's floor for this KDF). Mnemonics and shard material are sealed individually and only
decrypted for a signing operation. The KDF binding (passkey id, salt) is preserved across re-seals,
so a re-encrypted vault stays openable with the same passphrase.

**Duress.** The duress PIN opens a **separate encrypted envelope** (`blackvault.v1.duress`) that
contains only decoy wallets, sealed with a key derived from the duress PIN. Entering it never reads
or decrypts the real vault, and a duress session cannot write back over it — the persistence path is
explicitly short-circuited while `duressActive` is set. Both properties are covered by tests
(`src/state/duress.test.tsx`).

**Phishing.** Address screening (homoglyph / punycode, address-poisoning lookalikes, unverified
contracts), domain screening, per-wallet shields, a denylist, and Secure Send contact verification
with word-based fingerprints.

**Threat model, stated honestly.** This protects against coercion, phishing, address poisoning,
drainer approvals, and casual device theft. It does **not** protect against a compromised browser,
a keylogger, or a malicious extension running in the same origin. A browser wallet has no secure
enclave and no safe input path; for serious amounts use an air-gapped signer. Nothing here is
audited — see *Limitations*.

---

## Architecture

```
src/
  core/
    types.ts             domain model: tiers, rules, reacts, shards, settings
    assets.ts            asset catalogue + formatting
    keys/                BIP-39/32/44 derivation and per-chain address encoding
    crypto/              shamir (GF(256)), keystore (AES-GCM + PBKDF2)
    policy/              tiers, rules, evaluate  ← the policy engine
    automation/engine.ts trigger → gate → execute, with dry run
    security/            phishing screening, posture scoring
    chain/               simulated ledger + pluggable adapters
    sweep/planner.ts     consolidation plans (attestation-gated)
    horcrux/vault.ts     shard sets, heartbeat, inheritance, read-only scans
    swap/aggregator.ts   quote aggregation
  state/                 store.tsx (vault provider), seed.ts (fresh vault)
  components/            Shell, DecisionTrace, SweepRunner
  pages/                 the 13 pages + Landing / Onboarding / Unlock
  styles/app.css         the whole design system
```

**Crypto dependencies** are the audited `@noble` and `@scure` primitives — no hand-rolled curves:

`@noble/hashes` (sha256, ripemd160, keccak_256, pbkdf2) · `@noble/curves` (secp256k1, ed25519) ·
`@scure/base` (base58check, bech32, base58xmr) · `@scure/bip32` · `@scure/bip39`

**Chain data is simulated by default.** The vault ships with a deterministic simulated ledger so the
whole product runs with zero API keys and zero network calls. `Settings → Chain data` can switch an
adapter to live read-only mode; nothing writes to a chain without an adapter that signs.

## Tests

```
npm test      # 87 tests, 6 files
```

| File | Covers |
| --- | --- |
| `core/policy/policy.test.ts` (23) | rule evaluation, tier resolution, override precedence |
| `core/keys/keys.test.ts` (18) | derivation and address encoding per chain |
| `core/crypto/shamir.test.ts` (8) | m-of-n split/combine round trips |
| `state/integration.test.ts` (20) | end-to-end over a real seeded vault: policy, gating, sweep, Horcrux round trip, posture, session sealing |
| `state/duress.test.tsx` (3) | duress envelope isolation: wrong PIN rejected, real vault never overwritten |
| `app.smoke.test.tsx` (15) | every page renders against a real unlocked vault with no console errors |

## Limitations

- **Not audited.** No third-party security review. Do not secure funds you cannot afford to lose.
- **Browser-resident keys.** No hardware enclave; an XSS in this origin is game over.
- **Simulated chain data by default.** Balances and fees are modelled, not broadcast.
- **Passkey support** uses the WebAuthn API and is only exercised on user action; there is no
  server-side attestation service in this build.
- **Horcrux inheritance** is a design, not a legal instrument. Custodians and beneficiaries are
  metadata in your vault; get a real estate lawyer for the real thing.

## Legacy

The original **AI Code Reviewer** app (Groq / Llama 3.3 code review, Monaco editor) is preserved
untouched under `legacy/code-reviewer/`. Nothing in this build depends on it.

---

Built to be read, not trusted. Verify the crypto, run the tests, then decide.
