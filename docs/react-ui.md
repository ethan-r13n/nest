# React workspace behavior

The application runs with `pnpm dev`. The static design prototype in `design/nest/ui` is a separate artifact.

| Area | React behavior |
| --- | --- |
| Research | Shared DeFi, RWA and market tables support density, optional columns and 10/25/50 pagination. Column identity is required. Preferences survive route navigation in memory. Headers and identity columns stay visible inside bounded scroll regions. Exports retain source definitions and full identities. |
| Chat | A keyed message log scrolls independently of the composer. Incoming messages only follow the end while the reader is already there; Latest resumes following. Conversation history collapses to labelled icon actions on desktop and toggles inline on narrow layouts. |
| Context assistant | At 1200px and above, an adjacent panel supports pointer and keyboard resizing within 320–560px; double-click restores 380px. Smaller layouts use a focus-managed sheet. Continue in chat transfers the unsaved draft in memory. Opening or closing the assistant preserves the current workspace form. |
| Borrow and vault inputs | Shared amount groups attach asset units and associate validation messages with inputs. Check draft focuses the first invalid borrow amount or duration. Validation checks text format only, without claiming current eligibility, liquidity or borrowing capacity. Withdrawal timing remains prominent. |
| Portfolio | Net value, gross assets, debt and valuation coverage appear together. Asset mix and Net value switch between the same accounting categories. Missing positions and prices stay unavailable. No allocation percentages, P&L or historical curve are synthesized. |
| RWA links | URL-safe route identifiers preserve the complete source identity while allowing direct navigation and reloads. The detail view still exposes the original source references. |

The React application connects to Worker health and research endpoints, streamed Pi conversations, typed swap and Blend proposal cards, and explicit Freighter review. Application services prepare, inspect, submit and reconcile transactions; the agent never signs. Chat renders actual responses and structured proposals without fabricating successful actions. Wallet-authenticated saved history and complete portfolio loading remain release gates. Stopping generation cancels the response; dismissing a financial plan is a separate operation.

Unsaved drafts and display preferences are memory-only and disappear on reload. They are not financial state, durable conversation history or execution permissions. Mainnet and Testnet execution remain disabled.
