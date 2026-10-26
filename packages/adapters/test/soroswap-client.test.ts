import { describe, expect, it } from 'vitest';

import { createSoroswapClient, SoroswapError } from '../src/soroswap/client.ts';
import { VenueRefusal } from '../src/venue.ts';

const BUILD = {
  network: 'mainnet',
  quote: {},
  from: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
} as const;

describe('Soroswap build preconditions', () => {
  it('maps only the exact trustline action to Nest recovery without using provider XDR', async () => {
    const calls: string[] = [];
    const client = createSoroswapClient({
      apiKey: 'test-placeholder',
      fetch: async (input) => {
        calls.push(String(input));
        return Response.json(
          { action: 'CREATE_TRUSTLINE', message: 'A trustline is missing.', actionData: { xdr: 'untrusted-payload' } },
          { status: 428 },
        );
      },
    });
    await expect(client.build(BUILD)).rejects.toMatchObject({
      name: 'VenueRefusal',
      code: 'TRUSTLINE_MISSING',
      message: 'Add the swap’s USDC trustline, then compare again.',
    });
    expect(calls).toEqual(['https://api.soroswap.finance/quote/build?network=mainnet']);
  });

  it.each([
    { status: 428, response: JSON.stringify({ action: 'OTHER_PRECONDITION' }) },
    { status: 428, response: JSON.stringify({ action: 'CREATE_TRUSTLINE_AND_TRANSFER' }) },
    { status: 428, response: JSON.stringify({ message: 'CREATE_TRUSTLINE' }) },
    { status: 428, response: JSON.stringify({ action: 42 }) },
    { status: 428, response: 'not JSON CREATE_TRUSTLINE' },
    { status: 400, response: JSON.stringify({ action: 'CREATE_TRUSTLINE' }) },
  ])('keeps unrelated or malformed errors as provider failures: $status $response', async ({ status, response }) => {
    const client = createSoroswapClient({
      apiKey: 'test-placeholder',
      fetch: async () => new Response(response, { status }),
    });
    try {
      await client.build(BUILD);
      expect.fail('The failed build must not return a transaction.');
    } catch (error) {
      expect(error).toBeInstanceOf(SoroswapError);
      expect(error).not.toBeInstanceOf(VenueRefusal);
      expect(error).toMatchObject({ status });
    }
  });

  it('does not interpret a quote error as a wallet trustline action', async () => {
    const client = createSoroswapClient({
      apiKey: 'test-placeholder',
      fetch: async () => Response.json({ action: 'CREATE_TRUSTLINE' }, { status: 428 }),
    });
    await expect(
      client.quote({ network: 'mainnet', assetIn: 'XLM', assetOut: 'USDC', amountIn: 1n, slippageBps: 50 }),
    ).rejects.toBeInstanceOf(SoroswapError);
  });
});
