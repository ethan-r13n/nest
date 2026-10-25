import { Button } from '@nest/ui/components/button';
import { Card } from '@nest/ui/components/card';
import {
  createRootRoute,
  createRoute,
  createRouter,
  type ErrorComponentProps,
  Link,
  redirect,
} from '@tanstack/react-router';
import { lazy } from 'react';

import { AppShell } from './components/app-shell.tsx';
import { EmptyState } from './components/workspace.tsx';

const rootRoute = createRootRoute({ component: AppShell, errorComponent: PageError, notFoundComponent: PageNotFound });
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/research' });
  },
});
const chatRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/chat',
  component: lazy(() => import('./routes/chat.tsx').then((module) => ({ default: module.ChatPage }))),
});
const researchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/research',
  component: lazy(() => import('./routes/research.tsx').then((module) => ({ default: module.ResearchPage }))),
});
const rwasRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/research/rwas',
  component: lazy(() => import('./routes/research.tsx').then((module) => ({ default: module.RwaPage }))),
});
const marketsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/research/markets',
  component: lazy(() => import('./routes/research.tsx').then((module) => ({ default: module.MarketsPage }))),
});
const venuesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/research/venues',
  component: lazy(() => import('./routes/research.tsx').then((module) => ({ default: module.VenuesPage }))),
});
const savedRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/research/saved',
  component: lazy(() => import('./routes/research.tsx').then((module) => ({ default: module.SavedResearchPage }))),
});

const ProtocolPage = lazy(() =>
  import('./routes/research.tsx').then((module) => ({ default: module.ProtocolDetailPage })),
);
const protocolRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/protocols/$protocolId',
  component: ProtocolView,
});

const AssetPage = lazy(() => import('./routes/research.tsx').then((module) => ({ default: module.RwaDetailPage })));
const assetRoute = createRoute({ getParentRoute: () => rootRoute, path: '/assets/$assetId', component: AssetView });

const VenuePage = lazy(() => import('./routes/research.tsx').then((module) => ({ default: module.VenueDetailPage })));
const venueRoute = createRoute({ getParentRoute: () => rootRoute, path: '/venues/$venueId', component: VenueView });

const MarketPage = lazy(() => import('./routes/research.tsx').then((module) => ({ default: module.MarketDetailPage })));
const marketRoute = createRoute({ getParentRoute: () => rootRoute, path: '/markets/$marketId', component: MarketView });
const tradeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/trade',
  component: lazy(() => import('./routes/trade.tsx').then((module) => ({ default: module.TradePage }))),
});
const creditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/credit',
  component: lazy(() => import('./routes/credit.tsx').then((module) => ({ default: module.CreditPage }))),
});
const supplyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/credit/supply',
  component: lazy(() => import('./routes/credit.tsx').then((module) => ({ default: module.SupplyPage }))),
});
const positionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/credit/positions',
  component: lazy(() => import('./routes/credit.tsx').then((module) => ({ default: module.PositionsPage }))),
});
const vaultsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/vaults',
  component: lazy(() => import('./routes/earn.tsx').then((module) => ({ default: module.EarnPage }))),
});

const VaultPage = lazy(() => import('./routes/earn.tsx').then((module) => ({ default: module.VaultDetailPage })));
const vaultRoute = createRoute({ getParentRoute: () => rootRoute, path: '/vaults/$vaultId', component: VaultView });

const VaultManagePage = lazy(() => import('./routes/earn.tsx').then((module) => ({ default: module.VaultManagePage })));
const vaultManageRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/vaults/$vaultId/manage',
  component: VaultManageView,
});
const memoryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/lab/memory',
  component: lazy(() => import('./routes/lab.tsx').then((module) => ({ default: module.MemoryPage }))),
});
const backtestsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/lab/backtests',
  component: lazy(() => import('./routes/lab.tsx').then((module) => ({ default: module.BacktestsPage }))),
});

const BacktestPage = lazy(() => import('./routes/lab.tsx').then((module) => ({ default: module.BacktestDetailPage })));
const backtestRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/lab/backtests/$runId',
  component: BacktestView,
});
const automationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/lab/automations',
  component: lazy(() => import('./routes/lab.tsx').then((module) => ({ default: module.AutomationsPage }))),
});

const AutomationHistoryPage = lazy(() =>
  import('./routes/lab.tsx').then((module) => ({ default: module.AutomationHistoryPage })),
);
const automationHistoryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/lab/automations/$automationId/history',
  component: AutomationHistoryView,
});
const learningRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/lab/learning',
  component: lazy(() => import('./routes/lab.tsx').then((module) => ({ default: module.LearningPage }))),
});
const portfolioRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/portfolio',
  component: lazy(() => import('./routes/portfolio.tsx').then((module) => ({ default: module.PortfolioPage }))),
});
const receiveRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/portfolio/receive',
  component: lazy(() => import('./routes/portfolio.tsx').then((module) => ({ default: module.ReceivePage }))),
});
const sendRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/portfolio/send',
  component: lazy(() => import('./routes/portfolio.tsx').then((module) => ({ default: module.SendPage }))),
});
const activityRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/portfolio/activity',
  component: lazy(() => import('./routes/portfolio.tsx').then((module) => ({ default: module.ActivityPage }))),
});
const spendRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/portfolio/spend',
  component: lazy(() => import('./routes/portfolio.tsx').then((module) => ({ default: module.SpendPage }))),
});

const PlanPage = lazy(() => import('./routes/portfolio.tsx').then((module) => ({ default: module.PlanStatusPage })));
const planRoute = createRoute({ getParentRoute: () => rootRoute, path: '/plans/$planId', component: PlanView });
const alertsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/alerts',
  component: lazy(() => import('./routes/portfolio.tsx').then((module) => ({ default: module.AlertsPage }))),
});
const connectionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings/connections',
  component: lazy(() => import('./routes/portfolio.tsx').then((module) => ({ default: module.ConnectionsPage }))),
});
const guardrailsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings/guardrails',
  component: lazy(() => import('./routes/settings.tsx').then((module) => ({ default: module.GuardrailsPage }))),
});
const walletRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/wallet',
  component: lazy(() => import('./routes/settings.tsx').then((module) => ({ default: module.WalletPage }))),
});

const earnAlias = createRoute({
  getParentRoute: () => rootRoute,
  path: '/earn',
  beforeLoad: () => {
    throw redirect({ to: '/vaults' });
  },
});

const borrowAlias = createRoute({
  getParentRoute: () => rootRoute,
  path: '/borrow',
  beforeLoad: () => {
    throw redirect({ to: '/credit' });
  },
});

const conversationsAlias = createRoute({
  getParentRoute: () => rootRoute,
  path: '/conversations',
  beforeLoad: () => {
    throw redirect({ to: '/chat' });
  },
});

const labAlias = createRoute({
  getParentRoute: () => rootRoute,
  path: '/lab',
  beforeLoad: () => {
    throw redirect({ to: '/lab/memory' });
  },
});

const earnDetailAlias = createRoute({
  getParentRoute: () => rootRoute,
  path: '/earn/$vaultId',
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/vaults/$vaultId', params });
  },
});

export const router = createRouter({
  routeTree: rootRoute.addChildren([
    indexRoute,
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
    borrowAlias,
    conversationsAlias,
    labAlias,
    earnDetailAlias,
  ]),
});

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
