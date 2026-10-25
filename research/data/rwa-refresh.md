# RWA.xyz Stellar snapshot

Source: [RWA.xyz Stellar network](https://app.rwa.xyz/networks/stellar). Captured on 25 October 2026 through the ordinary rendered page in the operator's signed-in free account. No account credentials, cookies, tokens, hidden application state or gated export data are included.

## Coverage

- All 109 displayed asset rows across five table pages, with 109 distinct asset-page/explorer-link identities.
- Eight network metric cards, preserving display precision and reported 30-day changes.
- Nine league-table filter views: Distributed, Represented and All, each grouped by platform, asset class and manager. Eight views contain data, with 62 visible nonempty rows in total. Represented managers displays no rows.
- Asset names/tickers, manager, value, holders, class, tokenization type, platform, domicile, regulatory display text and source/explorer links.

The league tables show their visible top rows, not a complete export of every platform or manager. Individual asset detail pages and historical chart series were not collected. CSV export requires Pro and was not used.

## Refresh procedure

1. Open the source network page in the operator's browser and confirm the date and asset count.
2. Read the visible network cards. For each Assets table page, wait for the displayed rows to update, then collect rendered cell text and visible link destinations.
3. Follow ordinary Next controls until disabled. Preserve the page's reported pagination text even if its range labels overlap. Check distinct identities against the reported total; do not deduplicate by ticker.
4. Collect each league-table filter view. Remove rows whose rendered cells are all empty; those are placeholders, not zero-value records.
5. Update `rwa-stellar.json`, including `source.capturedAt`, `asOfDisplay` and coverage notes. Validate counts and rebuild the UI projection using `node research/data/build-ui-data.mjs`.

This is an operator-collected snapshot, not an unattended scraper or scheduled live feed. Do not call undocumented authenticated endpoints or bypass export restrictions to refresh it. An automated production source needs a supported integration or a separately reviewed collection method.

## UI contract

Render the source and observation date next to these figures. Rounded values such as `$3.75B` remain rounded displays; they must not become fabricated exact values. A missing cell stays unavailable, while a displayed `0` remains zero.

Use the full asset-page URL plus explorer URL as the observation identity. Explorer links are references, not verified Stellar asset/issuer or contract identifiers. Do not enable transactions from these records alone. Restricted distribution, redemption availability, yield and user eligibility need independent venue verification.

The RWA Count card reports 84, while the asset table has 109 rows including stablecoins and token representations. Keep those definitions separate. Never add these asset values to DefiLlama TVL to create an ecosystem total.
