const USD_COMPACT = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 2,
});
const PERCENT = new Intl.NumberFormat('en-US', {
  style: 'percent',
  maximumFractionDigits: 2,
  signDisplay: 'exceptZero',
});
const TIMESTAMP = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
});

export const UNAVAILABLE = 'Unavailable';

export function formatUsd(value: number | null): string {
  return value === null ? UNAVAILABLE : USD_COMPACT.format(value);
}

/** Formats a value already expressed in percentage points, e.g. 3.73 → "+3.73%". */
export function formatPercentPoints(value: number | null): string {
  return value === null ? UNAVAILABLE : PERCENT.format(value / 100);
}

export function formatUtc(iso: string): string {
  return `${TIMESTAMP.format(new Date(iso))} UTC`;
}
