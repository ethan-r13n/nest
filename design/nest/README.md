# Nest design implementation handoff

Use this canonical kit for Nest's interface and selected visual identity. It contains design tokens, local fonts, assets and inspectable component specimens. The [technical implementation guide](../../docs/technical-spec.md) and [screen contract](spec/ui-design-spec.json) define product behavior; this kit is not the deployed application.

## Start here

- Open [the visual guide](index.html) for the palette, typography, component styles, responsive workspace specimens and asset usage.
- Read [the UI design contract](spec/ui-design-spec.json) for current Guardrails and Portfolio Spend requirements.
- Inspect [the Rain card preview](mockups/rain-card.html) and its [rendered screenshot](mockups/rain-card-preview.jpg). The HTML is an embeddable fragment; it can be placed in a normal HTML document for a standalone preview.
- Use [the technical spec](../../docs/technical-spec.md) for authoritative data, execution, wallet, policy and persistence boundaries.

The guide's market values and interactions are clearly marked fixtures. It has no model, wallet or chain connection. Its existing component specimens do not implement every current screen requirement; the versioned screen contract and technical spec remain authoritative. The Rain mockup is UI only and cannot issue a card, collect identity information, move funds or make payments.

## Load the foundations

Load styles in this order:

```html
<link rel="stylesheet" href="assets/fonts/fonts.css">
<link rel="stylesheet" href="tokens.css">
<link rel="stylesheet" href="components.css">
```

Use the `.nest` scope for the supplied token and component styles. [tokens.json](tokens.json) contains the same implementation values for application tooling. [guide.css](guide.css) and [guide.js](guide.js) belong to the visual guide; do not treat them as an application framework or execution implementation.

Keep forest surfaces, cream text and orange actions consistent. Use IBM Plex Serif for titles, Sans for controls/prose and Mono with tabular numbers for financial values. Retain visible focus, explicit status labels, reduced-motion support and 44px touch targets. Orange is an action/selection color, not a positive-return signal.

## Identity and assets

Use the selected woven Nest symbol with its solid circular seed. The canonical exports are in [assets](assets):

| Asset | Use |
| --- | --- |
| [nest-symbol.svg](assets/nest-symbol.svg) and [cream variant](assets/nest-symbol-cream.svg) | Flat product symbol. |
| [nest-lockup.svg](assets/nest-lockup.svg) and [light-surface variant](assets/nest-lockup-on-light.svg) | Portable outlined wordmark lockups. |
| [Editable lockup](assets/nest-lockup-editable.svg) and [light-surface editable lockup](assets/nest-lockup-on-light-editable.svg) | Text remains editable using the included Serif font. |
| [Symbol PNG](assets/nest-logo.png), [cream PNG](assets/nest-logo-cream.png) and [lockup PNG](assets/nest-lockup.png) | Raster fallbacks of the same selected identity. |
| [Nest cover](assets/nest-cover.png) and [text-free cover](assets/nest-cover-clean.png) | Brand collateral and art direction, not a hero inside the working DeFi interface. |

Keep the logo flat in product chrome; do not substitute the cover sculpture for a small interface icon. Preserve clear space and legibility. The cover is a raster reference, not a completed 3D model or animation. [The motion brief](spec/motion-brief.html) and [artwork prompt record](spec/generation-prompts.txt) document optional future production work, not P0 runtime requirements.

The [asset manifest](spec/asset-manifest.json) records canonical asset checksums. Exploratory logo variations, nested duplicate kits and ZIP archives are intentionally excluded from the repository handoff.

## Fonts and notices

The six local WOFF2 files and [font declarations](assets/fonts/fonts.css) are bundled under `assets/fonts/`. Preserve the included [SIL Open Font License](assets/fonts/OFL.txt) when distributing them. No remote font service is required by the visual guide. The independent Rain preview currently requests the same type families through Google Fonts and falls back to system fonts when unavailable.

Raven supplies the visual reference direction; use Nest's own wordmark and assets in the product. Market/provider data, card availability and risk settings must retain their actual application states rather than being inferred from these design examples.
