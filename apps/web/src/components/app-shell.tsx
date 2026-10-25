import { Badge } from '@nest/ui/components/badge';
import { Button } from '@nest/ui/components/button';
import {
  type PanelImperativeHandle,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@nest/ui/components/resizable';
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@nest/ui/components/sheet';
import { Skeleton } from '@nest/ui/components/skeleton';
import { Link, Outlet, useLocation } from '@tanstack/react-router';
import { Bell, Menu, Wallet } from 'lucide-react';
import { Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';

import lockupUrl from '../../../../design/nest/assets/nest-lockup.svg';
import { useHealth } from '../lib/health.ts';
import { shortAddress, useWallet, WalletProvider } from '../lib/wallet.tsx';
import { AdjacentAssistant, AgentPanel } from './agent-panel.tsx';
import { GuardrailsDrawer } from './guardrails-drawer.tsx';
import { useWorkspaceSession, WorkspaceSessionProvider } from './workspace-session.tsx';

const ROUTES = [
  { to: '/chat', label: 'Chat' },
  { to: '/research', label: 'Research' },
  { to: '/vaults', label: 'Vaults' },
  { to: '/credit', label: 'Credit' },
  { to: '/trade', label: 'Trade' },
  { to: '/lab/memory', label: 'Lab' },
  { to: '/portfolio', label: 'Portfolio' },
] as const;

export function AppShell() {
  return (
    <WalletProvider>
      <WorkspaceSessionProvider>
        <WorkspaceShell />
      </WorkspaceSessionProvider>
    </WalletProvider>
  );
}

function WorkspaceShell() {
  const { assistantOpen } = useWorkspaceSession();
  const [desktop, setDesktop] = useState(() => window.matchMedia('(min-width: 1200px)').matches);
  const [assistantWidth, setAssistantWidth] = useState(380);
  const assistantRef = useRef<PanelImperativeHandle | null>(null);
  const workspaceScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 1200px)');
    function updateDesktop() {
      setDesktop(media.matches);
    }
    media.addEventListener('change', updateDesktop);
    return () => media.removeEventListener('change', updateDesktop);
  }, []);
  const pathname = useLocation({ select: (location) => location.pathname });
  useLayoutEffect(() => {
    workspaceScrollRef.current?.scrollTo(0, 0);
  }, [pathname]);
  return (
    <div className="flex h-svh min-w-0 flex-col overflow-hidden">
      <a
        href="#workspace"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-background focus:p-3"
      >
        Skip to workspace
      </a>
      <header className="sticky top-0 z-40 flex h-16 min-w-0 shrink-0 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur sm:gap-3 sm:px-5 xl:gap-5">
        <Link to="/research" className="shrink-0" aria-label="Nest home">
          <img src={lockupUrl} alt="Nest" className="h-6 w-auto sm:h-7" />
        </Link>
        <nav aria-label="Primary" className="hidden items-center gap-1 xl:flex">
          {ROUTES.map((route) => (
            <Link
              key={route.to}
              to={route.to}
              className={`rounded-lg px-3 py-2 text-sm transition-colors ${isActiveGroup(pathname, route.to) ? 'bg-accent text-primary' : 'text-muted-foreground hover:text-foreground'}`}
              aria-current={isActiveGroup(pathname, route.to) ? 'page' : undefined}
            >
              {route.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
          <div className="hidden lg:block">
            <NetworkStatus />
          </div>
          <Link
            to="/alerts"
            className="hidden rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground sm:flex"
            aria-label="Alerts"
          >
            <Bell className="size-4" />
          </Link>
          <GuardrailsDrawer />
          <WalletButton />
          <AgentPanel desktop={desktop} />
          <Sheet>
            <SheetTrigger
              render={<Button variant="ghost" size="icon" aria-label="Open navigation" className="xl:hidden" />}
            >
              <Menu />
            </SheetTrigger>
            <SheetContent side="left" className="w-full sm:max-w-80">
              <SheetHeader>
                <SheetTitle>Workspace</SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-1 px-4" aria-label="Workspace navigation">
                {ROUTES.map((route) => (
                  <SheetClose
                    nativeButton={false}
                    key={route.to}
                    render={<Link to={route.to} className="rounded-lg px-3 py-3 text-sm hover:bg-accent" />}
                  >
                    {route.label}
                  </SheetClose>
                ))}
                <SheetClose
                  nativeButton={false}
                  render={<Link to="/alerts" className="rounded-lg px-3 py-3 text-sm hover:bg-accent" />}
                >
                  Alerts
                </SheetClose>
                <SheetClose
                  nativeButton={false}
                  render={<Link to="/settings/connections" className="rounded-lg px-3 py-3 text-sm hover:bg-accent" />}
                >
                  Connections
                </SheetClose>
              </nav>
              <div className="px-7 pt-4">
                <NetworkStatus />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>
      <ResizablePanelGroup
        orientation="horizontal"
        className="min-h-0 flex-1"
        style={{ height: 'calc(100svh - 4rem)' }}
      >
        <ResizablePanel id="workspace-panel" minSize={desktop && assistantOpen ? 600 : 0}>
          <div id="workspace-scroll" ref={workspaceScrollRef} className="relative h-full overflow-y-auto">
            <WorkspaceContent />
          </div>
        </ResizablePanel>
        {desktop && assistantOpen ? (
          <>
            <ResizableHandle
              withHandle
              aria-label="Resize assistant"
              aria-valuetext={`${Math.round(assistantWidth)} pixels`}
              onDoubleClick={() => assistantRef.current?.resize(380)}
            />
            <ResizablePanel
              id="assistant-panel"
              panelRef={assistantRef}
              defaultSize={assistantWidth}
              minSize={320}
              maxSize={560}
              groupResizeBehavior="preserve-pixel-size"
              onResize={(size) => setAssistantWidth(size.inPixels)}
            >
              <AdjacentAssistant />
            </ResizablePanel>
          </>
        ) : null}
      </ResizablePanelGroup>
      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-7 border-t bg-background/95 backdrop-blur xl:hidden"
      >
        {ROUTES.map((route) => (
          <Link
            key={route.to}
            to={route.to}
            className={`flex min-h-14 min-w-0 items-center justify-center text-[11px] sm:text-xs ${isActiveGroup(pathname, route.to) ? 'text-primary' : 'text-muted-foreground'}`}
            aria-current={isActiveGroup(pathname, route.to) ? 'page' : undefined}
          >
            {route.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

function WorkspaceContent() {
  const chatPage = useLocation({ select: (location) => location.pathname === '/chat' });
  return (
    <main
      id="workspace"
      className={`mx-auto w-full min-w-0 max-w-[1440px] px-4 pt-5 sm:px-6 sm:pt-6 ${chatPage ? 'flex h-full flex-col overflow-hidden pb-20 xl:pb-6' : 'flex-1 pb-24 xl:pb-8'}`}
    >
      <Suspense
        fallback={
          <div role="status" className="flex min-h-48 items-center justify-center text-sm text-muted-foreground">
            Loading workspace…
          </div>
        }
      >
        <Outlet />
      </Suspense>
    </main>
  );
}

function NetworkStatus() {
  const health = useHealth();
  if (health.isPending) return <Skeleton className="h-6 w-24" />;
  if (health.isError || !health.data.ok) return <Badge variant="outline">Connection unavailable</Badge>;
  return (
    <Badge variant="outline" className="font-mono">
      {health.data.network === 'mainnet' ? 'Mainnet' : 'Testnet'}
      {health.data.executionEnabled ? null : ' · execution off'}
    </Badge>
  );
}

function isActiveGroup(pathname: string, route: string) {
  if (route === '/research')
    return ['/research', '/protocols', '/assets', '/venues', '/markets'].some((prefix) => pathname.startsWith(prefix));
  if (route === '/lab/memory') return pathname.startsWith('/lab');
  if (route === '/portfolio') return pathname.startsWith('/portfolio') || pathname.startsWith('/plans');
  return pathname.startsWith(route);
}

function WalletButton() {
  const { address } = useWallet();
  return (
    <Button
      nativeButton={false}
      variant={address ? 'outline' : 'default'}
      render={<Link to="/wallet" />}
      aria-label={address ? `Wallet ${shortAddress(address)}` : 'Connect wallet'}
    >
      <Wallet />
      <span className="hidden font-mono sm:inline">{address ? shortAddress(address) : 'Connect wallet'}</span>
    </Button>
  );
}
