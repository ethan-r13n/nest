CREATE TABLE `automation_evaluations` (
	`id` text PRIMARY KEY NOT NULL,
	`rule_id` text NOT NULL,
	`revision` integer NOT NULL,
	`scheduled_for_ms` integer NOT NULL,
	`evaluated_at_ms` integer NOT NULL,
	`result` text NOT NULL,
	`reason` text NOT NULL,
	`evidence` text NOT NULL,
	`triggered` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`rule_id`) REFERENCES `automation_rules`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `automation_evaluations_rule_idx` ON `automation_evaluations` (`rule_id`,`evaluated_at_ms`);--> statement-breakpoint
CREATE TABLE `automation_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`network` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`owner_account` text,
	`status` text NOT NULL,
	`revision` integer NOT NULL,
	`config` text NOT NULL,
	`config_hash` text NOT NULL,
	`mode` text NOT NULL,
	`interval_ms` integer NOT NULL,
	`cooldown_ms` integer NOT NULL,
	`armed` integer DEFAULT 1 NOT NULL,
	`next_due_at_ms` integer,
	`last_evaluated_at_ms` integer,
	`last_result` text,
	`last_triggered_at_ms` integer,
	`created_at_ms` integer NOT NULL,
	`updated_at_ms` integer NOT NULL,
	CONSTRAINT "automation_rules_network_ck" CHECK(network IN ('mainnet', 'testnet')),
	CONSTRAINT "automation_rules_status_ck" CHECK(status IN ('draft', 'active', 'paused', 'completed', 'deleted'))
);
--> statement-breakpoint
CREATE INDEX `automation_rules_due_idx` ON `automation_rules` (`network`,`status`,`next_due_at_ms`);--> statement-breakpoint
CREATE TABLE `automation_triggers` (
	`id` text PRIMARY KEY NOT NULL,
	`rule_id` text NOT NULL,
	`revision` integer NOT NULL,
	`trigger_key` text NOT NULL,
	`evaluation_id` text NOT NULL,
	`summary` text NOT NULL,
	`created_at_ms` integer NOT NULL,
	`acknowledged_at_ms` integer,
	FOREIGN KEY (`rule_id`) REFERENCES `automation_rules`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `automation_triggers_trigger_key_unique` ON `automation_triggers` (`trigger_key`);--> statement-breakpoint
CREATE INDEX `automation_triggers_rule_idx` ON `automation_triggers` (`rule_id`,`created_at_ms`);