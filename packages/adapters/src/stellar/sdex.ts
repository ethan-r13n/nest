import { formatRawAmount, MAX_CLASSIC_RAW, parseDecimalAmount } from '@nest/domain/amount';
import type { StellarNetwork } from '@nest/domain/network';
import { Account, Asset, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import { z } from 'zod';

import { type SwapVenue, VenueRefusal } from '../venue.ts';
import { NETWORK_PASSPHRASES } from './networks.ts';

/**
 * Stellar's built-in DEX through Horizon: path finding and account reads are Classic data the RPC
 * does not serve. Used where Soroswap's API has no routes, which today is Testnet.
 */
const HORIZON_URLS: Record<StellarNetwork, string> = {
  mainnet: 'https://horizon.stellar.org',
  testnet: 'https://horizon-testnet.stellar.org',
};
const TIMEOUT_MS = 15_000;
const DECIMALS = 7;
/** 0.001 XLM: well above the base fee for one operation. */
const FEE_STROOPS = '10000';
const VALIDITY_SECONDS = 180;
// Each account must keep 0.5 XLM per base entry and subentry; spending into the reserve fails.
const BASE_RESERVE_RAW = 5_000_000n;

const PathAsset = z.looseObject({
  asset_type: z.string(),
  asset_code: z.string().optional(),
  asset_issuer: z.string().optional(),
});
const PathsSchema = z.looseObject({
  _embedded: z.looseObject({
    records: z.array(
      z.looseObject({ source_amount: z.string(), destination_amount: z.string(), path: z.array(PathAsset) }),
    ),
  }),
});
const AccountSchema = z.looseObject({
  sequence: z.string(),
  subentry_count: z.number().int().nonnegative(),
  num_sponsoring: z.number().int().nonnegative().optional(),
  num_sponsored: z.number().int().nonnegative().optional(),
  balances: z.array(
    z.looseObject({
      asset_type: z.string(),
      asset_code: z.string().optional(),
      asset_issuer: z.string().optional(),
      balance: z.string(),
    }),
  ),
});

export function createSdexVenue(options: {
  network: StellarNetwork;
  fetch?: typeof fetch;
  now?: () => number;
}): SwapVenue {
  const send = options.fetch ?? fetch;
  const horizon = HORIZON_URLS[options.network];
  const now = options.now ?? Date.now;

  async function get(path: string): Promise<{ status: number; body: unknown }> {
    const response = await send(`${horizon}${path}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    return { status: response.status, body: await response.json().catch(() => null) };
  }

  return {
    id: 'sdex',

    async quote({ sell, buy, amountIn, slippageBps }) {
      const query = new URLSearchParams({
        ...assetParams('source', sell.classic),
        source_amount: formatRawAmount(amountIn, DECIMALS),
      });
      query.set('destination_assets', assetId(buy.classic));
      const { status, body } = await get(`/paths/strict-send?${query}`);
      const parsed = PathsSchema.safeParse(body);
      if (status !== 200 || !parsed.success) throw new Error(`Horizon path finding answered ${status}.`);
      const best = parsed.data._embedded.records
        .map((record) => ({ record, out: parseDecimalAmount(record.destination_amount, DECIMALS, MAX_CLASSIC_RAW) }))
        .filter(({ record }) => parseDecimalAmount(record.source_amount, DECIMALS, MAX_CLASSIC_RAW) === amountIn)
        .sort((left, right) => (right.out > left.out ? 1 : right.out < left.out ? -1 : 0))[0];
      if (!best || best.out === 0n)
        throw new VenueRefusal('NO_ROUTE', 'Stellar’s DEX has no route for this swap right now.');
      const minAmountOut = (best.out * BigInt(10_000 - slippageBps)) / 10_000n;
      return {
        amountIn,
        amountOut: best.out,
        minAmountOut,
        priceImpactBps: null,
        platform: 'sdex',
        protocols: ['sdex'],
        raw: {
          amountInRaw: amountIn.toString(),
          minAmountOutRaw: minAmountOut.toString(),
          path: best.record.path,
          sell: assetId(sell.classic),
          buy: assetId(buy.classic),
        },
      };
    },

    async build({ network, quote, from }) {
      const raw = z
        .object({
          amountInRaw: z.string(),
          minAmountOutRaw: z.string(),
          path: z.array(PathAsset),
          sell: z.string(),
          buy: z.string(),
        })
        .parse(quote);
      const { status, body } = await get(`/accounts/${from}`);
      if (status === 404)
        throw new VenueRefusal('ACCOUNT_NOT_FOUND', 'This account does not exist on this network yet. Fund it first.');
      const account = AccountSchema.safeParse(body);
      if (status !== 200 || !account.success) throw new Error(`Horizon account read answered ${status}.`);
      const sell = assetFromId(raw.sell);
      const buy = assetFromId(raw.buy);
      const amountIn = BigInt(raw.amountInRaw);
      checkFunds(account.data, sell, buy, amountIn);

      const tx = new TransactionBuilder(new Account(from, account.data.sequence), {
        fee: FEE_STROOPS,
        networkPassphrase: NETWORK_PASSPHRASES[network],
        timebounds: { minTime: 0, maxTime: Math.floor(now() / 1000) + VALIDITY_SECONDS },
      })
        .addOperation(
          Operation.pathPaymentStrictSend({
            sendAsset: sell,
            sendAmount: formatRawAmount(amountIn, DECIMALS),
            destination: from,
            destAsset: buy,
            destMin: formatRawAmount(BigInt(raw.minAmountOutRaw), DECIMALS),
            path: raw.path.map((asset) => assetFromRecord(asset)),
          }),
        )
        .build();
      return tx.toXDR();
    },

    async receivedAmount(txHash) {
      const { status, body } = await get(`/transactions/${txHash}/operations`);
      const record = (body as { _embedded?: { records?: { type?: string; amount?: string }[] } } | null)?._embedded
        ?.records?.[0];
      if (status !== 200 || record?.type !== 'path_payment_strict_send' || !record.amount) return null;
      return parseDecimalAmount(record.amount, DECIMALS, MAX_CLASSIC_RAW);
    },
  };
}

/** Refuses before signing what would fail on chain: a missing trustline or too little balance. */
function checkFunds(account: z.infer<typeof AccountSchema>, sell: Asset, buy: Asset, amountIn: bigint): void {
  const balanceOf = (asset: Asset) =>
    account.balances.find((balance) =>
      asset.isNative()
        ? balance.asset_type === 'native'
        : balance.asset_code === asset.getCode() && balance.asset_issuer === asset.getIssuer(),
    );
  if (!buy.isNative() && !balanceOf(buy)) {
    throw new VenueRefusal('TRUSTLINE_MISSING', `Add ${buy.getCode()} to your wallet before buying it.`);
  }
  const held = balanceOf(sell);
  if (!held)
    throw new VenueRefusal(
      'INSUFFICIENT_BALANCE',
      `This account holds no ${sell.isNative() ? 'XLM' : sell.getCode()}.`,
    );
  let available = parseDecimalAmount(held.balance, DECIMALS, MAX_CLASSIC_RAW);
  if (sell.isNative()) {
    const entries =
      2n + BigInt(account.subentry_count) + BigInt(account.num_sponsoring ?? 0) - BigInt(account.num_sponsored ?? 0);
    available -= entries * BASE_RESERVE_RAW + BigInt(FEE_STROOPS);
  }
  if (amountIn > available) {
    throw new VenueRefusal(
      'INSUFFICIENT_BALANCE',
      'This account does not hold enough to sell that amount (after the XLM reserve).',
    );
  }
}

function assetId(asset: Asset): string {
  return asset.isNative() ? 'native' : `${asset.getCode()}:${asset.getIssuer()}`;
}

function assetParams(prefix: string, asset: Asset): Record<string, string> {
  if (asset.isNative()) return { [`${prefix}_asset_type`]: 'native' };
  return {
    [`${prefix}_asset_type`]: asset.getCode().length <= 4 ? 'credit_alphanum4' : 'credit_alphanum12',
    [`${prefix}_asset_code`]: asset.getCode(),
    [`${prefix}_asset_issuer`]: asset.getIssuer() ?? '',
  };
}

function assetFromId(id: string): Asset {
  return assetFromRecord(
    id === 'native'
      ? { asset_type: 'native' }
      : { asset_type: 'credit', asset_code: id.split(':')[0], asset_issuer: id.split(':')[1] },
  );
}

function assetFromRecord(record: z.infer<typeof PathAsset>): Asset {
  if (record.asset_type === 'native') return Asset.native();
  if (!record.asset_code || !record.asset_issuer) throw new Error('Path asset without code or issuer.');
  return new Asset(record.asset_code, record.asset_issuer);
}
