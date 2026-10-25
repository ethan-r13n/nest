NEST UI DESIGN HANDOFF v0.8.1 — 25 OCTOBER 2026

Start with designs.html for the visual index, index.html for the interactive
preview, or spec/index.html for the complete implementation specification.
The machine-readable aggregate is ../spec/ui-design-spec.json.

This is a buildless local design artifact. No npm installation is required.
For browser preview, serve the enclosing nest-ui-handoff folder:
  python3 -m http.server 8765 --bind 127.0.0.1
Then open http://127.0.0.1:8765/ui/designs.html.

To rebuild the downloadable handoff bundle from a repository checkout:
  python3 design/nest/ui/scripts/build-handoff.py
Run that command from the repository root. ZIP bundles are generated locally
and are not tracked in Git; source, fonts, real logos and previews are included.

Requested views
  Trade; Vault list; one combined Vault detail; Borrow; Manage positions;
  Research DeFi; Research RWAs; Lab Backtest; Lab Set automation; Lab History.
17 supporting route designs and a complete Portfolio now fill the missing
journeys. See spec/completion.html for the before/after audit and contracts.
The existing Rain concept remains available for context.

Identity
  Original woven Nest logo with a plain circular egg.
  Existing Raven-derived tokens and locally bundled licensed IBM Plex fonts.

Scope
  Research embeds dated repository snapshots, retaining source scope and gaps.
  Execution quotes, accounts and other financial values remain explicit fixtures; trading charts now use real timestamped provider history.
  Lab saves strategy setups locally; historical replay and polling need data services.
  No wallet connection, OAuth, live scheduling, signing, submission
  or historical backtest service is connected by this preview.

Implementation handoff
  spec/index.html maps every screen to layouts, components, data, interactions,
  state matrices, responsive/a11y rules, acceptance and specified API families.
  spec/{research,markets,credit,lab}.json retain area contracts and evidence.
  references/ preserves all 8 supplied UI screenshots and their hashes.
  spec/resources/ captures the repository specification/README for traceability.
  Exact endpoint/schema availability must be verified against the real preset.
  Guest borrow comparison, memory reset/export, historical data/replay and router
  aliases are explicitly marked for finalization.

Validation
  96 browser layout checks: all 32 distinct views at 375/1024/1440px; no page overflow.
  Bounded table/graph scrolling remains intentional.
  Checked exact trade amount and reverse-asset review, stale review blocking,
  Guardrails dirty-draft discard, loading recovery and sample backtest outputs.
  Screen captures in previews/ show the reviewed visual state.

Production UI routes should retain /earn and /credit aliases. The new Lab group
and four-tab Research design supersede older design navigation baselines only;
financial capabilities still follow the authoritative technical specification.

Logo library
  179 actual brand image assets downloaded through Chrome, stored locally.
  spec/logos.html provides the inventory; logo-provenance.json records every
  source URL and SHA-256. Sixteen RWA notes lack a dedicated provider logo;
  no invented marks or initials are substituted.

Chat and discovery v0.4
  Chat replaces the earlier conversation specimen; #conversations is an alias.
  Research adds Markets and Venue map, with full venue and market detail routes.
  spec/discovery.html and discovery.json define behavior and planned API bindings.
  The public Raven metadata snapshot includes all 60 operations, 20 skills and
  202 section identifiers. Runtime reads and native adapter execution remain
  unverified in this local design artifact. 

UI refinement v0.5
  See spec/refinement.html and spec/refinement.json for applied shadcn patterns.
  Chat has stable transcript nodes, a live-edge control and collapsible history.
  Research has density/column controls and 10/25/50 pagination. Borrow fields
  have associated inline errors. Portfolio includes allocation and net views.
  The assistant resizes with pointer/keyboard and uses a sheet below 1200px.
  This is the buildless design prototype; React component mappings retain
  the current base-nova / Base UI workspace, aliases and Nest theme.

Allocation prompt adjustment v0.6.0
  The Research capital/asset/horizon strip now lives in Chat, replacing the
  two lower suggestion cards. Swap and Supply prompts remain. Compare with
  Nest submits a read-only prompt using the exact selected inputs.
  See spec/verification-allocation.json for targeted checks.

