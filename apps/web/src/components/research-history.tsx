import { parseResearchHistory, type ResearchHistory } from '@nest/data/research';
import { Button } from '@nest/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@nest/ui/components/card';
import { Skeleton } from '@nest/ui/components/skeleton';
import { useEffect, useId, useState } from 'react';

import { formatUsd, formatUtc } from '../lib/format.ts';

const PERIODS = [30, 90, 365] as const;

export function ResearchHistoryChart() {
  const [history, setHistory] = useState<ResearchHistory | null>(null);
  const [failed, setFailed] = useState(false);
  const [metric, setMetric] = useState('tvl');
  const [days, setDays] = useState(90);
  const titleId = useId();
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
  const start = finalPoint ? finalPoint.timestamp - days * 86_400_000 : 0;
  const points = series?.points.filter((point) => point.timestamp >= start) ?? [];
  const values = points.map((point) => point.valueUsd);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = maximum - minimum || 1;
  const coordinates = points.map(
    (point, index) =>
      `${(index / Math.max(1, points.length - 1)) * 1000},${250 - ((point.valueUsd - minimum) / range) * 220}`,
  );
  return (
    <Card className="min-w-0">
      <CardHeader className="gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardDescription>DefiLlama · daily observations</CardDescription>
            <CardTitle className="mt-1 text-2xl">{series?.label ?? 'Stellar history'}</CardTitle>
          </div>
          <fieldset className="flex flex-wrap gap-1" aria-label="History period">
            {PERIODS.map((period) => (
              <Button
                key={period}
                size="sm"
                variant={days === period ? 'secondary' : 'ghost'}
                aria-pressed={days === period}
                onClick={() => setDays(period)}
              >
                {period === 365 ? '1Y' : `${period}D`}
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
              onClick={() => setMetric(item.id)}
            >
              {item.label}
            </Button>
          ))}
        </fieldset>
      </CardHeader>
      <CardContent>
        {!history && !failed ? (
          <Skeleton className="h-64 w-full" />
        ) : failed || points.length < 2 ? (
          <p className="flex h-64 items-center justify-center text-muted-foreground">History is unavailable.</p>
        ) : (
          <>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <strong className="font-mono text-2xl tabular-nums">{formatUsd(finalPoint?.valueUsd ?? null)}</strong>
              <span className="text-xs text-subtle">Latest daily observation · not a live quote</span>
            </div>
            <div className="flex gap-3">
              <div className="flex w-16 shrink-0 flex-col justify-between py-2 font-mono text-xs text-subtle">
                <span>{formatUsd(maximum)}</span>
                <span>{formatUsd(minimum)}</span>
              </div>
              <svg
                className="h-56 min-w-0 flex-1 overflow-visible"
                viewBox="0 0 1000 270"
                preserveAspectRatio="none"
                role="img"
                aria-labelledby={titleId}
              >
                <title id={titleId}>
                  {series?.label}, {points.length} dated daily observations in USD. Minimum {formatUsd(minimum)},
                  maximum {formatUsd(maximum)}.
                </title>
                <path
                  d="M0 15H1000 M0 130H1000 M0 250H1000"
                  className="stroke-border"
                  fill="none"
                  vectorEffect="non-scaling-stroke"
                />
                <path d={`M${coordinates.join(' L')} L1000,265 L0,265 Z`} className="fill-chart-1/10" />
                <polyline
                  points={coordinates.join(' ')}
                  className="stroke-chart-1"
                  fill="none"
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            </div>
            <div className="mt-2 flex justify-between gap-4 pl-19 font-mono text-xs text-subtle">
              <span>{dateLabel(points[0]?.timestamp)}</span>
              <span>{dateLabel(finalPoint?.timestamp)}</span>
            </div>
            <p className="mt-4 text-xs text-subtle">
              Captured {history ? formatUtc(history.capturedAt) : 'unavailable'}. Daily history can differ from headline
              cards because reporting times and definitions differ.
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
