# Workspace UI coverage audit

Checked against the design in `design/nest/ui` on 26 October 2026. This is a coverage record, not a claim that every account state is pixel-identical to a populated design specimen.

## Protocol research

The five highest Stellar TVL entries in the DeFi ranking are Blend Pools V2, Stellar DeFi Hub, Aquarius Stellar, Gami Labs and Upshift. Each uses the same restored protocol template:

- Research navigation, protocol identity, source description and actions.
- Stellar TVL, protocol-wide scope or exact Stellar yield-pool count, and category.
- Yield opportunities only where the captured feed contains an exact protocol match, including base and 30-day mean APY. Zero and tiny nonzero yields remain distinct.
- Markets and capabilities where an integration design exists, with links to the application forms.
- Protocol overview, borrowed value, token and listing date where supplied.
- Dated Scout project context, funding, links and expandable audit, repository and contract references.
- Explore, source boundaries and dependencies/controls in the reference sidebar.

The main column and 360px sidebar were measured against the reference at the same workspace width. The schema validates external links and contract identifiers. Venue and market detail routes share this template instead of retaining a second generic protocol design.

## Surfaces inspected

The browser audit covered 37 distinct desktop route instances, nine mobile views at 375 CSS pixels, the unknown-route state, all five Credit editors, and the windows listed below. Source snapshots, section headings, table columns, reference expansions, overflow and screenshots were inspected. Representative parameterized routes were used for secondary detail types; the protocol top five were checked individually.

| Area | Coverage and corrections |
| --- | --- |
| Research | DeFi ranking, filtering, column controls, RWAs, composition/history, league table, MCP map/catalog and bookmarks. Restored the all-chain TVL column and RWA table fields. Asset names open the captured RWA.xyz URLs in a new tab. |
| Protocols | All five leading entries, sidebar, yield tables, read groups, audit/repository/contract disclosures, source links and mobile layout. |
| Earn | Main list and categories; live DeFindex deposits; sourced Gami and Sentora campaign details; vault management state; Aquarius list and pool-detail route. Restored vault titles, metric hierarchy, sidebar placement, counterparty icons and deposit/withdraw tabs. |
| Credit | Borrow, collateral/debt/horizon/rate/venue editors, Supply and Positions. Debt input text measures 26px with a 44px input height, including invalid input. Supply restores Asset/Amount, Horizon/Venue, then a full-width withdrawal disclosure. Only the current Credit tab is highlighted. Amount-aware execution still uses the existing lending proposals. |
| Trade | Chart, intervals, routes, ticket, positions/history and market/pay/receive selectors. Replaced the small asset dropdowns with the searchable asset window, retaining existing asset identifiers and handlers. |
| Lab | Backtest, automation, history, learning, unavailable backtest run and a saved monitor’s history. Restored the common header, history filters/search and empty-state composition while retaining actual monitor records and controls. |
| Portfolio | Overview, activity, receive, send, spend concept and requested-plan status. Restored the overview Activity area and reference headings. |
| Settings | Connections, full-page Guardrails, drawer and wallet access route. Connections retains the two main source panels. Guardrails preserves explicit draft state and separate source tolerances. |
| Windows | Guardrails, context assistant, wallet-provider chooser, all three Trade asset selectors, vault amount/review entry, arbitrage simulation and protocol information popovers. No wallet connection, signature or financial submission was performed for this audit. |

## Differences retained or still requiring functional work

These are not reported as visually matched populated states:

