import type { CandlestickData, UTCTimestamp } from 'lightweight-charts';

export interface MarketHistory {
  rows: CandlestickData<UTCTimestamp>[];
  source: string;
  note: string;
  fetchedAt: number;
}

export function parseMarketHistory(value: unknown, asset: string): MarketHistory | null {
  if (!isRecord(value)) return null;
  const item = value[asset];
  if (!isRecord(item) || !Array.isArray(item.rows) || !item.rows.length || !item.rows.every(isCandle)) return null;
  if (
    typeof item.source !== 'string' ||
    typeof item.note !== 'string' ||
    typeof item.fetchedAt !== 'number' ||
    !Number.isSafeInteger(item.fetchedAt)
  )
    return null;
  const rows = item.rows;
  if (rows.some((row, index) => index > 0 && row.time <= (rows[index - 1]?.time ?? 0))) return null;
  return { rows, source: item.source, note: item.note, fetchedAt: item.fetchedAt };
}

export function aggregateCandles(
  rows: CandlestickData<UTCTimestamp>[],
  intervalSeconds: number,
): CandlestickData<UTCTimestamp>[] {
  const grouped: CandlestickData<UTCTimestamp>[] = [];
  let bucket: number | null = null;
  for (const row of rows) {
    const nextBucket = Math.floor(row.time / intervalSeconds);
    const previous = grouped.at(-1);
    if (nextBucket !== bucket || !previous) {
      grouped.push({ ...row });
      bucket = nextBucket;
    } else {
      previous.high = Math.max(previous.high, row.high);
      previous.low = Math.min(previous.low, row.low);
      previous.close = row.close;
    }
  }
  return grouped;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCandle(value: unknown): value is CandlestickData<UTCTimestamp> {
  if (
    !isRecord(value) ||
    typeof value.time !== 'number' ||
    !Number.isSafeInteger(value.time) ||
    value.time < 946684800 ||
    value.time > 4102444800
  )
    return false;
  const { open, high, low, close } = value;
  return (
    typeof open === 'number' &&
    Number.isFinite(open) &&
    open > 0 &&
    typeof high === 'number' &&
    Number.isFinite(high) &&
    high >= open &&
    typeof low === 'number' &&
    Number.isFinite(low) &&
    low > 0 &&
    low <= open &&
    typeof close === 'number' &&
    Number.isFinite(close) &&
    close > 0 &&
    close >= low &&
    close <= high
  );
}
