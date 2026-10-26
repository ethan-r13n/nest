import type { StellarNetwork } from '@nest/domain/network';
import { rpc } from '@stellar/stellar-sdk';
import { z } from 'zod';

import { type LendingSymbol, lendingAsset } from '../blend/markets.ts';
import { hex } from '../stellar/inspect.ts';

const API_URL = 'https://api.defindex.io';
const TIMEOUT_MS = 20_000;
const catalogs = new Map<string, { expiresAt: number; value: Promise<VaultView[]> }>();
const vaultReads = new Map<string, { expiresAt: number; value: Promise<VaultView> }>();

/**
 * sha256 of the DeFindex vault contract Nest accepts on each network, from `hashes.defindex_vault`
 * in github.com/defindex-io/stellar-contracts public/{mainnet,testnet}.contracts.json, read
 * 2026-10-26. Every vault the API listed on both networks ran exactly this code.
 */
const VAULT_WASM_HASHES: Record<StellarNetwork, readonly string[]> = {
  mainnet: ['ae3409a4090bc087b86b4e9b444d2b8017ccd97b90b069d44d005ab9f8e1468b'],
  testnet: ['f345228dca59c6605789620e9ec62ff4847a0927c33dac7581a955fe746016be'],
};

/**
 * The API's Testnet discovery returns mainnet addresses, so Testnet uses the vaults published in
 * testnet.contracts.json: `usdc_paltalabs_vault` (Blend's test USDC) and `xlm_paltalabs_vault`.
 */
const TESTNET_VAULTS = [
  'CBMVK2JK6NTOT2O4HNQAIQFJY232BHKGLIMXDVQVHIIZKDACXDFZDWHN',
  'CCLV4H7WTLJQ7ATLHBBQV2WW3OINF3FOY5XZ7VPHZO7NH3D2ZS4GFSF6',
];
const VAULT_ID = /^C[A-Z2-7]{55}$/;

const DiscoverSchema = z.object({ vaults: z.array(z.object({ address: z.string().regex(VAULT_ID) })) });
const VaultSchema = z.object({
  name: z.string(),
  displayName: z.string().nullish(),
  apy: z.number().nullish(),
  assets: z.array(
    z.object({
      address: z.string(),
      strategies: z.array(z.object({ name: z.string(), paused: z.boolean() })),
    }),
  ),
  totalManagedFunds: z
    .array(
      z.object({ asset: z.string(), idle_amount: z.string(), invested_amount: z.string(), total_amount: z.string() }),
    )
    .nullish(),
  feesBps: z.object({ vaultFee: z.number(), defindexFee: z.number() }),
});

export interface VaultView {
  address: string;
  name: string;
  /** The vault's one asset when Nest supports it; multi-asset and other-asset vaults are listed as unsupported. */
  symbol: LendingSymbol | null;
  assetContract: string;
  apyPct: number | null;
  totalRaw: bigint;
  idleRaw: bigint;
  investedRaw: bigint;
  /** Share of gains the vault's manager takes, and DeFindex's share of that fee. */
  vaultFeeBps: number;
  defindexFeeBps: number;
  strategies: { name: string; paused: boolean }[];
  retrievedAt?: string;
}

export class DefindexError extends Error {
  override name = 'DefindexError';
  readonly status: number | null;

  constructor(message: string, status: number | null) {
    super(message);
    this.status = status;
  }
}

