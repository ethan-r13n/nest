import { Account, Asset, Keypair, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';

import { InspectionError } from '../src/stellar/inspect.ts';
import { NETWORK_PASSPHRASES } from '../src/stellar/networks.ts';
import { buildTrustline, inspectTrustline } from '../src/stellar/trustline.ts';

const NOW_MS = 1_800_000_000_000;
const user = Keypair.random();
const stranger = Keypair.random();
const usdc = new Asset('USDC', 'GATALTGTWIOT6BUDBCZM3Q4OQ4BO2COLOAZ7IYSKPLC2PMSOPPGF5V56');
const other = new Asset('USDC', 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5');

function horizon(balances: { asset_type: string; asset_code?: string; asset_issuer?: string }[]): typeof fetch {
  return async () =>
    Response.json({
      sequence: '100',
      subentry_count: 0,
      balances: balances.map((balance) => ({ balance: '1000.0000000', ...balance })),
    });
}

function changeTrust(o: { asset?: Asset; limit?: string; source?: string; fee?: string; extra?: boolean } = {}) {
  const builder = new TransactionBuilder(new Account(user.publicKey(), '100'), {
    fee: o.fee ?? '10000',
    networkPassphrase: NETWORK_PASSPHRASES.testnet,
    timebounds: { minTime: 0, maxTime: NOW_MS / 1000 + 180 },
  }).addOperation(
    Operation.changeTrust({
      asset: o.asset ?? usdc,
      ...(o.limit ? { limit: o.limit } : {}),
      ...(o.source ? { source: o.source } : {}),
    }),
  );
  if (o.extra) builder.addOperation(Operation.bumpSequence({ bumpTo: '200' }));
  return builder.build().toXDR();
}

function codeOf(xdrText: string): string {
  try {
    inspectTrustline(xdrText, {
      network: 'testnet',
      account: user.publicKey(),
      asset: usdc,
      nowSeconds: NOW_MS / 1000,
    });
  } catch (error) {
    if (error instanceof InspectionError) return error.code;
    throw error;
  }
  return 'ACCEPTED';
}

describe('trustline', () => {
  it('builds a change-trust the inspector accepts', async () => {
    const built = await buildTrustline({
      network: 'testnet',
      account: user.publicKey(),
      asset: usdc,
      nowMs: NOW_MS,
      fetch: horizon([{ asset_type: 'native' }]),
    });
    expect(codeOf(built.xdr)).toBe('ACCEPTED');
    expect(built.hash).toHaveLength(64);
  });

  it('refuses when the account already trusts the asset', async () => {
    await expect(
      buildTrustline({
        network: 'testnet',
        account: user.publicKey(),
        asset: usdc,
        nowMs: NOW_MS,
        fetch: horizon([
          { asset_type: 'native' },
          {
            asset_type: 'credit_alphanum4',
            asset_code: 'USDC',
            asset_issuer: 'GATALTGTWIOT6BUDBCZM3Q4OQ4BO2COLOAZ7IYSKPLC2PMSOPPGF5V56',
          },
        ]),
      }),
    ).rejects.toThrow('already holds USDC');
  });

  it.each([
    ['another asset', { asset: other }, 'ASSET_MISMATCH'],
    ['a removal (zero limit)', { limit: '0' }, 'LIMIT_MISMATCH'],
    ['a capped limit', { limit: '5' }, 'LIMIT_MISMATCH'],
    ['an operation for another account', { source: stranger.publicKey() }, 'SOURCE_MISMATCH'],
    ['an extra operation', { extra: true }, 'OPERATION_COUNT'],
    ['a high fee', { fee: '200000' }, 'FEE_ABOVE_LIMIT'],
  ] as const)('blocks %s', (_name, overrides, code) => {
    expect(codeOf(changeTrust(overrides))).toBe(code);
  });
});
