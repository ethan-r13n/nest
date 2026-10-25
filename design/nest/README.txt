NEST — VISUAL IDENTITY & DESIGN SYSTEM v0.1
25 October 2026

Open index.html for the complete design sheet. It works from local files;
serve it locally for clipboard support and the responsive QA wrapper.

Production identity assets
  assets/nest-symbol.svg              Orange symbol, transparent
  assets/nest-symbol-cream.svg        Cream symbol, transparent
  assets/nest-lockup.svg              Outlined primary wordmark
  assets/nest-lockup-on-light.svg     Outlined dark wordmark
  assets/*-editable.svg               Editable text variants
  assets/nest-logo.png                Orange symbol PNG, 1024px wide
  assets/nest-logo-cream.png          Cream symbol PNG, 1024px wide
  assets/nest-lockup.png              Primary lockup PNG, 1800px wide
  assets/nest-cover.png               Cover with title, 2172 x 724
  assets/nest-cover-clean.png         Text-free 3D reference, 2172 x 724

Implementation
  Import assets/fonts/fonts.css, tokens.css, then components.css.
  Apply class="nest" to the application root. Tokens are namespaced --nest-*.
  tokens.json contains the same 49 base tokens, plus breakpoints and role notes.
  IBM Plex WOFF2 files are bundled locally with the original OFL license.
  Guide-specific layout lives in guide.css; it is not application CSS.

Design baseline
  Exact Raven core colors and IBM Plex families.
  Serif titles, Sans controls/prose, Mono financial values and labels.
  64px app header; 24px gaps; 12px controls; 16px cards; 48/52px rows.
  340px action tickets; 380px assistant. Production docks the assistant at
  >=1440px and overlays below. This guide demonstrates only the overlay state.
  Mobile below 768px: single column and full-height assistant.
  Orange is action/selection; financial states use separate colors plus labels.
  Accessible subdued text #829179 replaces #71806a for small readable labels.
  Dark text on orange buttons; 2px focus ring with 3px offset.

Prototype scope
  The Research view and review sheet are component specimens with fixture data.
  They do not connect to a wallet, model, API, venue or network. Shell navigation
  labels are illustrated rather than implemented app routes. Interactive parts:
  palette copy, logo surface, details, sorting, row density, assistant and review.
  Comparison preserves fixtures and explicitly states that it does not recompute.
  The future app should follow the authoritative Technical Implementation Guide.

3D and generation handoff
  spec/motion-brief.html defines meshes, materials, framing and a five-second study.
  spec/generation-prompts.txt contains the exact built-in image tool prompts.
  The cover is generated raster artwork, not an editable 3D scene. The clean plate
  is retained for later production. Final SVGs are clean geometric reconstructions
  of the generated logo concept. Primary lockups have portable outlined text.
  spec/export-logo.py regenerates the outlines with fonttools and brotli.

Validation
  Visual/browser checks at 375, 1024 and 1440px; no page overflow.
  Native dialog behavior and focus restoration; 44px actions; table sorting/density.
  Component typography and dark-on-orange colors verified from computed styles.
  Core contrast pairs checked. SVG XML, local links, JSON and JS syntax validated.

Sources
  https://raven.stellar.org/
  https://github.com/stellar-experimental/stellar-raven/blob/b1dc8663b37a4795f50538918fdf5f4b08c6b054/src/site.ts#L75
  https://chatgpt.com/space/page_01bffc9d67848191b2ef9c6400ffc767
  https://raw.githubusercontent.com/IBM/plex/master/LICENSE.txt
