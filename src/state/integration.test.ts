import { beforeAll, describe, expect, it } from 'vitest';
import { beginSession, openSecret, sealSecret } from '../core/crypto/keystore';
import { createInitialVault } from './seed';
import { buildWallet } from './seed';
import { validateAddress, generateMnemonic, mnemonicToSeed, deriveAddress } from '../core/keys/derive';
import { getAsset, priceUsdAt } from '../core/assets';
import { effectiveRules, evaluatePolicy } from '../core/policy/evaluate';
import { defaultRulesFor } from '../core/policy/tiers';
import { executeReact, gateReact, reactsMatching } from '../core/automation/engine';
import { planSweep, runSweep } from '../core/sweep/planner';
import { createHorcrux, reconstructSecret, scanKeyMaterial, claimOpensAt } from '../core/horcrux/vault';
import { postureReport } from '../core/security/posture';
import { SimAdapter } from '../core/chain/adapter';
import { cleanVerdict } from '../core/security/phishing';
import { combineShares, decodeShare } from '../core/crypto/shamir';
import type { VaultEvent, VaultState } from '../core/types';

const adapter = new SimAdapter();
let vault: VaultState;

beforeAll(async () => {
  await beginSession('integration-test-passphrase');
  vault = await createInitialVault();
}, 30_000);

describe('vault construction', () => {
  it('builds five wallets across tiers with a decoy', () => {
    expect(vault.wallets).toHaveLength(5);
    expect(vault.wallets.map((w) => w.tier).sort()).toEqual([0, 1, 1, 2, 3]);
    expect(vault.wallets.filter((w) => w.visibility === 'decoy')).toHaveLength(1);
  });

  it('derives addresses that validate for their own asset', () => {
    for (const wallet of vault.wallets) {
      for (const acc of wallet.accounts) {
        const asset = getAsset(acc.assetId);
        if (asset.family === 'sim') {
          expect(acc.address.startsWith('SIM-')).toBe(true);
          continue;
        }
        expect(validateAddress(asset, acc.address).ok, `${asset.symbol} ${acc.address}`).toBe(true);
      }
    }
  });

  it('seals each mnemonic so it is not readable at rest', async () => {
    const wallet = vault.wallets[0];
    expect(wallet.mnemonicEnc).toBeTruthy();
    expect(wallet.mnemonicEnc).not.toContain(' ');
    const mnemonic = await openSecret(wallet.mnemonicEnc!);
    expect(mnemonic.split(' ').length).toBeGreaterThanOrEqual(12);
  });

  it('seeded the demo treasury with balances and history', () => {
    const total = vault.wallets.reduce(
      (n, w) => n + w.accounts.reduce((m, a) => m + (w.balances[a.assetId] ?? 0) * priceUsdAt(getAsset(a.assetId)), 0),
      0,
    );
    expect(total).toBeGreaterThan(0);
    expect(vault.txs.length).toBeGreaterThan(0);
    expect(vault.events.length).toBeGreaterThan(0);
  });
});

