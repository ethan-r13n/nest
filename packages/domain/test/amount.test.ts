import { describe, expect, it } from 'vitest';

import {
  AmountError,
  formatRawAmount,
  MAX_CLASSIC_RAW,
  MAX_SOROBAN_RAW,
  parseDecimalAmount,
  rawFromText,
  rawToText,
} from '../src/amount.ts';

describe('parseDecimalAmount', () => {
  it('converts decimals to raw units exactly', () => {
    expect(parseDecimalAmount('12.5', 7, MAX_CLASSIC_RAW)).toBe(125_000_000n);
    expect(parseDecimalAmount('0.0000001', 7, MAX_CLASSIC_RAW)).toBe(1n);
    expect(parseDecimalAmount('0', 7, MAX_CLASSIC_RAW)).toBe(0n);
    expect(parseDecimalAmount('42', 0, MAX_CLASSIC_RAW)).toBe(42n);
  });

  it.each(['', ' 1', '1 ', '-1', '+1', '1e3', '1E3', '01', '00.1', '.5', '5.', '1,000', '0x10', 'NaN', 'Infinity'])(
    'rejects non-canonical input %j',
    (text) => {
      expect(() => parseDecimalAmount(text, 7, MAX_CLASSIC_RAW)).toThrow(AmountError);
    },
  );

  it('rejects more fractional digits than the asset has instead of rounding', () => {
    expect(() => parseDecimalAmount('1.00000001', 7, MAX_CLASSIC_RAW)).toThrow(/more than 7 decimal places/);
  });

  it('enforces the raw ceiling at the boundary', () => {
    expect(parseDecimalAmount('922337203685.4775807', 7, MAX_CLASSIC_RAW)).toBe(MAX_CLASSIC_RAW);
    expect(() => parseDecimalAmount('922337203685.4775808', 7, MAX_CLASSIC_RAW)).toThrow(
      /larger than this asset allows/,
    );
    expect(parseDecimalAmount(MAX_SOROBAN_RAW.toString(), 0, MAX_SOROBAN_RAW)).toBe(MAX_SOROBAN_RAW);
  });

  it('rejects invalid decimals', () => {
    expect(() => parseDecimalAmount('1', -1, MAX_CLASSIC_RAW)).toThrow(AmountError);
    expect(() => parseDecimalAmount('1', 1.5, MAX_CLASSIC_RAW)).toThrow(AmountError);
    expect(() => parseDecimalAmount('1', 39, MAX_CLASSIC_RAW)).toThrow(AmountError);
  });
});

describe('formatRawAmount', () => {
  it('round-trips with parse for canonical decimals', () => {
    for (const text of ['0', '1', '12.5', '0.0000001', '922337203685.4775807', '100.25']) {
      expect(formatRawAmount(parseDecimalAmount(text, 7, MAX_CLASSIC_RAW), 7)).toBe(text);
    }
  });

  it('drops trailing fractional zeros', () => {
    expect(formatRawAmount(125_000_000n, 7)).toBe('12.5');
    expect(formatRawAmount(10_000_000n, 7)).toBe('1');
  });

  it('rejects negative raw amounts', () => {
    expect(() => formatRawAmount(-1n, 7)).toThrow(AmountError);
  });
});

describe('raw text storage', () => {
  it('round-trips through canonical text', () => {
    expect(rawFromText(rawToText(MAX_SOROBAN_RAW))).toBe(MAX_SOROBAN_RAW);
  });

  it.each(['', '-1', '01', '1.0', '1e3', ' 1'])('rejects stored value %j', (text) => {
    expect(() => rawFromText(text)).toThrow(AmountError);
  });
});
