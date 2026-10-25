# Architecture decisions

## Agent runtime

The application embeds `@earendil-works/pi-agent-core`, `@earendil-works/pi-ai`, and `@earendil-works/pi-mcp` at compatible pinned versions. The agent runs in a SQLite-backed Durable Object. The larger coding-agent facade is unsuitable for the deployed Worker runtime because of its filesystem and terminal assumptions. The application explicitly registers its approved tools and provides its own session/checkpoint integration.

Pi owns model calls, bounded tool loops and streaming. Raven MCP supplies approved ecosystem research. The application owns request admission, cancellation, tool authorization, and conversation persistence. Paid models are rejected by the committed provider policy.

## Financial authority

Conversation history and model output are untrusted inputs. The execution service validates a typed intent, compares venues, creates an immutable review, applies policies, simulates and decodes the transaction, and accepts only a matching wallet signature. D1 owns financial state independently of conversation checkpoints.

Transaction retries preserve the prepared bytes and hash. An uncertain network response triggers reconciliation rather than a new spend. Claims and transitions use conditional writes; job leases are fenced by attempt/version.

## Network and data boundaries

Mainnet and Testnet use separate D1 bindings and registries. Committed execution flags are disabled. Mainnet RPC and provider credentials are operator-managed server secrets, never frontend variables.

Research snapshots retain their sources, definitions and capture times. Missing or stale data does not become a zero or an executable quote. Read-only Aquarius discovery does not grant LP write capabilities. Fees, base returns, incentives and withdrawal conditions remain separate.

## UI

The workspace is primary; the assistant is a contextual panel or full chat route. Shared components use the Nest theme. A standalone landing page can fill an unsent chat draft. Financial actions use application-owned cards and explicit Freighter review instead of transcript buttons that imply authority.