describe('policy engine on the real vault', () => {
  it('holds a first-contact payment from the guarded tier', () => {
    const wallet = vault.wallets.find((w) => w.tier === 1)!;
    const decision = evaluatePolicy({
      tier: wallet.tier,
      rules: effectiveRules(vault.policy, wallet.id, wallet.tier),
      asset: getAsset('btc'),
      amount: 0.01,
      amountUsd: 1_200,
      address: 'bc1qnewdestination000000000000000000000000',
      txClass: 'send',
      isNewAddress: true,
      destinationOwnedByVault: false,
      spent24hUsd: 0,
      txCountLastHour: 0,
      now: Date.UTC(2026, 8, 26, 3, 0),
      phishing: cleanVerdict('bc1qnewdestination000000000000000000000000'),
      secureSendVerified: false,
      duressActive: false,
      frozen: false,
    });
    expect(decision.outcome).toBe('delay');
    expect(decision.holdSeconds).toBe(30 * 60);
    expect(decision.requiredSteps).toContain('secureSend');
  });

  it('treats any movement from tier 0 as a quorum ceremony', () => {
    const wallet = vault.wallets.find((w) => w.tier === 0)!;
    const decision = evaluatePolicy({
      tier: wallet.tier,
      rules: effectiveRules(vault.policy, wallet.id, wallet.tier),
      asset: getAsset('btc'),
      amount: 0.1,
      amountUsd: 12_000,
      address: 'bc1qcoldstorage0000000000000000000000000',
      txClass: 'send',
      isNewAddress: true,
      destinationOwnedByVault: false,
      spent24hUsd: 0,
      txCountLastHour: 0,
      now: Date.UTC(2026, 8, 26, 3, 0),
      phishing: cleanVerdict('bc1qcoldstorage0000000000000000000000000'),
      secureSendVerified: true,
      duressActive: false,
      frozen: false,
      shards: { m: 2, n: 3 },
    });
    expect(decision.outcome).toBe('quorum');
    expect(decision.holdSeconds).toBe(48 * 3600);
    expect(decision.requiredSteps).toEqual(expect.arrayContaining(['shards', 'secondDevice']));
  });

  it('blocks unlimited approvals outright', () => {
    const wallet = vault.wallets.find((w) => w.tier === 2)!;
    const decision = evaluatePolicy({
      tier: wallet.tier,
      rules: effectiveRules(vault.policy, wallet.id, wallet.tier),
      asset: getAsset('usdc'),
      amount: 0,
      amountUsd: 0,
      address: '0x1111111111111111111111111111111111111111',
      txClass: 'approve',
      isNewAddress: true,
      destinationOwnedByVault: false,
      spent24hUsd: 0,
      txCountLastHour: 0,
      now: Date.now(),
      phishing: cleanVerdict('0x1111111111111111111111111111111111111111'),
      secureSendVerified: true,
      duressActive: false,
      frozen: false,
      approval: { spender: '0xdeadbeef', unlimited: true, amountUsd: 1_000_000 },
    });
    expect(decision.outcome).toBe('deny');
  });
});

describe('automation gating', () => {
  const event = (overrides: Partial<VaultEvent> = {}): VaultEvent => ({
    id: 'evt_test',
    kind: 'dormant_breach',
    at: Date.now(),
    severity: 'info',
    title: 'Owned source crossed the dormancy threshold',
    detail: 'test',
    walletId: vault.wallets.find((w) => w.tier === 3)!.id,
    ...overrides,
  });

  const aggressive = () => vault.reacts.find((r) => r.id === 'dormant-reclaim')!;

  it('refuses an aggressive react when consolidation is disabled in policy', () => {
    const walletId = vault.wallets.find((w) => w.tier === 3)!.id;
    const disabled: VaultState = {
      ...vault,
      policy: {
        ...vault.policy,
        overrides: {
          [walletId]: [{ id: 'autoSweep', enabled: false, params: { thresholdUsd: 0, minIdleDays: 0, destinationWalletId: '' } }],
        },
      },
    };
    const react = { ...aggressive(), enabled: true };
    const gate = gateReact(disabled, react, event({ payload: { attested: true, sources: [{ attested: true }] } }));
    expect(gate.ok).toBe(false);
    expect(gate.reason).toMatch(/consolidation sweep is disabled/);
  });

  it('refuses an aggressive react that supplies no attested sources at all', () => {
    const react = { ...aggressive(), enabled: true };
    const gate = gateReact(vault, react, event({ payload: { attested: true, sources: [] } }));
    expect(gate.ok).toBe(false);
    expect(gate.reason).toMatch(/attestation|sources/);
  });

  it('refuses an aggressive react without an ownership attestation', () => {
    const react = { ...aggressive(), enabled: true };
    const withSweep = {
      ...vault,
      policy: {
        ...vault.policy,
        rules: defaultRulesFor(3).map((r) => (r.id === 'autoSweep' ? { ...r, enabled: true } : r)),
      },
    };
    const gate = gateReact(withSweep, react, event());
    expect(gate.ok).toBe(false);
    expect(gate.reason).toMatch(/attestation/);
  });

  it('allows an aggressive react for attested sources on a tier 3 wallet, and queues a sweep', () => {
    const wallet = vault.wallets.find((w) => w.tier === 3)!;
    const enabled: VaultState = {
      ...vault,
      policy: {
        ...vault.policy,
        rules: defaultRulesFor(3).map((r) =>
          r.id === 'autoSweep'
            ? { ...r, enabled: true, params: { ...r.params, destinationWalletId: vault.wallets[0].id } }
            : r,
        ),
      },
    };
    const react = { ...aggressive(), enabled: true };
    const sources = wallet.accounts.slice(0, 1).map((a) => ({
      id: a.id,
      label: `${wallet.label} · ${getAsset(a.assetId).symbol}`,
      assetId: a.assetId,
      address: a.address,
      amount: wallet.balances[a.assetId] ?? 0,
      amountUsd: (wallet.balances[a.assetId] ?? 0) * priceUsdAt(getAsset(a.assetId)),
      idleDays: 400,
      attested: true,
    }));
    const evt = event({ payload: { attested: true, sources } });
    expect(gateReact(enabled, react, evt).ok).toBe(true);

    const outcome = executeReact(enabled, react, evt);
    expect(outcome.run.outcome).toBe('executed');
    expect(outcome.patches.sweepRequests).toHaveLength(1);
    expect(outcome.patches.sweepRequests![0].sources.every((s) => s.attested)).toBe(true);
    expect(outcome.patches.sweepRequests![0].destinationWalletId).toBe(vault.wallets[0].id);
  });

  it('executes defensive reacts for poisoning events without moving funds', () => {
    const phantom = vault.reacts.find((r) => r.id === 'phantom-lock')!;
    const evt = event({
      kind: 'phishing_detected',
      severity: 'critical',
      title: 'Poisoned lookalike',
      payload: { address: 'bc1qevil000000000000000000000000000000' },
    });
    const matches = reactsMatching(vault, evt);
    expect(matches.map((r) => r.id)).toContain('phantom-lock');
    const outcome = executeReact(vault, phantom, evt);
    expect(outcome.patches.denylistAddresses).toEqual(['bc1qevil000000000000000000000000000000']);
    expect(outcome.patches.sweepRequests).toBeUndefined();
  });
});

