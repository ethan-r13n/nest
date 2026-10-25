import { Keypair, TransactionBuilder } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';

import { swapAsset } from '../src/stellar/assets.ts';
import { inspectSwapTransaction } from '../src/stellar/inspect.ts';
import { NETWORK_PASSPHRASES } from '../src/stellar/networks.ts';
import { createSdexVenue } from '../src/stellar/sdex.ts';
import { VenueRefusal } from '../src/venue.ts';

const NOW_MS = 1_800_000_000_000;
const user = Keypair.random();
const xlm = swapAsset('testnet', 'XLM');
const usdc = swapAsset('testnet', 'USDC');
const usdcBalance = {
  asset_type: 'credit_alphanum4',
  asset_code: 'USDC',
  asset_issuer: usdc.ref.issuer,
  balance: '5.0000000',
};

function horizon(routes: Record<string, unknown>) {
  const calls: string[] = [];
  const fetchFake = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    calls.push(url.pathname);
    for (const [prefix, body] of Object.entries(routes)) {
      if (url.pathname.startsWith(prefix))
        return new Response(JSON.stringify(body), { status: body === 404 ? 404 : 200 });
    }
    return new Response('{}', { status: 404 });
  }) as typeof fetch;
  return { fetchFake, calls };
}

const paths = (records: { source_amount: string; destination_amount: string }[]) => ({
  _embedded: { records: records.map((record) => ({ ...record, path: [] })) },
});
const account = (balances: unknown[], subentries = 1) => ({ sequence: '100', subentry_count: subentries, balances });

async function quoteAndBuild(accountBody: unknown) {
  const { fetchFake } = horizon({
    '/paths/strict-send': paths([
      { source_amount: '10.0000000', destination_amount: '8.0000000' },
      { source_amount: '10.0000000', destination_amount: '8.7052497' },
    ]),
    '/accounts/': accountBody,
  });
  const venue = createSdexVenue({ network: 'testnet', fetch: fetchFake, now: () => NOW_MS });
  const quote = await venue.quote({
    network: 'testnet',
    sell: xlm,
    buy: usdc,
    amountIn: 100_000_000n,
    slippageBps: 50,
  });
  return { venue, quote, build: () => venue.build({ network: 'testnet', quote: quote.raw, from: user.publicKey() }) };
}

describe('Stellar DEX venue', () => {
  it('quotes the best path for the exact amount and applies slippage to the minimum', async () => {
    const { quote } = await quoteAndBuild(account([{ asset_type: 'native', balance: '100.0000000' }, usdcBalance]));
    expect(quote).toMatchObject({
      amountIn: 100_000_000n,
      amountOut: 87_052_497n,
      minAmountOut: 86_617_234n,
      platform: 'sdex',
      priceImpactBps: null,
    });
  });

  it('builds one path payment that the inspector accepts', async () => {
    const { quote, build } = await quoteAndBuild(
      account([{ asset_type: 'native', balance: '100.0000000' }, usdcBalance]),
    );
    const xdrText = await build();
    const inspected = inspectSwapTransaction(xdrText, {
      network: 'testnet',
      account: user.publicKey(),
      sell: xlm,
      buy: usdc,
      amountIn: quote.amountIn,
      minAmountOut: quote.minAmountOut,
      maxFeeStroops: 10_000_000n,
      nowSeconds: NOW_MS / 1000,
    });
    expect(inspected).toMatchObject({
      route: 'classic',
      amountIn: 100_000_000n,
      minAmountOut: 86_617_234n,
      providerFee: 0n,
    });
    expect(TransactionBuilder.fromXDR(xdrText, NETWORK_PASSPHRASES.testnet).fee).toBe('10000');
  });

  it.each([
    [
      'a missing trustline for the bought asset',
      account([{ asset_type: 'native', balance: '100.0000000' }]),
      'TRUSTLINE_MISSING',
    ],
    [
      'spending into the XLM reserve',
      account([{ asset_type: 'native', balance: '10.5000000' }, usdcBalance]),
      'INSUFFICIENT_BALANCE',
    ],
    ['an unfunded account', 404, 'ACCOUNT_NOT_FOUND'],
  ])('refuses %s before anything is signed', async (_name, accountBody, code) => {
    const { build } = await quoteAndBuild(accountBody);
    await expect(build()).rejects.toMatchObject({ name: 'VenueRefusal', code });
  });

  it('reports no route as a refusal', async () => {
    const { fetchFake } = horizon({ '/paths/strict-send': paths([]) });
    const venue = createSdexVenue({ network: 'testnet', fetch: fetchFake });
    await expect(
      venue.quote({ network: 'testnet', sell: xlm, buy: usdc, amountIn: 1n, slippageBps: 50 }),
    ).rejects.toBeInstanceOf(VenueRefusal);
  });

  it('reads the received amount from the confirmed path payment', async () => {
    const { fetchFake } = horizon({
      '/transactions/': { _embedded: { records: [{ type: 'path_payment_strict_send', amount: '8.7052497' }] } },
    });
    const venue = createSdexVenue({ network: 'testnet', fetch: fetchFake });
    expect(await venue.receivedAmount?.('ab'.repeat(32))).toBe(87_052_497n);
  });
});
