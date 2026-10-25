CREATE TABLE `intents` (
	`id` text PRIMARY KEY NOT NULL,
	`network` text NOT NULL,
	`kind` text NOT NULL,
	`sell_asset` text NOT NULL,
	`buy_asset` text NOT NULL,
	`sell_amount_raw` text NOT NULL,
	`source` text NOT NULL,
	`created_at_ms` integer NOT NULL,
	CONSTRAINT "intents_network_ck" CHECK(network IN ('mainnet', 'testnet'))
);
--> statement-breakpoint
CREATE TABLE `plan_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`plan_id` text NOT NULL,
	`from_status` text,
	`to_status` text NOT NULL,
	`actor` text NOT NULL,
	`reason` text NOT NULL,
	`created_at_ms` integer NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `plan_events_plan_idx` ON `plan_events` (`plan_id`);--> statement-breakpoint
CREATE TABLE `plans` (
	`id` text PRIMARY KEY NOT NULL,
	`intent_id` text NOT NULL,
	`quote_id` text NOT NULL,
	`network` text NOT NULL,
	`account_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`status` text NOT NULL,
	`digest` text NOT NULL,
	`policy` text NOT NULL,
	`max_fee_stroops` text NOT NULL,
	`prepared_xdr` text,
	`prepared_hash` text,
	`prepared_facts` text,
	`valid_until_ms` integer,
	`approved_at_ms` integer,
	`signed_xdr` text,
	`tx_hash` text,
	`result` text,
	`error_code` text,
	`created_at_ms` integer NOT NULL,
	`updated_at_ms` integer NOT NULL,
	FOREIGN KEY (`intent_id`) REFERENCES `intents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`quote_id`) REFERENCES `quotes`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "plans_network_ck" CHECK(network IN ('mainnet', 'testnet')),
	CONSTRAINT "plans_status_ck" CHECK(status IN ('policy_checked', 'blocked', 'awaiting_review', 'awaiting_signature', 'submitted', 'confirming', 'confirmed', 'failed', 'expired'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plans_idempotency_uq` ON `plans` (`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `plans_network_tx_hash_uq` ON `plans` (`network`,`tx_hash`);--> statement-breakpoint
CREATE INDEX `plans_account_idx` ON `plans` (`network`,`account_id`);--> statement-breakpoint
CREATE TABLE `quotes` (
	`id` text PRIMARY KEY NOT NULL,
	`intent_id` text NOT NULL,
	`venue` text NOT NULL,
	`slippage_bps` integer NOT NULL,
	`amount_in_raw` text NOT NULL,
	`amount_out_raw` text NOT NULL,
	`min_out_raw` text NOT NULL,
	`price_impact_bps` integer,
	`protocols` text NOT NULL,
	`provider_quote` text NOT NULL,
	`observed_at_ms` integer NOT NULL,
	`expires_at_ms` integer NOT NULL,
	FOREIGN KEY (`intent_id`) REFERENCES `intents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `quotes_intent_idx` ON `quotes` (`intent_id`);