import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';

import { readAquariusPools } from '../packages/adapters/src/aquarius/client.ts';

const network = process.argv.includes('--testnet') ? 'testnet' : 'mainnet';
const snapshot = await readAquariusPools(
  network,
  AbortSignal.timeout(45_000),
  process.argv.includes('--curl') ? curlRequest : fetch,
);
await mkdir('research/data', { recursive: true });
await writeFile(
  `research/data/aquarius-pools${network === 'testnet' ? '-testnet' : ''}.json`,
  `${JSON.stringify(snapshot, null, 2)}\n`,
);
console.log(
  JSON.stringify(
    {
      network,
      retrievedAt: snapshot.retrievedAt,
      pools: snapshot.pools.length,
      excluded: snapshot.excludedPoolCount,
      largest: snapshot.pools.slice(0, 8).map((pool) => ({
        pair: pool.tokens.map((token) => token.symbol).join(' / '),
        type: pool.type,
        tvlUsd: pool.tvlUsd,
        feeAprPct: pool.feeAprPct,
        rewardsAprPct:
          pool.aquaAprPct === null || pool.incentiveAprPct === null ? null : pool.aquaAprPct + pool.incentiveAprPct,
        totalAprPct: pool.totalAprPct,
      })),
    },
    null,
    2,
  ),
);

async function curlRequest(url, init) {
  const { stdout } = await promisify(execFile)(
    'curl',
    ['--fail', '--silent', '--show-error', '--max-time', '15', String(url)],
    { signal: init?.signal, maxBuffer: 1_000_000 },
  );
  return new Response(stdout);
}
