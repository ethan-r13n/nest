import { env } from 'cloudflare:workers';
import { PoolV2 } from '@blend-capital/blend-sdk';
import { describe, expect, it } from 'vitest';

describe('Blend SDK in workerd', () => {
  it.skipIf(env.NEST_LIVE_TESTNET !== '1')('loads the Testnet V2 pool and its oracle', async () => {
    const network = { rpc: 'https://soroban-testnet.stellar.org', passphrase: 'Test SDF Network ; September 2015' };
    const pool = await PoolV2.load(network, 'CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF');
    const oracle = await pool.loadOracle();
    const usdc = pool.reserves.get('CAQCFVLOBK5GIULPNZRGATJJMIZL5BSP7X5YJVMGCPTUEPFM4AVSRCJU');
    console.log(
      JSON.stringify({
        name: pool.metadata.name,
        status: pool.metadata.status,
        supplyApy: usdc?.estSupplyApy,
        prices: oracle.prices.size,
      }),
    );
    expect(pool.metadata.status).toBeTypeOf('number');
    expect(usdc?.config.decimals).toBe(7);
  });
});
