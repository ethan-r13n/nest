import type { ProposalKind } from '@nest/agent-runtime/events';

import { LendingProposalCard } from './lending-proposal.tsx';
import { SwapProposalCard } from './swap-proposal.tsx';

/** Renders the card for a proposal Nest created, by the intent kind the agent event carried. */
export function ProposalCard({ intentId, kind }: { intentId: string; kind: ProposalKind }) {
  return kind === 'swap' ? <SwapProposalCard intentId={intentId} /> : <LendingProposalCard intentId={intentId} />;
}
