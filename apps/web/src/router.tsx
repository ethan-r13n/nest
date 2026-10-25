import { createRootRoute, createRoute, createRouter, lazyRouteComponent, redirect } from '@tanstack/react-router';

import { AppShell } from './components/app-shell.tsx';
import { NotBuiltPage } from './routes/not-built.tsx';

const rootRoute = createRootRoute({ component: AppShell });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/research' });
  },
});

const researchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/research',
  component: lazyRouteComponent(() => import('./routes/research.tsx'), 'ResearchPage'),
});

const tradeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/trade',
  component: () => (
    <NotBuiltPage
      title="Trade"
      summary="Exact-input market swaps routed through Soroswap, with live routes, minimum received, fees and wallet approval."
      stage="Swap lifecycle"
    />
  ),
});

const creditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/credit',
  component: () => (
    <NotBuiltPage
      title="Credit"
      summary="Compare Blend, Templar and XOXNO at the same inputs, then supply, borrow, repay and manage collateral."
      stage="Credit and Earn"
    />
  ),
});

const earnRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/earn',
  component: () => (
    <NotBuiltPage
      title="Earn"
      summary="Compare direct lending with DeFindex, Upshift/Gami and Sentora vaults, with withdrawal timing shown before every deposit."
      stage="Credit and Earn"
    />
  ),
});

const portfolioRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/portfolio',
  component: () => (
    <NotBuiltPage
      title="Portfolio"
      summary="Balances, collateral, debt and positions with valuation times, and an exit action for every supported position."
      stage="Read workspace"
    />
  ),
});

export const router = createRouter({
  routeTree: rootRoute.addChildren([indexRoute, researchRoute, tradeRoute, creditRoute, earnRoute, portfolioRoute]),
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
