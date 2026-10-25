const DECIMAL_PATTERN = /^(0|[1-9]\d*)(?:\.(\d+))?$/;
const RAW_PATTERN = /^(0|[1-9]\d*)$/;
const MAX_DECIMALS = 38;

/** Largest raw amount a Classic operation accepts: an int64 count of the asset's smallest unit. */
export const MAX_CLASSIC_RAW = 2n ** 63n - 1n;
/** Largest raw amount a Soroban token amount (i128) can carry. */
export const MAX_SOROBAN_RAW = 2n ** 127n - 1n;

export class AmountError extends Error {
  override name = 'AmountError';
}

/**
 * Converts a user-entered decimal string to raw units without rounding. Signs, exponents,
 * leading zeros, whitespace and more fractional digits than the asset has are rejected.
 */
export function parseDecimalAmount(text: string, decimals: number, maxRaw: bigint): bigint {
  assertDecimals(decimals);
  const match = DECIMAL_PATTERN.exec(text);
  if (!match) throw new AmountError('Amount must be a plain non-negative decimal, such as 12.5.');
  const whole = match[1] ?? '0';
  const fraction = match[2] ?? '';
  if (fraction.length > decimals) throw new AmountError(`Amount has more than ${decimals} decimal places.`);
  const raw = BigInt(whole + fraction.padEnd(decimals, '0'));
  if (raw > maxRaw) throw new AmountError('Amount is larger than this asset allows.');
  return raw;
}

/** The shortest exact decimal for a raw amount: no trailing fractional zeros. */
export function formatRawAmount(raw: bigint, decimals: number): string {
  assertDecimals(decimals);
  if (raw < 0n) throw new AmountError('Raw amounts are non-negative.');
  const digits = raw.toString().padStart(decimals + 1, '0');
  const whole = digits.slice(0, digits.length - decimals);
  const fraction = digits.slice(digits.length - decimals).replace(/0+$/, '');
  return fraction === '' ? whole : `${whole}.${fraction}`;
}

/** D1 cannot bind BigInt; raw amounts are stored as canonical decimal TEXT. */
export function rawToText(raw: bigint): string {
  if (raw < 0n) throw new AmountError('Raw amounts are non-negative.');
  return raw.toString();
}

export function rawFromText(text: string): bigint {
  if (!RAW_PATTERN.test(text)) throw new AmountError('Stored raw amount is not a canonical non-negative integer.');
  return BigInt(text);
}

function assertDecimals(decimals: number) {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > MAX_DECIMALS) {
    throw new AmountError(`Asset decimals must be an integer from 0 to ${MAX_DECIMALS}.`);
  }
}