| Surface | Difference |
| --- | --- |
| Account-dependent lists | The reference contains sample balances, debts, positions, receipts, bookmarks and alerts. Unverified or unavailable application records remain empty/unavailable. Missing rows are not replaced with the specimens. Portfolio composition and personal activity still need complete account-ledger wiring. |
| Plan status page | The execution API retains confirmed plans, but this standalone route still has its pre-existing unavailable-state UI. The connected proposal/deposit confirmation flows and API records remain intact. |
| Credit comparison | The reference has fixture venue terms, capacity and LTV. The application retains actual Blend reads and typed proposal flows; missing amount-specific terms and risk metrics remain explicit. No fixture comparison is represented as a quote. |
| Wallet access | `/wallet` retains its existing redirect to Research; the header opens Stellar Wallets Kit. Its provider flow replaces the design’s sample connected-state dialog and access-state specimen page. |
| Trade asset catalog | The searchable window currently offers the app’s existing XLM, USDC and USDT0 identifiers. It does not enable the additional fixture markets. Unsupported pairs remain blocked by the existing quote flow. |
| Vault products | Live DeFindex entry points use their actual four-stage deposit flow and network. Sentora campaign access links to its provider until a verified execution adapter exists. The reference’s disabled/simulated transaction controls are not copied as functioning deposits. |
| Guardrails | Draft controls are real local inputs; saved revision, account ownership and persistence are not fabricated. Per-source freshness inputs remain more detailed than the specimen’s single tolerance field. |
| Lab and connections | Actual saved monitors, checks and alerts remain visible. Historical replay, learning experiments and X authorization do not acquire fake successful states from the design. |
| Landing | Preserved independently; the workspace reference does not replace the current landing page. |

The layout restoration preserves transaction policies, explicit signing, disabled committed execution switches and the independently updated landing page. The subsequent functional integration below updates the Worker and adapters while retaining those boundaries.

## Brand artwork coverage

The shared identity resolver uses the captured logo manifest's 275 normalized aliases. RWA asset and Platform cells render their own marks; an issuer mark is not substituted for a missing asset mark. The same resolver serves protocol headers, MCP nodes and inspectors, Earn rows and counterparties, asset filters, Trade selectors, Credit asset cards and the X connection identity. Logo backgrounds use the theme's pale foreground surface so dark artwork remains visible.

Automated coverage verifies all 44 protocol identities, all documented aliases and the hashes of all 180 captured artwork files. Of 109 RWA assets, 93 have dedicated artwork; the remaining 16 match the manifest's explicit missing-artwork list. Of 28 RWA platforms, 27 have captured artwork; Stablecorp Digital Currencies Inc. has none. Names remain visible where artwork is unavailable, without fabricated initials or generic brand substitutes.

The browser checks include all three RWA pages at 50 rows per page, all 26 expanded MCP nodes, the five leading protocol pages, Earn categories and eight asset filters, the three Trade selection windows, Credit and Connections. No broken image was observed. Offscreen lazy images are tracked separately from failed images. Nest's shell, assistant and landing marks remain in place. The supplied financial layout specimens are not copied as account balances, quotes or LTV values.

## Combined functional integration

The restored Trade layout and candlestick renderer now use live network-specific history with 15m/1h/4h/1d intervals and correct reversed OHLC. The existing asset window retains its layout and restricts the executable pair to XLM/USDC. Typed amounts obtain debounced quotes, balances expose exact bigint Use max, and the history tab reads actual recorded wallet activity. Missing cost basis still does not produce synthetic positions or P&L.

Aquarius range orders use a separate adapter, typed placement/withdrawal plans and additive migration 0005. Their simple Trade panel is capped at 768px. A second price-range visualization is deliberately absent; the main candlestick renderer is retained. Research, Credit and Supply APY selections open the command interface with the original pool/asset context, supported commands use the existing reviewed Blend proposal, and other questions carry the quoted source to Ask Nest.

Combined validation includes frozen installation, `pnpm check`, an uncached Worker run with 12 files/110 tests, browser interval switching and reversal, an actual SDEX quote, live limit-order comparison and a real inline Blend proposal. No wallet signature or new financial submission was performed. The updated local Worker uses a backed-up copy of the previous preview's state and the same provider credentials; migration 0005 is applied locally only. The previously confirmed vault deposit remains readable both by plan ID and in wallet activity, and the existing arbitrage monitor retains its state with one-minute local checks. Committed execution gates and free-model restrictions are unchanged.
