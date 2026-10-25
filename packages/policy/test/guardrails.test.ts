import { describe, expect, it } from 'vitest';

import { GuardrailsSchema, SUGGESTED_GUARDRAILS } from '../src/guardrails.ts';

const saved = {
  slippageBps: 50,
  priceImpactWarningBps: 100,
  quoteMaxAgeSeconds: 30,
  customFeeCeilings: null,
  lendingByMetric: { 'blend.health_factor': { hardMinimum: null, warnBelow: '1.5' } },
  maxDataAgeSecondsBySource: { 'soroswap.quote': 30 },
  optionalCaps: { funding: null, perActionSpend: null, cumulativeSpend: null, dailyTurnover: null, borrowing: null },
};

describe('GuardrailsSchema', () => {
  it('accepts a saved revision with every optional cap disabled', () => {
    expect(GuardrailsSchema.parse(saved).optionalCaps.perActionSpend).toBeNull();
  });

  it('rejects unknown fields, out-of-range basis points and float amounts', () => {
    expect(() => GuardrailsSchema.parse({ ...saved, maxLeverage: 3 })).toThrow();
    expect(() => GuardrailsSchema.parse({ ...saved, slippageBps: 10_001 })).toThrow();
    expect(() => GuardrailsSchema.parse({ ...saved, slippageBps: 0.5 })).toThrow();
    expect(() =>
      GuardrailsSchema.parse({
        ...saved,
        optionalCaps: { ...saved.optionalCaps, perActionSpend: { assetCanonicalId: 'XLM', maxRaw: '10.5' } },
      }),
    ).toThrow();
  });

  it('treats a missing cap as an error rather than silently disabling it', () => {
    const { borrowing: _borrowing, ...caps } = saved.optionalCaps;
    expect(() => GuardrailsSchema.parse({ ...saved, optionalCaps: caps })).toThrow();
  });
});

describe('SUGGESTED_GUARDRAILS', () => {
  it('is marked as a suggestion, not a saved revision', () => {
    expect(SUGGESTED_GUARDRAILS.status).toBe('suggested');
    expect(GuardrailsSchema.safeParse(SUGGESTED_GUARDRAILS.values).success).toBe(false);
  });
});
