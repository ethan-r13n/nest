import { ARB_VENUES } from '@nest/adapters/amm/pools';
import { z } from 'zod';

/** An arbitrage monitor over the XLM/USDC pools of two venues. Units are in every field name. */
export const ArbitrageConfigSchema = z
  .strictObject({
    venues: z.tuple([z.enum(ARB_VENUES), z.enum(ARB_VENUES)]),
    /** The round trip the profit is measured on, in USDC. */
    sizeUsdc: z.string().regex(/^(0|[1-9]\d{0,6})(\.\d{1,7})?$/),
    /** Alert when the round trip's profit after pool fees reaches this. */
    thresholdBps: z.number().int().min(1).max(5_000),
    /** After an alert, wait at least this long before the next one. */
    cooldownMinutes: z.number().int().min(1).max(1_440),
    /** `once` stops after the first alert; `repeat` re-arms when the gap closes again. */
    mode: z.enum(['once', 'repeat']),
  })
  .refine((config) => config.venues[0] !== config.venues[1], { message: 'Choose two different pools.' })
  .refine((config) => Number(config.sizeUsdc) > 0, { message: 'Enter a trade size above zero.' });

export type ArbitrageConfig = z.infer<typeof ArbitrageConfigSchema>;

/** Checks run about once a minute: the scheduled handler's cadence. */
export const EVALUATION_INTERVAL_MS = 60_000;