/** Read-only DeFindex API access: which vaults exist, their assets, funds, fees and APY. */
export function createDefindexClient(options: { apiKey: string; network: StellarNetwork; fetch?: typeof fetch }) {
  const send = options.fetch ?? fetch;
  async function get<T>(path: string, schema: z.ZodType<T>): Promise<T> {
    const separator = path.includes('?') ? '&' : '?';
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await send(`${API_URL}${path}${separator}network=${options.network}`, {
        headers: { authorization: `Bearer ${options.apiKey}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const body: unknown = await response.json().catch(() => null);
      if (response.status === 429 && attempt < 2) {
        const retryAfter =
          body && typeof body === 'object' && 'retryAfter' in body && typeof body.retryAfter === 'number'
            ? body.retryAfter
            : 1;
        if (retryAfter >= 0 && retryAfter <= 2) {
          await new Promise((resolve) => setTimeout(resolve, Math.max(1000, retryAfter * 1000)));
          continue;
        }
      }
      const parsed = schema.safeParse(body);
      if (!response.ok || !parsed.success) {
        throw new DefindexError(`DeFindex answered ${response.status} for ${path.split('?')[0]}.`, response.status);
      }
      return parsed.data;
    }
    throw new DefindexError('DeFindex is rate limited right now.', 429);
  }

  async function vault(address: string): Promise<VaultView> {
    if (!VAULT_ID.test(address)) throw new DefindexError('Not a vault contract address.', null);
    const key = `${options.network}:${options.apiKey}:${address}`;
    const cached = options.fetch ? undefined : vaultReads.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const value = get(`/vault/${address}`, VaultSchema).then((data) => ({
      ...vaultView(options.network, address, data),
      retrievedAt: new Date().toISOString(),
    }));
    if (!options.fetch) {
      vaultReads.set(key, { expiresAt: Date.now() + 10_000, value });
      if (vaultReads.size > 64) {
        const oldest = vaultReads.keys().next().value;
        if (oldest) vaultReads.delete(oldest);
      }
      void value.catch(() => {
        if (vaultReads.get(key)?.value === value) vaultReads.delete(key);
      });
    }
    return value;
  }

  async function loadCatalog(): Promise<VaultView[]> {
    const addresses =
      options.network === 'testnet'
        ? TESTNET_VAULTS
        : (await get('/vault/discover', DiscoverSchema)).vaults.map((entry) => entry.address);
    const rows: VaultView[] = [];
    for (const address of addresses) rows.push(await vault(address));
    return rows;
  }
  return {
    vault,
    async vaults(): Promise<VaultView[]> {
      const key = `${options.network}:${options.apiKey}`;
      const cached = options.fetch ? undefined : catalogs.get(key);
      if (cached && cached.expiresAt > Date.now()) return cached.value;
      const value = loadCatalog();
      if (!options.fetch) {
        catalogs.set(key, { expiresAt: Date.now() + 30_000, value });
        if (catalogs.size > 8) {
          const oldest = catalogs.keys().next().value;
          if (oldest) catalogs.delete(oldest);
        }
        void value.catch(() => {
          if (catalogs.get(key)?.value === value) catalogs.delete(key);
        });
      }
      return value;
    },
  };
}

/** True only when the contract runs the DeFindex vault code Nest accepts on this network. */
export async function isDefindexVault(network: StellarNetwork, rpcUrl: string, address: string): Promise<boolean> {
  if (!VAULT_ID.test(address)) return false;
  const wasm = await new rpc.Server(rpcUrl).getContractWasmByContractId(address);
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(wasm));
  return VAULT_WASM_HASHES[network].includes(hex(new Uint8Array(digest)));
}

function vaultView(network: StellarNetwork, address: string, data: z.infer<typeof VaultSchema>): VaultView {
  const [asset] = data.assets;
  const assetContract = asset?.address ?? '';
  const funds = data.totalManagedFunds?.find((entry) => entry.asset === assetContract);
  const symbol =
    data.assets.length === 1
      ? ((['USDC', 'XLM'] as const).find(
          (candidate) => lendingAsset(network, candidate).contractId === assetContract,
        ) ?? null)
      : null;
  return {
    address,
    name: vaultName(data.displayName || data.name, symbol),
    symbol,
    assetContract,
    apyPct: data.apy ?? null,
    totalRaw: BigInt(funds?.total_amount ?? '0'),
    idleRaw: BigInt(funds?.idle_amount ?? '0'),
    investedRaw: BigInt(funds?.invested_amount ?? '0'),
    vaultFeeBps: data.feesBps.vaultFee,
    defindexFeeBps: data.feesBps.defindexFee,
    strategies: asset?.strategies ?? [],
  };
}

/** Drops DeFindex's name prefix; generic names say which asset the vault holds instead. */
function vaultName(raw: string, symbol: LendingSymbol | null): string {
  const name = raw.replace(/^DeFindex-Vault-/, '').trim();
  return !name || /^defindex vault$/i.test(name) ? `DeFindex ${symbol ?? ''} vault`.replace('  ', ' ') : name;
}