describe('consolidation sweep', () => {
  it('plans and executes a sweep between wallets the vault owns', async () => {
    const source = vault.wallets.find((w) => w.tier === 3)!;
    const destination = vault.wallets.find((w) => w.tier === 0)!;
    const account = source.accounts.find((a) => (source.balances[a.assetId] ?? 0) > 0)!;

    const plan = planSweep({
      sources: [
        {
          id: account.id,
          label: `${source.label} · ${getAsset(account.assetId).symbol}`,
          assetId: account.assetId,
          address: account.address,
          amount: source.balances[account.assetId] ?? 0,
          idleDays: 400,
          attested: true,
        },
      ],
      destination,
      destinationAddresses: Object.fromEntries(destination.accounts.map((a) => [a.assetId, a.address])),
      privacyMode: 'staggered',
      feePreset: 'priority',
      tier: destination.tier,
      rules: effectiveRules(vault.policy, destination.id, destination.tier),
      shards: { m: 2, n: 3 },
    });

    expect(plan.legs.length + plan.skipped.length).toBe(1);
    if (plan.legs.length === 0) {
      // Balance was below the fee on this seeded account — that is a valid outcome.
      expect(plan.skipped[0].reason).toMatch(/fee/);
      return;
    }
    expect(plan.totalUsd).toBeGreaterThan(0);
    const progress: string[] = [];
    const result = await runSweep(plan, (p) => progress.push(p.status), 0);
    expect(result.txIds.length).toBe(plan.legs.length);
    expect(progress).toContain('confirmed');
  }, 20_000);

  it('refuses to plan an unattested source', () => {
    const destination = vault.wallets[0];
    const plan = planSweep({
      sources: [
        { id: 'x', label: 'someone else', assetId: 'btc', address: 'bc1qsomeoneelse00000000000000000000000', amount: 5, idleDays: 900, attested: false },
      ],
      destination,
      destinationAddresses: Object.fromEntries(destination.accounts.map((a) => [a.assetId, a.address])),
      privacyMode: 'direct',
      feePreset: 'normal',
      tier: destination.tier,
      rules: effectiveRules(vault.policy, destination.id, destination.tier),
    });
    expect(plan.legs).toHaveLength(0);
    expect(plan.blockedByAttestation).toEqual(['x']);
    expect(plan.skipped[0].reason).toMatch(/attestation/);
  });
});

