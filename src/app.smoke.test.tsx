// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { VaultProvider, useVault } from './state/store';
import { Shell } from './components/Shell';
import { Landing } from './pages/Landing';
import { Unlock } from './pages/Unlock';
import { Dashboard } from './pages/Dashboard';
import { Wallets } from './pages/Wallets';
import { Send } from './pages/Send';
import { Receive } from './pages/Receive';
import { Swap } from './pages/Swap';
import { PolicyStudio } from './pages/PolicyStudio';
import { Reacts } from './pages/Reacts';
import { Sweep } from './pages/Sweep';
import { Horcrux } from './pages/Horcrux';
import { Recovery } from './pages/Recovery';
import { Security } from './pages/Security';
import { Activity } from './pages/Activity';
import { Settings } from './pages/Settings';

const act = (React as unknown as { act: (cb: () => Promise<void> | void) => Promise<void> }).act;

/**
 * Renders every page against a real (simulated) unlocked vault.
 *
 * This is not a UI test — it is a smoke test that catches the failures you only
 * see at runtime: a page throwing on undefined state, a hook order mistake, a
 * component that assumes a wallet exists.
 */

let container: HTMLDivElement;
let root: Root;
let consoleErrors: string[] = [];

beforeAll(() => {
  // jsdom ships a partial crypto; the vault needs real WebCrypto for AES-GCM.
  if (!globalThis.crypto?.subtle) {
    throw new Error('WebCrypto with SubtleCrypto is required to render the vault');
  }
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  localStorage.clear();
  window.location.hash = '';
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  consoleErrors = [];
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    consoleErrors.push(args.map(String).join(' '));
  });
  vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
    const msg = args.map(String).join(' ');
    if (/not wrapped in act|ReactDOMTestUtils/.test(msg)) return;
    consoleErrors.push(msg);
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

/* eslint-disable @typescript-eslint/no-explicit-any */
const PAGES: Record<string, React.ComponentType<any>> = {
  dashboard: Dashboard,
  wallets: Wallets,
  send: Send,
  receive: Receive,
  swap: Swap,
  policy: PolicyStudio,
  reacts: Reacts,
  sweep: Sweep,
  horcrux: Horcrux,
  recovery: Recovery,
  security: Security,
  activity: Activity,
  settings: Settings,
};

/** Creates the vault once, then swaps the page inside the same tree. */
function Harness({ page }: { page: string }) {
  const vault = useVault();
  React.useEffect(() => {
    if (vault.status === 'empty') void vault.createVault('smoke-test-passphrase');
  }, [vault.status, vault]);
  const Page = PAGES[page];
  if (vault.status !== 'unlocked' || !vault.state) {
    return <div data-testid="booting">opening vault</div>;
  }
  return (
    <Shell page={page} onNavigate={() => {}}>
      <Page onNavigate={() => {}} />
    </Shell>
  );
}

async function renderApp(page: string) {
  await act(async () => {
    root.render(
      React.createElement(VaultProvider, null, React.createElement(Harness, { page })),
    );
  });
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
  }
}

const PAGE_IDS = Object.keys(PAGES);

describe('app smoke: every page renders against a real vault', () => {
  for (const page of PAGE_IDS) {
    it(`renders ${page}`, async () => {
      await renderApp(page);
      const text = container.textContent ?? '';
      expect(text.length, `${page} rendered almost nothing`).toBeGreaterThan(120);
      expect(container.querySelector('[data-testid="booting"]'), `${page} never unlocked`).toBeNull();
      const realErrors = consoleErrors.filter(
      (e) => !/act\(\.\.\.\)|not wrapped in act|ReactDOMTestUtils/.test(e),
    );
      expect(realErrors, `${page} logged: ${realErrors.join(' | ')}`).toEqual([]);
    }, 20_000);
  }

  it('shows the marketing landing page before a vault exists', async () => {
    await act(async () => {
      root.render(React.createElement(Landing, { onStart: () => {}, onRestore: () => {} }));
    });
    const text = container.textContent ?? '';
    expect(text).toContain('unconditionally yours');
    expect(text).toContain('Scope, stated plainly');
  });

  it('renders the unlock screen', async () => {
    await act(async () => {
      root.render(
        React.createElement(
          VaultProvider,
          null,
          React.createElement(Unlock, { onStart: () => {}, onRestore: () => {} }),
        ),
      );
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(container.textContent).toContain('Vault locked');
  });
});
