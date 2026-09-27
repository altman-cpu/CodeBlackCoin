// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { VaultProvider, useVault, type VaultContextValue } from './store';
import { decryptJson } from '../core/crypto/keystore';

const act = (React as unknown as { act: (cb: () => Promise<void> | void) => Promise<void> }).act;

/**
 * The duress path is security-critical and easy to get wrong, so it is tested
 * as a property: entering the duress PIN must never decrypt, disclose or
 * overwrite the real vault.
 */

let container: HTMLDivElement;
let root: Root;
let api: VaultContextValue | null = null;

function Probe() {
  const vault = useVault();
  api = vault;
  React.useEffect(() => {
    if (vault.status === 'empty') void vault.createVault('duress-test-passphrase');
  }, [vault]);
  return (
    <div>
      {vault.status}:{vault.state?.wallets.length ?? 0}
    </div>
  );
}

const settle = async (rounds = 5) => {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
  }
};

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  localStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  api = null;
});

describe('duress vault', () => {
  it('opens a decoy-only vault with the duress PIN and leaves the real one sealed', async () => {
    await act(async () => {
      root.render(
        React.createElement(VaultProvider, null, React.createElement(Probe)),
      );
    });
    await settle();

    const realWallets = api!.state!.wallets.length;
    expect(realWallets).toBe(5);

    await act(async () => {
      api!.updateSettings({ duressPin: '9911' });
    });
    await settle(25);

    const duressEnvelope = localStorage.getItem('blackvault.v1.duress');
    expect(duressEnvelope, 'duress envelope was not written').toBeTruthy();

    // Lock, then open with the duress PIN.
    await act(async () => {
      api!.lock();
    });
    expect(api!.status).toBe('locked');

    let ok = false;
    await act(async () => {
      ok = await api!.unlockDuress('9911');
    });
    expect(ok).toBe(true);
    await settle(3);

    // Only decoys are visible, and the vault knows it is in duress.
    expect(api!.duress).toBe(true);
    expect(api!.state!.wallets.length).toBeLessThan(realWallets);
    expect(api!.state!.wallets.every((w: { visibility: string }) => w.visibility === 'decoy')).toBe(true);

    // Give the (disabled) persistence path time to misbehave if it is going to:
    // a duress session must never overwrite the real envelope with decoy data.
    await settle(20);
    const real = await decryptJson<{ wallets: unknown[] }>(
      JSON.parse(localStorage.getItem('blackvault.v1.envelope')!),
      'duress-test-passphrase',
    );
    expect(real.wallets, 'real vault was overwritten by the duress session').toHaveLength(realWallets);
  }, 40_000);

  it('rejects a wrong duress PIN', async () => {
    await act(async () => {
      root.render(
        React.createElement(VaultProvider, null, React.createElement(Probe)),
      );
    });
    await settle();
    await act(async () => {
      api!.updateSettings({ duressPin: '4242' });
    });
    await settle(25);
    await act(async () => {
      api!.lock();
    });

    let ok = true;
    await act(async () => {
      ok = await api!.unlockDuress('0000');
    });
    expect(ok).toBe(false);
    expect(api!.status).toBe('locked');
  }, 40_000);

  it('rejects the duress PIN as the real passphrase', async () => {
    await act(async () => {
      root.render(
        React.createElement(VaultProvider, null, React.createElement(Probe)),
      );
    });
    await settle();
    await act(async () => {
      api!.updateSettings({ duressPin: '5150' });
    });
    await settle(25);
    await act(async () => {
      api!.lock();
    });

    await act(async () => {
      await api!.unlock('5150').catch(() => undefined);
    });
    expect(api!.status).toBe('locked');

    await act(async () => {
      await api!.unlock('duress-test-passphrase');
    });
    expect(api!.status).toBe('unlocked');
    expect(api!.state!.wallets).toHaveLength(5);
  }, 40_000);
});