Latest screenshot feedback (v0.6.0)
  Trade: original OHLC/volume fixture chart, zoom/pan/keyboard inspection,
  My positions with exact quantity, USD notional, P&L and full close review.
  Vaults: risk-profile dropdown above exit, simplified sidebar.
  Credit: centered 1180px builder, left panel wider than right.
  RWAs: independent KYC/mint-redeem/DEX badges, sourced observations,
  exact same-tab RWA.xyz row links. Unknown access remains unverified.
  Read spec/market-feedback.html and its JSON contract.
  Run node ui/scripts/verify-market-models.js from the enclosing handoff.

UI 3 / Research hierarchy (v0.7.1)
  Research now has DeFi, RWAs and MCP Contents. MCP Contents starts with the
  venue map, expanded to 26 Scout projects and eight integration targets, then
  the published catalog. Venue markets and separate venue/market detail views
  are removed; their read groups, roles, assets, actions and exit terms appear
  on the applicable DeFi protocol detail. Legacy hashes migrate automatically.
  Network metrics and charts are compact. Research tables share numbered
  10/25/50 pagination and preserve filters and position when returning.
  See spec/research-hierarchy.json and spec/verification-research-hierarchy.json.
  Run node ui/scripts/verify-research-hierarchy.js from the enclosing handoff.


Protocol source capture (v0.8.0)
  Exact Stellar pool matches show source TVL and APY on protocol detail.
  Scout project context retains match identity, source dates and family scope.
  The public-upstream collector and yield projector now ship with the handoff
  sources in research/data. Raven MCP remains unconnected in the preview.

Lab trigger and logo follow-up (v0.8.1)
  Lab has Backtest, Set automation and History. The Strategy canvas is
  removed. Chat gathers missing inputs and shows an inline review only
  when the draft is ready. Setups save their source, condition and original
  conversation; actual replay and polling remain unconnected.
  The arbitrage preset stays first. New editable presets cover BTC EMA
  followed by an XLM buy proposal, an XLM volume breakout, and a sustained
  USDC yield gap. Purchase proposals always require review.
  All 26 map projects have real local logos, with seven Scout-name aliases.
  Run scripts/verify-lab-model.js and scripts/verify-map-logos.js.

Credit positions feedback
  Open positions now combines loan and supply rows, adds variable borrow/lend
  APR, and stacks LTV/HF in one cell. Supply rows omit loan risk metrics.
  The selected position opens a full-width management panel matching the
  position table above. The balance chart is removed. Loans show four actions
  on one row; supply has
  only Add and Withdraw. The old workflow, activity, term disclosure and large
  risk summary are removed. No historical series or execution is fabricated.
  Run node ui/scripts/verify-credit-positions.js and see
  spec/verification-credit-positions.json for model and browser checks.

Portfolio cleanup / 25 October 2026
  Remove the requested summary cards, source badges, right sidebar, and
  Receive / Send / Redemptions screens. Overview and Activity remain.
  Every position row says Manage and opens its exact native management
  controls. Credit supply and loan IDs, vault product IDs and LP pool IDs
  are preserved. Wallet assets open Trade with that asset selected.
  See spec/portfolio-feedback.json and its verification evidence.
  Run node ui/scripts/verify-portfolio-navigation.js.

Action button labels / 25 October 2026
  Use Title Case for every word in action buttons and button-style links,
  including dynamic views and dialogs. Preserve token symbols, asset names
  and descriptive rich-button copy. Lab History offers Build A Backtest and
  Build An Automation side by side, wrapping together on narrow screens.

USDC market charts
  All seven base assets have real timestamped reference history in locally bundled
  TradingView Lightweight Charts. USDC is fixed as quote currency.
  To enable live refresh alongside the UI server, from the repository root run:
    python3 design/nest/ui/scripts/market_data.py
  The read-only adapter binds 127.0.0.1:8766 and reads SOROSWAP_API_KEY only on the
  server, from the environment or ignored root .dev.vars. The bundled dated history
  remains usable when the adapter is offline. See spec/trade-chart-integration.md
  for source mappings, underlying-reference scope, daily NAV and hosted API contract.
