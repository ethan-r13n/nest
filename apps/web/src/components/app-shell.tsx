import { Badge } from '@nest/ui/components/badge';
import { Button } from '@nest/ui/components/button';
import { Skeleton } from '@nest/ui/components/skeleton';
import { Link, Outlet } from '@tanstack/react-router';
import { Wallet } from 'lucide-react';
import { toast } from 'sonner';

import lockupUrl from '../../../../design/nest/assets/nest-lockup.svg';
import { useHealth } from '../lib/health.ts';
import { AgentPanel } from './agent-panel.tsx';
import { GuardrailsDrawer } from './guardrails-drawer.tsx';

const ROUTES = [
  { to: '/research', label: 'Research' },
  { to: '/trade', label: 'Trade' },
  { to: '/credit', label: 'Credit' },
  { to: '/earn', label: 'Earn' },
  { to: '/portfolio', label: 'Portfolio' },
] as const;

export function AppShell() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur md:gap-6 md:px-6">
        <Link to="/research" className="shrink-0" aria-label="Nest home">
          <img src={lockupUrl} alt="Nest" className="h-6 w-auto md:h-7" />
        </Link>
        <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
          {ROUTES.map((route) => (
            <Link
              key={route.to}
              to={route.to}
              className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
              activeProps={{ className: 'bg-accent text-foreground' }}
            >
              {route.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <NetworkStatus />
          <GuardrailsDrawer />
          <Button
            aria-label="Connect wallet"
            onClick={() => toast.info("Wallet sign-in isn't available in this build yet.")}
          >
            <Wallet />
            <span className="hidden sm:inline">Connect wallet</span>
          </Button>
          <AgentPanel />
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 pt-6 pb-24 md:px-6 md:pb-6">
        <Outlet />
      </main>
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t bg-background/95 backdrop-blur md:hidden"
      >
        {ROUTES.map((route) => (
          <Link
            key={route.to}
            to={route.to}
            className="flex min-h-14 items-center justify-center text-xs text-muted-foreground"
            activeProps={{ className: 'text-primary' }}
          >
            {route.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

function NetworkStatus() {
  const health = useHealth();
  if (health.isPending) return <Skeleton className="h-6 w-28" />;
  if (health.isError || !health.data.ok) return <Badge variant="destructive">API unavailable</Badge>;
  return (
    <Badge variant="outline" className="font-mono">
      {health.data.network === 'mainnet' ? 'Mainnet' : 'Testnet'}
      {health.data.executionEnabled ? null : <span className="hidden lg:inline"> · execution off</span>}
    </Badge>
  );
}
