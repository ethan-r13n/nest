CREATE TABLE `asset_registry` (
	`network` text NOT NULL,
	`canonical_id` text NOT NULL,
	`code` text,
	`issuer` text,
	`contract_id` text,
	`decimals` integer NOT NULL,
	`verified_source` text NOT NULL,
	`verified_at_ms` integer NOT NULL,
	`updated_at_ms` integer NOT NULL,
	PRIMARY KEY(`network`, `canonical_id`),
	CONSTRAINT "asset_registry_network_ck" CHECK(network IN ('mainnet', 'testnet')),
	CONSTRAINT "asset_registry_decimals_ck" CHECK("asset_registry"."decimals" BETWEEN 0 AND 38)
);
--> statement-breakpoint
CREATE INDEX `asset_registry_contract_idx` ON `asset_registry` (`contract_id`);--> statement-breakpoint
CREATE TABLE `auth_challenges` (
	`nonce` text PRIMARY KEY NOT NULL,
	`network` text NOT NULL,
	`account_id` text NOT NULL,
	`browser_session_hash` text NOT NULL,
	`expires_at_ms` integer NOT NULL,
	`consumed_at_ms` integer,
	`created_at_ms` integer NOT NULL,
	CONSTRAINT "auth_challenges_network_ck" CHECK(network IN ('mainnet', 'testnet'))
);
--> statement-breakpoint
CREATE INDEX `auth_challenges_expiry_idx` ON `auth_challenges` (`expires_at_ms`);--> statement-breakpoint
CREATE TABLE `auth_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`wallet_account_id` text NOT NULL,
	`network` text NOT NULL,
	`created_at_ms` integer NOT NULL,
	`expires_at_ms` integer NOT NULL,
	`revoked_at_ms` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`wallet_account_id`) REFERENCES `wallet_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "auth_sessions_network_ck" CHECK(network IN ('mainnet', 'testnet'))
);
--> statement-breakpoint
CREATE INDEX `auth_sessions_user_idx` ON `auth_sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `protocol_registry` (
	`id` text PRIMARY KEY NOT NULL,
	`network` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`status` text DEFAULT 'research' NOT NULL,
	`write_enabled` integer DEFAULT false NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at_ms` integer NOT NULL,
	CONSTRAINT "protocol_registry_network_ck" CHECK(network IN ('mainnet', 'testnet')),
	CONSTRAINT "protocol_registry_status_ck" CHECK("protocol_registry"."status" IN ('research', 'read', 'write'))
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at_ms` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `wallet_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`network` text NOT NULL,
	`account_id` text NOT NULL,
	`verified_at_ms` integer,
	`created_at_ms` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "wallet_accounts_network_ck" CHECK(network IN ('mainnet', 'testnet'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wallet_accounts_network_account_uq` ON `wallet_accounts` (`network`,`account_id`);--> statement-breakpoint
CREATE INDEX `wallet_accounts_user_idx` ON `wallet_accounts` (`user_id`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`payload` text NOT NULL,
	`dedupe_key` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 5 NOT NULL,
	`run_after_ms` integer NOT NULL,
	`lease_owner` text,
	`lease_until_ms` integer,
	`last_error` text,
	`created_at_ms` integer NOT NULL,
	`updated_at_ms` integer NOT NULL,
	`finished_at_ms` integer,
	CONSTRAINT "jobs_status_ck" CHECK("jobs"."status" IN ('queued', 'running', 'done', 'failed', 'cancelled')),
	CONSTRAINT "jobs_attempts_ck" CHECK("jobs"."attempts" >= 0 AND "jobs"."max_attempts" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_dedupe_key_unique` ON `jobs` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `jobs_due_idx` ON `jobs` (`status`,`run_after_ms`);--> statement-breakpoint
CREATE INDEX `jobs_kind_idx` ON `jobs` (`kind`);--> statement-breakpoint
CREATE TABLE `outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`topic` text NOT NULL,
	`payload` text NOT NULL,
	`dedupe_key` text NOT NULL,
	`job_id` text,
	`created_at_ms` integer NOT NULL,
	`delivered_at_ms` integer,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `outbox_dedupe_key_unique` ON `outbox` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `outbox_undelivered_idx` ON `outbox` (`delivered_at_ms`,`created_at_ms`);