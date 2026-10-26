import type { ProposalKind } from '@nest/agent-runtime/events';

import { LendingProposalCard } from './lending-proposal.tsx';
import { LimitOrderCard } from './limit-order.tsx';
import { SwapProposalCard } from './swap-proposal.tsx';

/** Renders the card for a proposal Nest created, by the intent kind the agent event carried. */
export function ProposalCard({ intentId, kind }: { intentId: string; kind: ProposalKind }) {
  if (kind === 'swap') return <SwapProposalCard intentId={intentId} />;
  if (kind === 'limit_order' || kind === 'limit_close') return <LimitOrderCard intentId={intentId} />;
  return <LendingProposalCard intentId={intentId} />;
}
