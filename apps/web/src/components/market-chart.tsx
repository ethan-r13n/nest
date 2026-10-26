import { Button } from '@nest/ui/components/button';
import { CandlestickSeries, ColorType, createChart, type IChartApi } from 'lightweight-charts';
import { Maximize, Minus, Plus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { formatUtc } from '../lib/format.ts';
import { aggregateCandles, type MarketHistory, parseMarketHistory } from '../lib/market-history.ts';

const INTERVALS = [
  { label: '1H', seconds: 3600 },
  { label: '4H', seconds: 14400 },
  { label: '1D', seconds: 86400 },
];

export function MarketChart({ asset }: { asset: string }) {
  const [history, setHistory] = useState<MarketHistory | null>(null);
  const [failed, setFailed] = useState(false);
  const [interval, setInterval] = useState(3600);
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const rows = useMemo(() => aggregateCandles(history?.rows ?? [], interval), [history, interval]);
  useEffect(() => {
    let active = true;
    setHistory(null);
    setFailed(false);
    import('../../../../design/nest/ui/trade-market-history.json')
      .then((module) => {
        const parsed = parseMarketHistory(module.default, asset);
        if (active) {
          setHistory(parsed);
          setFailed(!parsed);
        }
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [asset]);
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
        <h2 className="text-sm font-semibold">
          {asset} / USDC <span className="ml-2 font-mono text-[10px] text-subtle">Reference history</span>
        </h2>
        <fieldset aria-label="Chart interval" className="flex gap-1">
          {INTERVALS.map((item) => (
            <Button
              key={item.seconds}
              size="sm"
              variant={interval === item.seconds ? 'secondary' : 'ghost'}
              aria-pressed={interval === item.seconds}
              onClick={() => setInterval(item.seconds)}
            >
              {item.label}
            </Button>
          ))}
        </fieldset>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
        <p className="font-mono text-[10px] text-subtle">
          {history
            ? `${history.source} · captured ${formatUtc(new Date(history.fetchedAt * 1000).toISOString())}`
            : 'Historical observations'}
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
        aria-label={`${asset} captured reference candlesticks in USDC; not a live execution quote`}
        className="h-[390px] min-w-0"
      >
        {!history ? (
          <p className="flex h-full items-center justify-center px-5 text-center text-sm text-muted-foreground">
            {failed ? 'Verified history is unavailable for this asset.' : 'Loading price history…'}
          </p>
        ) : null}
      </div>
      <p className="border-t px-5 py-3 text-[11px] leading-5 text-subtle">
        {history?.note} Captured Mainnet context, independent of your execution network. Get a fresh quote before
        trading.
      </p>
    </div>
  );
}
