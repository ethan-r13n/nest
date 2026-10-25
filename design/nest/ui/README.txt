NEST DESIGN REFERENCE

The production React application lives in apps/web and uses packages/ui.
This directory is a separate, buildless HTML/CSS/JS design reference. It does
not connect wallets, authorize transactions, run live automations or perform
historical backtests. Financial examples are labelled fixtures; captured
research and chart observations retain their source dates and coverage.

Open designs.html for the visual index, index.html for interactive screen
references, or spec/index.html for interface and interaction contracts.
The aggregate machine-readable design contract is ../spec/ui-design-spec.json.
The application README describes implemented services and remaining gates.

From design/nest, start a local design server:
  python3 -m http.server 8765 --bind 127.0.0.1
Then open http://127.0.0.1:8765/ui/designs.html.
Use pnpm dev at the repository root to run the React application instead.

To regenerate the local design archive from the repository root:
  python3 design/nest/ui/scripts/build-handoff.py
The ZIP is generated locally and ignored by Git. The manifests identify the
included design files and bundled assets. spec/resources/ contains copies of
the technical guide and application README.

The reference uses Nest's theme tokens, licensed IBM Plex fonts and original
Nest marks. Logo metadata records source URLs and content hashes. Financial
issuer/protocol marks identify the actual sources; unavailable marks remain
unavailable. Font, chart and other third-party notices stay with their assets.

Screen examples cover research, trade, credit, Earn, positions, portfolio,
chat and Lab. Layout and interaction examples do not establish backend
availability. Always use the real application's typed services, network
registry, policy checks, explicit wallet review and receipt reconciliation.
