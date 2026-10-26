import { parseResearchHistory, type ResearchHistory } from '@nest/data/research';
import { Button } from '@nest/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@nest/ui/components/card';
import { Skeleton } from '@nest/ui/components/skeleton';
import { useEffect, useId, useState } from 'react';

import { formatUsd, formatUtc } from '../lib/format.ts';

const PERIODS = [30, 90, 365, 0] as const;

export function ResearchHistoryChart() {
  const [history, setHistory] = useState<ResearchHistory | null>(null);
  const [failed, setFailed] = useState(false);
  const [metric, setMetric] = useState('tvl');
  const [days, setDays] = useState(90);
  const [inspection, setInspection] = useState<number | null>(null);
  const titleId = useId();
  const gradientId = useId();
  useEffect(() => {
    let active = true;
    import('../../../../research/data/defillama-stellar.json')
      .then((module) => parseResearchHistory(module.default))
      .then((data) => {
        if (active) setHistory(data);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);
  const series = history?.series.find((item) => item.id === metric);
  const finalPoint = series?.points.at(-1);
  const start = finalPoint && days ? finalPoint.timestamp - days * 86_400_000 : 0;
  const points = series?.points.filter((point) => point.timestamp >= start) ?? [];
  const selected = points[inspection ?? points.length - 1];
  const values = points.map((point) => point.valueUsd);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = maximum - minimum || 1;
  const coordinates = points.map(
    (point, index) =>
      `${(index / Math.max(1, points.length - 1)) * 1000},${155 - ((point.valueUsd - minimum) / range) * 130}`,
  );
  return (
    <Card className="research-history-panel min-w-0">
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="flex flex-wrap items-baseline gap-3">
            <CardTitle>{metric === 'tvl' ? 'Total value locked' : (series?.label ?? 'Stellar history')}</CardTitle>
            <strong className="font-mono text-xl font-normal tabular-nums">
              {formatUsd(selected?.valueUsd ?? null)}
            </strong>
            <span className="text-[10px] text-subtle">Daily observation · not a live quote</span>
          </div>
          <fieldset className="flex flex-wrap gap-1" aria-label="History period">
            {PERIODS.map((period) => (
              <Button
                key={period}
                size="sm"
                variant={days === period ? 'secondary' : 'ghost'}
                aria-pressed={days === period}
                onClick={() => {
                  setDays(period);
                  setInspection(null);
                }}
              >
                {period === 0 ? 'ALL' : period === 365 ? '1Y' : period === 90 ? '3M' : '1M'}
              </Button>
            ))}
          </fieldset>
        </div>
        <fieldset className="flex flex-wrap gap-1" aria-label="History metric">
          {history?.series.map((item) => (
            <Button
              key={item.id}
              variant={metric === item.id ? 'secondary' : 'ghost'}
              size="sm"
              aria-pressed={metric === item.id}
              onClick={() => {
                setMetric(item.id);
                setInspection(null);
              }}
            >
              {item.id === 'tvl' ? 'TVL' : item.label}
            </Button>
          ))}
        </fieldset>
      </CardHeader>
      <CardContent>
        {!history && !failed ? (
          <Skeleton className="h-44 w-full" />
        ) : failed || points.length < 2 ? (
          <p className="flex h-44 items-center justify-center text-muted-foreground">History is unavailable.</p>
        ) : (
          <>
            <div className="flex gap-3">
              <div className="flex w-16 shrink-0 flex-col justify-between py-4 font-mono text-[10px] text-subtle">
                <span>{formatUsd(maximum)}</span>
                <span>{formatUsd((minimum + maximum) / 2)}</span>
                <span>{formatUsd(minimum)}</span>
              </div>
              <svg
                className="h-44 min-w-0 flex-1 overflow-visible"
                viewBox="0 0 1000 170"
                preserveAspectRatio="none"
                role="img"
                aria-labelledby={titleId}
                onMouseMove={(event) => {
                  const bounds = event.currentTarget.getBoundingClientRect();
                  setInspection(
                    Math.max(
                      0,
                      Math.min(
                        points.length - 1,
                        Math.round(((event.clientX - bounds.left) / bounds.width) * (points.length - 1)),
                      ),
                    ),
                  );
                }}
                onMouseLeave={() => setInspection(null)}
              >
                <title id={titleId}>
                  {series?.label}, {points.length} dated daily observations in USD. Minimum {formatUsd(minimum)},
                  maximum {formatUsd(maximum)}.
                </title>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.14" />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path
                  d="M0 25H1000 M0 90H1000 M0 155H1000"
                  className="stroke-border"
                  fill="none"
                  vectorEffect="non-scaling-stroke"
                />
                <path d={`M${coordinates.join(' L')} L1000,170 L0,170 Z`} fill={`url(#${gradientId})`} />
                <polyline
                  points={coordinates.join(' ')}
                  className="stroke-primary"
                  fill="none"
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            </div>
            <div className="mt-1 flex justify-between gap-4 pl-19 font-mono text-[10px] text-subtle">
              <span>{dateLabel(points[0]?.timestamp)}</span>
              <span>{dateLabel(finalPoint?.timestamp)}</span>
            </div>
            <p className="mt-3 font-mono text-[10px] text-subtle">
              {dateLabel(selected?.timestamp)} · {formatUsd(selected?.valueUsd ?? null)}
            </p>
            <p className="mt-2 border-t pt-2 text-[10px] leading-5 text-subtle">
              Captured {history ? formatUtc(history.capturedAt) : 'unavailable'}. Chart and headline totals may differ
              in timing and definition.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function dateLabel(timestamp: number | undefined) {
  return timestamp === undefined
    ? 'Unavailable'
    : new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
        new Date(timestamp),
      );
}
