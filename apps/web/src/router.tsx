import { Button } from '@nest/ui/components/button';
import { Card } from '@nest/ui/components/card';
import {
  createRootRoute,
  createRoute,
  createRouter,
  type ErrorComponentProps,
  Link,
  Outlet,
  redirect,
} from '@tanstack/react-router';
import { lazy } from 'react';

import { AppShell } from './components/app-shell.tsx';
import { EmptyState } from './components/workspace.tsx';

// The landing page renders on its own; every other page sits inside the workspace shell.
const rootRoute = createRootRoute({
  component: Outlet,
  errorComponent: (props) => (
    <AppShell>
      <PageError {...props} />
    </AppShell>
  ),
  notFoundComponent: () => (
    <AppShell>
      <PageNotFound />
    </AppShell>
  ),
});
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/research' });
  },
});
const workspaceRoute = createRoute({ getParentRoute: () => rootRoute, id: 'workspace', component: AppShell });
const ChatPage = lazy(() => import('./routes/chat.tsx').then((module) => ({ default: module.ChatPage })));
const chatRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/chat',
  // `ask` arrives from the landing page and pre-fills the composer; it is never sent automatically.
  validateSearch: (search: Record<string, unknown>): { ask?: string } =>
    typeof search.ask === 'string' && search.ask.trim() ? { ask: search.ask.slice(0, 4000) } : {},
  component: ChatView,
});
const researchRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/research',
  component: lazy(() => import('./routes/research.tsx').then((module) => ({ default: module.ResearchPage }))),
});
const rwasRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/research/rwas',
  component: lazy(() => import('./routes/research.tsx').then((module) => ({ default: module.RwaPage }))),
});
const marketsRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/research/markets',
  component: lazy(() => import('./routes/research.tsx').then((module) => ({ default: module.MarketsPage }))),
});
const venuesRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/research/venues',
  component: lazy(() => import('./routes/research.tsx').then((module) => ({ default: module.VenuesPage }))),
});
const savedRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/research/saved',
  component: lazy(() => import('./routes/research.tsx').then((module) => ({ default: module.SavedResearchPage }))),
});

const ProtocolPage = lazy(() =>
  import('./routes/research.tsx').then((module) => ({ default: module.ProtocolDetailPage })),
);
const protocolRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/protocols/$protocolId',
  component: ProtocolView,
});

const AssetPage = lazy(() => import('./routes/research.tsx').then((module) => ({ default: module.RwaDetailPage })));
const assetRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/assets/$assetId',
  component: AssetView,
});

const VenuePage = lazy(() => import('./routes/research.tsx').then((module) => ({ default: module.VenueDetailPage })));
const venueRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/venues/$venueId',
  component: VenueView,
});

const MarketPage = lazy(() => import('./routes/research.tsx').then((module) => ({ default: module.MarketDetailPage })));
const marketRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/markets/$marketId',
  component: MarketView,
});
const tradeRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/trade',
  component: lazy(() => import('./routes/trade.tsx').then((module) => ({ default: module.TradePage }))),
});
const creditRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/credit',
  component: lazy(() => import('./routes/credit.tsx').then((module) => ({ default: module.CreditPage }))),
});
const supplyRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/credit/supply',
  component: lazy(() => import('./routes/credit.tsx').then((module) => ({ default: module.SupplyPage }))),
});
const positionsRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/credit/positions',
  component: lazy(() => import('./routes/credit.tsx').then((module) => ({ default: module.PositionsPage }))),
});
const vaultsRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/vaults',
  component: lazy(() => import('./routes/earn.tsx').then((module) => ({ default: module.EarnPage }))),
});

const VaultPage = lazy(() => import('./routes/earn.tsx').then((module) => ({ default: module.VaultDetailPage })));
const vaultRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/vaults/$vaultId',
  component: VaultView,
});

const VaultManagePage = lazy(() => import('./routes/earn.tsx').then((module) => ({ default: module.VaultManagePage })));
const vaultManageRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/vaults/$vaultId/manage',
  component: VaultManageView,
});
const memoryRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/lab/memory',
  component: lazy(() => import('./routes/lab.tsx').then((module) => ({ default: module.MemoryPage }))),
});
const backtestsRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/lab/backtests',
  component: lazy(() => import('./routes/lab.tsx').then((module) => ({ default: module.BacktestsPage }))),
});

const BacktestPage = lazy(() => import('./routes/lab.tsx').then((module) => ({ default: module.BacktestDetailPage })));
const backtestRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/lab/backtests/$runId',
  component: BacktestView,
});
const automationsRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/lab/automations',
  component: lazy(() => import('./routes/lab.tsx').then((module) => ({ default: module.AutomationsPage }))),
});

const AutomationHistoryPage = lazy(() =>
  import('./routes/lab.tsx').then((module) => ({ default: module.AutomationHistoryPage })),
);
const automationHistoryRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/lab/automations/$automationId/history',
  component: AutomationHistoryView,
});
const learningRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/lab/learning',
  component: lazy(() => import('./routes/lab.tsx').then((module) => ({ default: module.LearningPage }))),
});
const portfolioRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/portfolio',
  component: lazy(() => import('./routes/portfolio.tsx').then((module) => ({ default: module.PortfolioPage }))),
});
const receiveRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/portfolio/receive',
  component: lazy(() => import('./routes/portfolio.tsx').then((module) => ({ default: module.ReceivePage }))),
});
const sendRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/portfolio/send',
  component: lazy(() => import('./routes/portfolio.tsx').then((module) => ({ default: module.SendPage }))),
});
const activityRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/portfolio/activity',
  component: lazy(() => import('./routes/portfolio.tsx').then((module) => ({ default: module.ActivityPage }))),
});
const spendRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/portfolio/spend',
  component: lazy(() => import('./routes/portfolio.tsx').then((module) => ({ default: module.SpendPage }))),
});

