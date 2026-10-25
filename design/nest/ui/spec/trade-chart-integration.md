# USDC market charts

The trading market is always `base / USDC`, including when the swap ticket pays USDC. USDC is fixed and is excluded from the base-asset picker. The seven selectable bases retain their exact Stellar contract identities in `trade-assets.json`.

TradingView Lightweight Charts 5.2.1 is bundled locally with LICENSE, NOTICE, package integrity, and visible TradingView attribution. The wrapper is independently implemented after inspecting [shared TradingChart](https://github.com/dzmbs/shared/blob/f534d21313be115351627f829b1053c56199b93d/app/src/components/trading/TradingChart.tsx). Like shared, it separates chart rendering from data retrieval and supports intervals, crosshair, resizing and refresh. It adds wheel/pinch zoom, drag pan, axis scaling, Auto, Log, Fit and keyboard navigation. It does not copy shared generated future candles.

## Data

- Spot: authenticated Soroswap `/price`, normalized by the actual USDC/USD price; Aquarius token-price ratios are the fallback, corrected for its seven-decimal price encoding (including eight-decimal SolvBTC) and checked against registered token decimals. Keys remain server-side.
- XLM, EURC, PYUSD: timestamped underlying asset oracle prices via DefiLlama, normalized by matching USDC/USD observations.
- USDT0: USDT underlying reference, explicitly labeled separately from bridge redemption prices.
- SolvBTC: BTC underlying reference, explicitly labeled separately from SolvBTC redemption NAV.
- AQUA: actual Aquarius AQUA/USDC swap events. OHLC and base volume are aggregated from the latest 500 events; no candles fill gaps. This is one identified pool's recorded history, not all-venue volume.
- EUTBL: daily issuer NAV from Spiko, converted from EUR using the most recent published ECB EUR/USD fixing and observed USDC/USD. Other intervals are disabled because NAV is daily. Weekend FX uses the previous published fixing, with a four-day maximum age.

Every asset renders as candlesticks. Oracle feeds request finer observations, deduplicate timestamps, and aggregate UTC buckets: first observed value is open, last is close, and observed maximum/minimum are high/low. These are labeled sampled-price OHLC, not complete intraperiod exchange extremes. Empty periods are not filled. A single daily NAV observation has equal O/H/L/C. Only the Aquarius trade feed displays volume; oracle/NAV volume is unavailable. Responses require exact asset/quote/interval matches, ascending unique real timestamps, positive finite prices and valid candle bounds. Missing observations remain missing. All seven default histories have real captured data. The saved snapshot is an explicitly dated fallback when the local adapter is unavailable; other intervals show an honest unavailable state if no matching snapshot exists. Reference history does not enable or price an executable swap.

## Local preview

Keep the existing UI server at `http://127.0.0.1:8765/`. From the repository root start:

```sh
python3 design/nest/ui/scripts/market_data.py
```

The read-only adapter listens on `127.0.0.1:8766` and permits only the local preview origins. `SOROSWAP_API_KEY` is loaded from the server environment or the ignored root `.dev.vars`. Its fixed provider requests never take an arbitrary upstream URL from the browser. Responses omit credentials and upstream error bodies. Cached requests limit upstream load. Refreshes preserve zoom; asset/interval changes reset the data and cancel obsolete requests. No wallet, transaction-building or submission endpoints are exposed.

Hosted integration should mount the same read-only contract at `/api/market-history?asset=XLM&interval=1H` with a server-held Soroswap key. No hosted service is deployed by this local UI change.

Refresh the real default snapshots with `python3 design/nest/ui/scripts/market_data.py --snapshot`. Verify adapters with `python3 design/nest/ui/scripts/test_market_data.py`, then run the existing market-model and portfolio-navigation scripts with Node.

Sources: [Soroswap price schema](https://docs.soroswap.finance/api-reference/market-data/price), [Aquarius pools API](https://docs.aqua.network/developers/code-examples/get-pools-info), [DefiLlama coins API](https://api-docs.defillama.com/), [Spiko public API](https://docs.spiko.io/developers/public_api/getting_started/), [ECB exchange-rate series](https://data.ecb.europa.eu/data/datasets/EXR/EXR.D.USD.EUR.SP00.A), [TradingView scaling API](https://tradingview.github.io/lightweight-charts/docs/api/interfaces/HandleScaleOptions).
