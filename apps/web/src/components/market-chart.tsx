import { Button } from '@nest/ui/components/button';
import { CandlestickSeries, ColorType, createChart, type IChartApi } from 'lightweight-charts';
import { Maximize, Minus, Plus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { formatUtc } from '../lib/format.ts';
import { PRICE_INTERVALS, type PriceInterval, usePriceHistory } from '../lib/market.ts';
import { aggregateCandles, type MarketHistory, parseMarketHistory } from '../lib/market-history.ts';

const INTERVAL_SECONDS: Record<PriceInterval, number> = { '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400 };
const INTERVALS = PRICE_INTERVALS.map((value) => ({
  label: value.toUpperCase(),
  value,
  seconds: INTERVAL_SECONDS[value],
}));

export interface ChartContext {
  close: number;
  changePct: number | null;
  count: number;
}

export function MarketChart({
  asset,
  onContext,
}: {
  asset: string;
  onContext?: (context: ChartContext | null) => void;
}) {
  const [interval, setInterval] = useState<PriceInterval>('1h');
  const live = usePriceHistory(interval);
  const inverted = asset === 'USDC';
  const unit = inverted ? 'XLM' : 'USDC';
  const history = useMemo<MarketHistory | null>(() => {
    if (!live.data) return null;
    return parseMarketHistory(
      {
        [asset]: {
          rows: live.data.candles.map((candle) => ({
            time: candle.timeMs / 1000,
            open: inverted ? 1 / candle.open : candle.open,
            high: inverted ? 1 / candle.low : candle.high,
            low: inverted ? 1 / candle.high : candle.low,
            close: inverted ? 1 / candle.close : candle.close,
          })),
          source: live.data.source,
          fetchedAt: Math.floor(live.data.observedAtMs / 1000),
          note: `Live ${live.data.network} history.`,
        },
      },
      asset,
    );
  }, [live.data, asset, inverted]);
  const failed = live.isError;
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const rows = useMemo(
    () => aggregateCandles(history?.rows ?? [], INTERVALS.find((item) => item.value === interval)?.seconds ?? 3600),
    [history, interval],
  );
  useEffect(() => {
    const element = host.current;
    if (!element || !rows.length) return;
    const style = getComputedStyle(element);
    function color(name: string) {
      return style.getPropertyValue(name).trim();
    }
    const instance = createChart(element, {
      autoSize: true,
      height: 390,
      layout: {
        background: { type: ColorType.Solid, color: color('--nest-background') },
        textColor: color('--nest-text-secondary'),
        fontFamily: color('--nest-font-mono'),
      },
      grid: { vertLines: { color: color('--nest-border') }, horzLines: { color: color('--nest-border') } },
      rightPriceScale: { borderColor: color('--nest-border') },
      timeScale: { timeVisible: true, secondsVisible: false, borderColor: color('--nest-border') },
      handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
    });
    const series = instance.addSeries(CandlestickSeries, {
      upColor: color('--nest-success'),
      downColor: color('--nest-error'),
      borderVisible: false,
      wickUpColor: color('--nest-success'),
      wickDownColor: color('--nest-error'),
      priceFormat: { type: 'price', precision: 6, minMove: 0.000001 },
    });
    series.setData(rows);
    instance.timeScale().fitContent();
    chart.current = instance;
    return () => {
      chart.current = null;
      instance.remove();
    };
  }, [rows]);

  useEffect(() => {
    const last = rows.at(-1);
    const previous = last ? rows.findLast((row) => row.time <= last.time - 86_400) : undefined;
    onContext?.(
      last
        ? {
            close: last.close,
            count: rows.length,
            changePct: previous && previous.close > 0 ? (last.close / previous.close - 1) * 100 : null,
          }
        : null,
    );
  }, [rows, onContext]);

  function zoom(factor: number) {
    const scale = chart.current?.timeScale();
    const range = scale?.getVisibleLogicalRange();
    if (!scale || !range) return;
    const middle = (range.from + range.to) / 2;
    const half = ((range.to - range.from) * factor) / 2;
    scale.setVisibleLogicalRange({ from: middle - half, to: middle + half });
  }

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
        <h2 className="text-lg font-semibold">
          {asset} / {unit} {INTERVALS.find((item) => item.value === interval)?.label} Candles
        </h2>
        <fieldset aria-label="Chart interval" className="flex gap-1">
          {INTERVALS.map((item) => (
            <Button
              key={item.seconds}
              size="sm"
              variant={interval === item.value ? 'secondary' : 'ghost'}
              aria-pressed={interval === item.value}
              onClick={() => setInterval(item.value)}
            >
              {item.label}
            </Button>
          ))}
        </fieldset>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
        <p className="font-mono text-[10px] text-subtle">
          {history
            ? `${history.source} · updated ${formatUtc(new Date(history.fetchedAt * 1000).toISOString())}`
            : 'Live network observations'}
        </p>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Zoom chart in"
            disabled={!history}
            onClick={() => zoom(0.75)}
          >
            <Plus />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Zoom chart out"
            disabled={!history}
            onClick={() => zoom(1.3)}
          >
            <Minus />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Fit chart history"
            disabled={!history}
            onClick={() => chart.current?.timeScale().fitContent()}
          >
            <Maximize />
          </Button>
        </div>
      </div>
      <div
        ref={host}
        role="img"
        aria-label={`${asset} live reference candlesticks in ${unit}; not an execution quote`}
        className={`h-[390px] min-w-0 ${live.isPlaceholderData ? 'opacity-50' : ''}`}
      >
        {!history ? (
          <p className="flex h-full items-center justify-center px-5 text-center text-sm text-muted-foreground">
            {failed
              ? 'Live price history is unavailable. Try another interval.'
              : live.data?.candles.length === 0
                ? 'No trades in this window. Try another interval.'
                : 'Loading live price history…'}
          </p>
        ) : null}
      </div>
      <p className="border-t px-5 py-3 text-[11px] leading-5 text-subtle">
        {history?.note} Reference trades include Stellar DEX and classic AMM activity. Get a fresh quote before trading.
      </p>
    </div>
  );
}
