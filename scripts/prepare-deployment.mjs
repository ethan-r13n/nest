import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [network, databaseId, ...options] = process.argv.slice(2);
if (!['mainnet', 'testnet'].includes(network) || !/^[a-f0-9-]{36}$/.test(databaseId ?? '')) {
  throw new Error('Usage: node scripts/prepare-deployment.mjs mainnet|testnet DATABASE_ID [--enable-execution]');
}
if (options.some((option) => option !== '--enable-execution')) throw new Error('Unknown deployment option.');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(root, 'apps/web/dist/nest/wrangler.json');
const source = JSON.parse(await readFile(sourcePath, 'utf8'));
if (typeof source.main !== 'string' || typeof source.assets?.directory !== 'string' || !source.vars) {
  throw new Error('Run the default pnpm build before preparing deployment.');
}
const execution = options.includes('--enable-execution');
const adapters =
  network === 'mainnet' ? 'soroswap,blend,defindex,aquarius_range,xoxno' : 'sdex,blend,defindex,aquarius_range,xoxno';
const config = {
  name: network === 'mainnet' ? 'nest' : 'nest-testnet',
  main: path.resolve(path.dirname(sourcePath), source.main),
  no_bundle: source.no_bundle,
  rules: source.rules,
  compatibility_date: source.compatibility_date,
  compatibility_flags: source.compatibility_flags,
  workers_dev: true,
  preview_urls: false,
  observability: { enabled: true },
  triggers: source.triggers,
  assets: { ...source.assets, directory: path.resolve(path.dirname(sourcePath), source.assets.directory) },
  vars: {
    ...source.vars,
    STELLAR_NETWORK: network,
    EXECUTION_ENABLED: String(execution),
    ENABLED_WRITE_ADAPTERS: execution ? adapters : '',
  },
  secrets: {
    required: source.secrets.required.filter((name) => network === 'mainnet' || name !== 'STELLAR_MAINNET_RPC_URL'),
  },
  durable_objects: source.durable_objects,
  migrations: source.migrations,
  d1_databases: [
    {
      binding: 'DB',
      database_name: `nest-${network}`,
      database_id: databaseId,
      migrations_dir: path.join(root, 'apps/worker/migrations'),
    },
  ],
};
const directory = path.join(root, '.wrangler/deploy', network);
await mkdir(directory, { recursive: true });
const destination = path.join(directory, 'wrangler.json');
await writeFile(destination, `${JSON.stringify(config, null, 2)}\n`);
process.stdout.write(`${destination}\n`);
