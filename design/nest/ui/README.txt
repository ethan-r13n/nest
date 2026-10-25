NEST UI DESIGN HANDOFF v0.6.0 — 25 OCTOBER 2026

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
  Research DeFi; Research RWAs; Lab Memory; Lab Backtests; Lab Automations.
17 supporting route designs and a complete Portfolio now fill the missing
journeys. See spec/completion.html for the before/after audit and contracts.
The existing Rain concept remains available for context.

Identity
  Original woven Nest logo with a plain circular egg.
  Existing Raven-derived tokens and locally bundled licensed IBM Plex fonts.

Scope
  Research embeds dated repository snapshots, retaining source scope and gaps.
  Financial values in other views are explicit fixtures.
  The sample backtest is a deterministic local calculation over synthetic prices.
  No wallet connection, provider call, OAuth, live scheduling, signing, submission
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
