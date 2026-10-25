import { z } from 'zod';

import { NetworkIdSchema } from './network.ts';

const ACCOUNT_ID = /^G[A-Z2-7]{55}$/;
const CONTRACT_ID = /^C[A-Z2-7]{55}$/;
const ASSET_CODE = /^[A-Za-z0-9]{1,12}$/;
const RAW_AMOUNT = /^(0|[1-9]\d*)$/;

/**
 * An asset's identity as resolved from a verified registry, never from a ticker alone.
 * `canonicalId` is `XLM`, `CODE:ISSUER` for Classic assets, or a contract ID.
 */
export const AssetRefSchema = z.strictObject({
  network: NetworkIdSchema,
  canonicalId: z.string().min(1),
  contractId: z.string().regex(CONTRACT_ID).optional(),
  code: z.string().regex(ASSET_CODE).optional(),
  issuer: z.string().regex(ACCOUNT_ID).optional(),
  decimals: z.int().min(0).max(38),
});

export const AmountSchema = z.strictObject({
  asset: AssetRefSchema,
  amountRaw: z.string().regex(RAW_AMOUNT),
});

export type AssetRef = z.infer<typeof AssetRefSchema>;
export type Amount = z.infer<typeof AmountSchema>;
