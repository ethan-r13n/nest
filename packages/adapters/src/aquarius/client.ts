import {
  type AquariusNetwork,
  AquariusSnapshotSchema,
  aquariusBase,
  makeAquariusSnapshot,
  parseAquariusPage,
  parseAquariusStatisticsPage,
  rankAquariusPoolCandidates,
} from '@nest/data/aquarius';

const MAX_PAGES = 50;
const MAX_BYTES = 1_000_000;

export async function readAquariusPools(network: AquariusNetwork, signal: AbortSignal, request = fetch) {
  const base = aquariusBase(network);
  const statistics = await readPages(`${base}/pools/?sort=-liquidity&size=100`, 'statistics', signal, request);
  const ranking = rankAquariusPoolCandidates(statistics);
  const sourceUrl = `${base}/api/external/v2/pools/?address__in=${ranking.addresses.join(',')}`;
  const catalog = ranking.addresses.length ? await readPages(sourceUrl, 'catalog', signal, request) : [];
  const snapshot = makeAquariusSnapshot(catalog, statistics, network, new Date().toISOString());
  return AquariusSnapshotSchema.parse({
    ...snapshot,
    sourceUrl,
    indexedPoolCount: ranking.indexedPoolCount,
    eligiblePoolCount: ranking.eligiblePoolCount,
    excludedPoolCount: ranking.indexedPoolCount - ranking.eligiblePoolCount,
    omittedPoolCount: ranking.eligiblePoolCount - snapshot.pools.length,
  });
}

export async function readAquariusUserPools(
  network: AquariusNetwork,
  account: string,
  signal: AbortSignal,
  request = fetch,
) {
  if (!/^G[A-Z2-7]{55}$/.test(account)) throw new Error('Invalid account identity.');
  return readPages(`${aquariusBase(network)}/api/external/v2/pools/user/${account}/`, 'catalog', signal, request);
}

async function readPages(start: string, kind: 'catalog' | 'statistics', signal: AbortSignal, request: typeof fetch) {
  const first = await readPage(start, kind, signal, request);
  const pages = first.pages ?? (first.items.length ? Math.ceil(first.count / first.items.length) : 1);
  if (pages > MAX_PAGES || (first.count > 0 && first.items.length === 0))
    throw new Error('Pool pagination is incomplete.');
  checkNext(first.next, start, 1, pages);
  const items: unknown[] = [...first.items];
  for (let page = 2; page <= pages; page += 4) {
    const batch = Array.from({ length: Math.min(4, pages - page + 1) }, (_, index) => page + index);
    const results = await Promise.all(
      batch.map(async (number) => {
        const url = new URL(start);
        url.searchParams.set('page', String(number));
        const result = await readPage(url.toString(), kind, signal, request);
        if (result.count !== first.count) throw new Error('Pool catalog changed during refresh.');
        checkNext(result.next, start, number, pages);
        return result.items;
      }),
    );
    items.push(...results.flat());
  }
  if (items.length !== first.count) throw new Error('Pool pagination is incomplete.');
  return items;
}

async function readPage(url: string, kind: 'catalog' | 'statistics', signal: AbortSignal, request: typeof fetch) {
  signal.throwIfAborted();
  const response = await request(url, { signal, redirect: 'manual', headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error('Pool source is unavailable.');
  if (Number(response.headers.get('content-length')) > MAX_BYTES) throw new Error('Pool response is too large.');
  const text = await response.text();
  if (text.length > MAX_BYTES) throw new Error('Pool response is too large.');
  const body: unknown = JSON.parse(text);
  if (kind === 'catalog') {
    const page = parseAquariusPage(body);
    return { count: page.count, next: page.next, items: page.results, pages: null };
  }
  const page = parseAquariusStatisticsPage(body);
  return { count: page.total, next: undefined, items: page.items, pages: page.pages };
}

function checkNext(next: string | null | undefined, start: string, page: number, pages: number) {
  if (next === undefined) return;
  if (page < pages !== (next !== null)) throw new Error('Pool pagination is incomplete.');
  if (next === null) return;
  const allowed = new URL(start);
  const url = new URL(next);
  if (url.origin !== allowed.origin || url.pathname !== allowed.pathname || url.username || url.password)
    throw new Error('Unexpected pool pagination source.');
  if (url.searchParams.get('page') !== String(page + 1)) throw new Error('Pool pagination is incomplete.');
}