const PlanPage = lazy(() => import('./routes/portfolio.tsx').then((module) => ({ default: module.PlanStatusPage })));
const planRoute = createRoute({ getParentRoute: () => workspaceRoute, path: '/plans/$planId', component: PlanView });
const alertsRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/alerts',
  component: lazy(() => import('./routes/portfolio.tsx').then((module) => ({ default: module.AlertsPage }))),
});
const connectionsRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/settings/connections',
  component: lazy(() => import('./routes/portfolio.tsx').then((module) => ({ default: module.ConnectionsPage }))),
});
const guardrailsRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/settings/guardrails',
  component: lazy(() => import('./routes/settings.tsx').then((module) => ({ default: module.GuardrailsPage }))),
});
const walletRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/wallet',
  component: lazy(() => import('./routes/settings.tsx').then((module) => ({ default: module.WalletPage }))),
});

const earnAlias = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/earn',
  component: lazy(() => import('./routes/earn.tsx').then((module) => ({ default: module.EarnPage }))),
});
const liquidityRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/earn/liquidity',
  component: lazy(() => import('./routes/liquidity.tsx').then((module) => ({ default: module.LiquidityPage }))),
});
const LiquidityDetail = lazy(() =>
  import('./routes/liquidity.tsx').then((module) => ({ default: module.LiquidityDetailPage })),
);
const liquidityDetailRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/earn/liquidity/$poolId',
  component: LiquidityView,
});
function LiquidityView() {
  const { poolId } = liquidityDetailRoute.useParams();
  return <LiquidityDetail poolId={poolId} />;
}

const borrowAlias = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/borrow',
  beforeLoad: () => {
    throw redirect({ to: '/credit' });
  },
});

const conversationsAlias = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/conversations',
  beforeLoad: () => {
    throw redirect({ to: '/chat' });
  },
});

const labAlias = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/lab',
  beforeLoad: () => {
    throw redirect({ to: '/lab/memory' });
  },
});

const earnDetailAlias = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/earn/$vaultId',
  component: EarnDetailView,
});
function EarnDetailView() {
  const { vaultId } = earnDetailAlias.useParams();
  return <VaultPage vaultId={vaultId} />;
}

export const router = createRouter({
  routeTree: rootRoute.addChildren([
    indexRoute,
    workspaceRoute.addChildren([
      chatRoute,
      researchRoute,
      rwasRoute,
      marketsRoute,
      venuesRoute,
      savedRoute,
      protocolRoute,
      assetRoute,
      venueRoute,
      marketRoute,
      tradeRoute,
      creditRoute,
      supplyRoute,
      positionsRoute,
      vaultsRoute,
      vaultRoute,
      vaultManageRoute,
      memoryRoute,
      backtestsRoute,
      backtestRoute,
      automationsRoute,
      automationHistoryRoute,
      learningRoute,
      portfolioRoute,
      receiveRoute,
      sendRoute,
      activityRoute,
      spendRoute,
      planRoute,
      alertsRoute,
      connectionsRoute,
      guardrailsRoute,
      walletRoute,
      earnAlias,
      liquidityRoute,
      liquidityDetailRoute,
      borrowAlias,
      conversationsAlias,
      labAlias,
      earnDetailAlias,
    ]),
  ]),
});

function ChatView() {
  const { ask } = chatRoute.useSearch();
  return <ChatPage ask={ask} />;
}

function ProtocolView() {
  const { protocolId } = protocolRoute.useParams();
  return <ProtocolPage protocolId={protocolId} />;
}

function AssetView() {
  const { assetId } = assetRoute.useParams();
  return <AssetPage assetId={assetId} />;
}

function VenueView() {
  const { venueId } = venueRoute.useParams();
  return <VenuePage venueId={venueId} />;
}

function MarketView() {
  const { marketId } = marketRoute.useParams();
  return <MarketPage marketId={marketId} />;
}

function VaultView() {
  const { vaultId } = vaultRoute.useParams();
  return <VaultPage vaultId={vaultId} />;
}

function VaultManageView() {
  const { vaultId } = vaultManageRoute.useParams();
  return <VaultManagePage vaultId={vaultId} />;
}

function BacktestView() {
  const { runId } = backtestRoute.useParams();
  return <BacktestPage runId={runId} />;
}

function AutomationHistoryView() {
  const { automationId } = automationHistoryRoute.useParams();
  return <AutomationHistoryPage automationId={automationId} />;
}

function PlanView() {
  const { planId } = planRoute.useParams();
  return <PlanPage planId={planId} />;
}

function PageError({ reset }: ErrorComponentProps) {
  return (
    <Card>
      <EmptyState title="This page couldn't be loaded" description="Try again, or return to the research workspace.">
        <Button onClick={reset}>Try again</Button>
      </EmptyState>
    </Card>
  );
}

function PageNotFound() {
  return (
    <Card>
      <EmptyState title="Page not found" description="This link doesn't match a page in your workspace.">
        <Button nativeButton={false} render={<Link to="/research" />}>
          Open research
        </Button>
      </EmptyState>
    </Card>
  );
}

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
