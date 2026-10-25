import { describe, expect, it } from 'vitest';

import { AmountSchema, AssetRefSchema } from '../src/asset.ts';
import { networkId } from '../src/network.ts';

const USDC_ISSUER = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';

describe('AssetRefSchema', () => {
  it('accepts a Classic asset with an issuer', () => {
    const asset = AssetRefSchema.parse({
      network: networkId('mainnet'),
      canonicalId: `USDC:${USDC_ISSUER}`,
      code: 'USDC',
      issuer: USDC_ISSUER,
      decimals: 7,
    });
    expect(asset.network).toBe('stellar-mainnet');
  });

  it('rejects unknown fields and malformed identities', () => {
    expect(() =>
      AssetRefSchema.parse({ network: 'stellar-mainnet', canonicalId: 'XLM', decimals: 7, ticker: 'XLM' }),
    ).toThrow();
    expect(() =>
      AssetRefSchema.parse({ network: 'stellar-mainnet', canonicalId: 'X', issuer: 'not-an-account', decimals: 7 }),
    ).toThrow();
    expect(() => AssetRefSchema.parse({ network: 'mainnet', canonicalId: 'XLM', decimals: 7 })).toThrow();
  });
});

describe('AmountSchema', () => {
  it('requires a canonical raw integer string', () => {
    const asset = { network: 'stellar-testnet', canonicalId: 'XLM', decimals: 7 };
    expect(AmountSchema.parse({ asset, amountRaw: '10000000' }).amountRaw).toBe('10000000');
    for (const amountRaw of ['1.5', '-1', '01', '1e7', '']) {
      expect(() => AmountSchema.parse({ asset, amountRaw })).toThrow();
    }
  });
});
