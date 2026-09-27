import { useCallback, useEffect, useState } from 'react';
import { Shell, NAV } from './components/Shell';
import { ToastHost } from './ui/primitives';
import { useVault } from './state/store';
import { Landing } from './pages/Landing';
import { Onboarding } from './pages/Onboarding';
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
import { Icon } from './ui/icons';

/** Hash routing keeps deep links working without a server-side rewrite. */
function useHashRoute(defaultPage: string): [string, (page: string) => void] {
  const [page, setPage] = useState(() => {
    const hash = window.location.hash.replace(/^#\/?/, '');
    return NAV.some((n) => n.id === hash) ? hash : defaultPage;
  });

  useEffect(() => {
    const onHash = () => {
      const hash = window.location.hash.replace(/^#\/?/, '');
      if (NAV.some((n) => n.id === hash)) setPage(hash);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const navigate = useCallback((next: string) => {
    window.location.hash = `#/${next}`;
    setPage(next);
    window.scrollTo({ top: 0 });
  }, []);

  return [page, navigate];
}

export function App() {
  const { status, duress, state } = useVault();
  const [page, navigate] = useHashRoute('dashboard');
  const [authMode, setAuthMode] = useState<'landing' | 'create' | 'restore'>('landing');

  useEffect(() => {
    document.title = page === 'dashboard' ? 'BLACKVAULT — Dashboard' : `BLACKVAULT — ${NAV.find((n) => n.id === page)?.title ?? 'Vault'}`;
  }, [page]);

  if (status === 'loading') {
    return (
      <div className="lock-screen">
        <div className="center stack sm">
          <Icon name="refresh" size={22} className="pulse muted" />
          <span className="small muted">Opening vault…</span>
        </div>
      </div>
    );
  }

  if (status === 'empty') {
    return (
      <ToastHost>
        {authMode === 'landing' && (
          <Landing onStart={() => setAuthMode('create')} onRestore={() => setAuthMode('restore')} />
        )}
        {authMode !== 'landing' && (
          <Onboarding initialMode={authMode} onBack={() => setAuthMode('landing')} />
        )}
      </ToastHost>
    );
  }

  if (status === 'locked') {
    return (
      <ToastHost>
        <Unlock onStart={() => setAuthMode('create')} onRestore={() => setAuthMode('restore')} />
      </ToastHost>
    );
  }

  // Unlocked. Under duress the shell narrows to what a coerced operator may see.
  const duressAllowed = ['dashboard', 'wallets', 'send', 'receive'];
  const effectivePage = duress && !duressAllowed.includes(page) ? 'dashboard' : page;

  const render = () => {
    switch (effectivePage) {
      case 'wallets': return <Wallets />;
      case 'send': return <Send />;
      case 'receive': return <Receive />;
      case 'swap': return <Swap />;
      case 'policy': return <PolicyStudio />;
      case 'reacts': return <Reacts />;
      case 'sweep': return <Sweep />;
      case 'horcrux': return <Horcrux />;
      case 'recovery': return <Recovery />;
      case 'security': return <Security onNavigate={navigate} />;
      case 'activity': return <Activity />;
      case 'settings': return <Settings />;
      default: return <Dashboard onNavigate={navigate} />;
    }
  };

  return (
    <ToastHost>
      {state && (
        <Shell page={effectivePage} onNavigate={navigate}>
          {render()}
        </Shell>
      )}
    </ToastHost>
  );
}
