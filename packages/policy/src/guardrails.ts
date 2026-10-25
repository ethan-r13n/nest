import { z } from 'zod';

const BPS = z.int().min(0).max(10_000);
const RAW_AMOUNT = z.string().regex(/^(0|[1-9]\d*)$/);
const DECIMAL = z.string().regex(/^(0|[1-9]\d*)(\.\d+)?$/);
const IDENTIFIER = z.string().regex(/^[a-z0-9][a-z0-9._:-]{0,127}$/i);

const AmountCapSchema = z.strictObject({
  assetCanonicalId: z.string().min(1),
  maxRaw: RAW_AMOUNT,
});

/**
 * A user's saved Guardrails revision. Missing optional caps are disabled, never zero; chain and
 * venue requirements still apply on top of whatever is saved here.
 */
export const GuardrailsSchema = z.strictObject({
  slippageBps: BPS,
  priceImpactWarningBps: BPS.nullable(),
  quoteMaxAgeSeconds: z.int().min(1).max(3_600),
  customFeeCeilings: z.array(AmountCapSchema).nullable(),
  lendingByMetric: z.record(
    IDENTIFIER,
    z.strictObject({
      hardMinimum: DECIMAL.nullable(),
      warnBelow: DECIMAL.nullable(),
    }),
  ),
  maxDataAgeSecondsBySource: z.record(IDENTIFIER, z.int().min(1)),
  optionalCaps: z.strictObject({
    funding: AmountCapSchema.nullable(),
    perActionSpend: AmountCapSchema.nullable(),
    cumulativeSpend: AmountCapSchema.nullable(),
    dailyTurnover: AmountCapSchema.nullable(),
    borrowing: AmountCapSchema.nullable(),
  }),
});

export type Guardrails = z.infer<typeof GuardrailsSchema>;

/**
 * Proposed starting values from the spec. They are shown as "Suggested · not yet confirmed"
 * and only take effect once the user saves them; nothing applies them on load.
 */
export const SUGGESTED_GUARDRAILS = {
  status: 'suggested',
  values: {
    slippageBps: 50,
    priceImpactWarningBps: 100,
    quoteMaxAgeSeconds: 30,
    healthFactorWarnBelow: '1.5',
  },
} as const;