describe('Horcrux round trip', () => {
  it('shards a real wallet mnemonic and reconstructs it exactly', async () => {
    const wallet = vault.wallets[1];
    const mnemonic = await openSecret(wallet.mnemonicEnc!);
    const horcrux = createHorcrux({
      label: 'Continuity',
      purpose: 'inheritance',
      secret: new TextEncoder().encode(mnemonic),
      m: 2,
      n: 3,
      custodians: [
        { name: 'Ana', location: 'Home safe' },
        { name: 'Bo', location: 'Bank box' },
        { name: 'Cai', location: 'Solicitor' },
      ],
      timelockDays: 180,
      beneficiaries: [{ name: 'Ana', sharePct: 100, contact: 'ana@example.invalid' }],
    });

    expect(horcrux.shards).toHaveLength(3);
    expect(horcrux.shards[0].hex).not.toContain(mnemonic.slice(0, 8));

    const rebuilt = new TextDecoder().decode(
      combineShares([decodeShare(horcrux.shards[0].hex), decodeShare(horcrux.shards[2].hex)]),
    );
    expect(rebuilt).toBe(mnemonic);

    const viaHelper = new TextDecoder().decode(
      reconstructSecret([horcrux.shards[1].hex, horcrux.shards[2].hex]),
    );
    expect(viaHelper).toBe(mnemonic);

    // The reconstructed phrase must derive the same addresses as the original.
    const asset = getAsset('btc');
    const original = deriveAddress(asset, mnemonicToSeed(mnemonic), 0).address;
    const restored = deriveAddress(asset, mnemonicToSeed(rebuilt), 0).address;
    expect(restored).toBe(original);

    expect(claimOpensAt(horcrux)).toBeGreaterThan(Date.now());
  });

  it('scanning operator-held key material reports derived accounts and never invents addresses', async () => {
    const mnemonic = generateMnemonic(128);
    const result = await scanKeyMaterial(mnemonic, ['btc', 'eth', 'zano'], async (asset, address) => {
      const bal = await adapter.getBalance(asset, address);
      return { amount: bal.amount, amountUsd: bal.amountUsd };
    });
    expect(result.invalidMnemonic).toBe(false);
    expect(result.scanned).toBe(9);
    for (const finding of result.findings) {
      if (getAsset(finding.assetId).family === 'sim') {
        expect(finding.derivable).toBe(false);
        expect(finding.address.startsWith('SIM-')).toBe(true);
      } else {
        expect(validateAddress(getAsset(finding.assetId), finding.address).ok).toBe(true);
      }
    }
  });

  it('rejects a malformed phrase instead of guessing', async () => {
    const result = await scanKeyMaterial('not a real phrase at all', ['btc'], async () => ({ amount: 0, amountUsd: 0 }));
    expect(result.invalidMnemonic).toBe(true);
    expect(result.findings).toHaveLength(0);
  });
});

describe('posture scoring', () => {
  it('scores a fresh vault below par and improves with shards, duress and decoys', () => {
    const before = postureReport(vault);
    expect(before.checks.find((c) => c.id === 'backup')!.status).toBe('fail');
    expect(before.checks.find((c) => c.id === 'telemetry')!.status).toBe('pass');

    const hardened: VaultState = {
      ...vault,
      settings: { ...vault.settings, duressPin: '1234', autoLockMinutes: 5 },
      horcruxes: [
        createHorcrux({
          label: 'Continuity',
          purpose: 'inheritance',
          secret: new TextEncoder().encode('test'),
          m: 2,
          n: 3,
          custodians: [{ name: 'A', location: 'x' }, { name: 'B', location: 'y' }, { name: 'C', location: 'z' }],
          timelockDays: 90,
        }),
      ],
    };
    const after = postureReport(hardened);
    expect(after.score).toBeGreaterThan(before.score);
    expect(after.checks.find((c) => c.id === 'backup')!.status).toBe('pass');
    expect(after.checks.find((c) => c.id === 'duress')!.status).toBe('pass');
  });
});

describe('session sealing', () => {
  it('seals and opens arbitrary secrets with the session key', async () => {
    const sealed = await sealSecret('correct horse battery staple');
    expect(sealed).not.toContain('correct');
    expect(await openSecret(sealed)).toBe('correct horse battery staple');
  });

  it('builds a wallet from an explicit mnemonic and derives the matching addresses', async () => {
    const mnemonic = generateMnemonic(256);
    const wallet = await buildWallet({ label: 'Restored', tier: 2, assetIds: ['btc', 'eth'], mnemonic }, 9);
    const seed = mnemonicToSeed(mnemonic);
    expect(wallet.accounts[0].address).toBe(deriveAddress(getAsset('btc'), seed, 0).address);
    expect(wallet.accounts[1].address).toBe(deriveAddress(getAsset('eth'), seed, 0).address);
  });
});
