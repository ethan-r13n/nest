import { STELLAR_NETWORKS } from '@nest/domain/network';
import { sql } from 'drizzle-orm';
import { check, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

// Mainnet and Testnet use separate databases; the network column still guards every row
// against a binding pointed at the wrong one. Times are Unix milliseconds.
const NETWORKS = STELLAR_NETWORKS;
const PROTOCOL_STATUSES = ['research', 'read', 'write'] as const;
const NETWORK_CHECK = sql.raw(`network IN (${NETWORKS.map((network) => `'${network}'`).join(', ')})`);

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  createdAtMs: integer('created_at_ms').notNull(),
});

export const walletAccounts = sqliteTable(
  'wallet_accounts',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    network: text('network', { enum: NETWORKS }).notNull(),
    accountId: text('account_id').notNull(),
    verifiedAtMs: integer('verified_at_ms'),
    createdAtMs: integer('created_at_ms').notNull(),
  },
  (table) => [
    uniqueIndex('wallet_accounts_network_account_uq').on(table.network, table.accountId),
    index('wallet_accounts_user_idx').on(table.userId),
    check('wallet_accounts_network_ck', NETWORK_CHECK),
  ],
);

/** One-time SEP-10 challenges. A nonce is consumed once; the challenge itself is never submitted to the chain. */
export const authChallenges = sqliteTable(
  'auth_challenges',
  {
    nonce: text('nonce').primaryKey(),
    network: text('network', { enum: NETWORKS }).notNull(),
    accountId: text('account_id').notNull(),
    browserSessionHash: text('browser_session_hash').notNull(),
    expiresAtMs: integer('expires_at_ms').notNull(),
    consumedAtMs: integer('consumed_at_ms'),
    createdAtMs: integer('created_at_ms').notNull(),
  },
  (table) => [
    index('auth_challenges_expiry_idx').on(table.expiresAtMs),
    check('auth_challenges_network_ck', NETWORK_CHECK),
  ],
);

/** Browser sessions after wallet verification. `id` is a hash of the cookie token; the token is never stored. */
export const authSessions = sqliteTable(
  'auth_sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    walletAccountId: text('wallet_account_id')
      .notNull()
      .references(() => walletAccounts.id),
    network: text('network', { enum: NETWORKS }).notNull(),
    createdAtMs: integer('created_at_ms').notNull(),
    expiresAtMs: integer('expires_at_ms').notNull(),
    revokedAtMs: integer('revoked_at_ms'),
  },
  (table) => [index('auth_sessions_user_idx').on(table.userId), check('auth_sessions_network_ck', NETWORK_CHECK)],
);

/** Approved protocols for this network. Writes stay off per protocol until its lifecycle is validated. */
export const protocolRegistry = sqliteTable(
  'protocol_registry',
  {
    id: text('id').primaryKey(),
    network: text('network', { enum: NETWORKS }).notNull(),
    name: text('name').notNull(),
    category: text('category').notNull(),
    status: text('status', { enum: PROTOCOL_STATUSES }).notNull().default('research'),
    writeEnabled: integer('write_enabled', { mode: 'boolean' }).notNull().default(false),
    version: integer('version').notNull().default(1),
    updatedAtMs: integer('updated_at_ms').notNull(),
  },
  (table) => [
    check('protocol_registry_network_ck', NETWORK_CHECK),
    check('protocol_registry_status_ck', sql`${table.status} IN ('research', 'read', 'write')`),
  ],
);

/** Verified asset identities. Amount fields elsewhere are decimal TEXT in these decimals. */
export const assetRegistry = sqliteTable(
  'asset_registry',
  {
    network: text('network', { enum: NETWORKS }).notNull(),
    canonicalId: text('canonical_id').notNull(),
    code: text('code'),
    issuer: text('issuer'),
    contractId: text('contract_id'),
    decimals: integer('decimals').notNull(),
    verifiedSource: text('verified_source').notNull(),
    verifiedAtMs: integer('verified_at_ms').notNull(),
    updatedAtMs: integer('updated_at_ms').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.network, table.canonicalId] }),
    index('asset_registry_contract_idx').on(table.contractId),
    check('asset_registry_network_ck', NETWORK_CHECK),
    check('asset_registry_decimals_ck', sql`${table.decimals} BETWEEN 0 AND 38`),
  ],
);
