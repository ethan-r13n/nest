import { Badge } from '@nest/ui/components/badge';
import { Button } from '@nest/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@nest/ui/components/dropdown-menu';
import {
  type PanelImperativeHandle,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@nest/ui/components/resizable';
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@nest/ui/components/sheet';
import { Skeleton } from '@nest/ui/components/skeleton';
import { Link, Outlet, useLocation } from '@tanstack/react-router';
import { Bell, Check, ChevronDown, LoaderCircle, Menu, Wallet } from 'lucide-react';
import { type ReactNode, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';

import './workspace-design.css';

import symbolUrl from '../../../../design/nest/assets/nest-symbol.svg';
import { useHealth } from '../lib/health.ts';
import { shortAddress, useWallet, WalletProvider } from '../lib/wallet.tsx';
import { AdjacentAssistant, AgentPanel } from './agent-panel.tsx';
import { GuardrailsDrawer } from './guardrails-drawer.tsx';
import { useWorkspaceSession, WorkspaceSessionProvider } from './workspace-session.tsx';

const ROUTES = [
  { to: '/chat', label: 'Chat' },
  { to: '/research', label: 'Research' },
  { to: '/earn', label: 'Earn' },
  { to: '/credit', label: 'Credit' },
  { to: '/trade', label: 'Trade' },
  { to: '/lab/backtests', label: 'Lab' },
  { to: '/portfolio', label: 'Portfolio' },
] as const;

/** The workspace frame. Route pages render in its outlet; error and not-found pages pass `children`. */
export function AppShell({ children }: { children?: ReactNode }) {
  return (
    <WalletProvider>
      <WorkspaceSessionProvider>
        <WorkspaceShell>{children}</WorkspaceShell>
      </WorkspaceSessionProvider>
    </WalletProvider>
  );
}

function WorkspaceShell({ children }: { children: ReactNode }) {
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
    <div className="nest-workspace flex h-svh min-w-0 flex-col overflow-hidden">
      <a
        href="#workspace"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-background focus:p-3"
      >
        Skip to workspace
      </a>
      <header className="sticky top-0 z-40 flex h-16 min-w-0 shrink-0 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur sm:gap-3 sm:px-5 xl:gap-5">
        <Link to="/research" className="flex shrink-0 items-center gap-2.5" aria-label="Nest home">
          <img src={symbolUrl} alt="" className="w-8 sm:w-9" />
          <span className="font-serif text-[30px] font-semibold leading-none tracking-tight">Nest</span>
        </Link>
        <nav aria-label="Primary" className="hidden h-full items-center gap-6 xl:flex">
          {ROUTES.map((route) => (
            <Link
              key={route.to}
              to={route.to}
              className="workspace-primary-link transition-colors hover:text-foreground"
              aria-current={isActiveGroup(pathname, route.to) ? 'page' : undefined}
            >
              {route.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2 [&_button]:h-11! [&_button]:min-w-11!">
          <div className="hidden lg:block">
            <NetworkStatus />
          </div>
          <Link
            to="/alerts"
            className="hidden size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground sm:flex"
            aria-label="Alerts"
          >
            <Bell className="size-4" />
          </Link>
          <GuardrailsDrawer />
          <WalletButton />
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
            <WorkspaceContent>{children}</WorkspaceContent>
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
      {pathname !== '/chat' && !assistantOpen ? (
        <div className="fixed right-4 bottom-20 z-40 xl:right-7 xl:bottom-6">
          <AgentPanel desktop={desktop} />
        </div>
      ) : null}
      {!desktop && assistantOpen ? <AgentPanel desktop={false} /> : null}
    </div>
  );
}

function WorkspaceContent({ children }: { children: ReactNode }) {
  const chatPage = useLocation({ select: (location) => location.pathname === '/chat' });
  return (
    <main
      id="workspace"
      className={`mx-auto w-full min-w-0 max-w-[1920px] px-4 pt-5 sm:px-6 sm:pt-6 lg:px-7 lg:pt-7 ${chatPage ? 'flex h-full flex-col overflow-hidden pb-20 xl:pb-6' : 'flex-1 pb-24 xl:pb-8'}`}
    >
      <Suspense
        fallback={
          <div role="status" className="flex min-h-48 items-center justify-center text-sm text-muted-foreground">
            Loading workspace…
          </div>
        }
      >
        {children ?? <Outlet />}
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
  if (route === '/earn') return pathname.startsWith('/earn') || pathname.startsWith('/vaults');
  if (route === '/lab/memory') return pathname.startsWith('/lab');
  if (route === '/portfolio') return pathname.startsWith('/portfolio') || pathname.startsWith('/plans');
  return pathname.startsWith(route);
}

function WalletButton() {
  const { address, connecting, connect, disconnect, error } = useWallet();
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

  async function copyAddress() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('failed');
    }
  }

  return (
    <div className="relative">
      {address ? (
        <DropdownMenu
          onOpenChange={(open) => {
            if (open) setCopyStatus('idle');
          }}
        >
          <DropdownMenuTrigger
            render={
              <Button
                variant="outline"
                disabled={connecting}
                aria-label={`Manage wallet ${shortAddress(address)}`}
                title={address}
              />
            }
          >
            <Wallet className="sm:hidden" />
            <span className="hidden font-mono sm:inline">{shortAddress(address)}</span>
            <ChevronDown className="hidden size-3 sm:block" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            sideOffset={8}
            aria-label="Wallet account"
            className="w-52 rounded-xl border p-1.5"
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="px-3 pt-2 pb-1.5 font-normal">
                Account
                <span className="mt-1 block font-mono text-[11px] sm:hidden">{shortAddress(address)}</span>
              </DropdownMenuLabel>
              <DropdownMenuItem closeOnClick={false} onClick={copyAddress} className="min-h-11 px-3 py-2 font-normal">
                {copyStatus === 'copied' ? 'Address copied' : 'Copy address'}
                {copyStatus === 'copied' ? <Check className="ml-auto size-4 text-success" aria-hidden="true" /> : null}
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={disconnect} className="min-h-11 px-3 py-2 font-normal">
              Disconnect
            </DropdownMenuItem>
            {copyStatus === 'failed' ? (
              <p role="alert" className="px-3 py-2 text-xs leading-relaxed text-destructive">
                Couldn’t copy the address. Please try again.
              </p>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <Button
          onClick={connect}
          disabled={connecting}
          aria-label={connecting ? 'Connecting wallet' : 'Connect wallet'}
          aria-haspopup="dialog"
        >
          {connecting ? <LoaderCircle className="animate-spin motion-reduce:animate-none" /> : <Wallet />}
          <span className="hidden sm:inline">{connecting ? 'Connecting…' : 'Connect wallet'}</span>
        </Button>
      )}
      {error ? (
        <p
          role="alert"
          className="absolute top-full right-0 z-50 mt-3 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-destructive/30 bg-popover p-3 text-xs leading-relaxed text-destructive shadow-lg"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
