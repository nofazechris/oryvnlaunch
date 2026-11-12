CREATE TABLE "indexer_state" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "launches" (
	"token" text PRIMARY KEY NOT NULL,
	"curve" text NOT NULL,
	"factory" text NOT NULL,
	"creator" text NOT NULL,
	"quote_token" text NOT NULL,
	"launch_id" numeric(20, 0) NOT NULL,
	"name" text NOT NULL,
	"symbol" text NOT NULL,
	"metadata_uri" text NOT NULL,
	"preset" smallint NOT NULL,
	"creator_bps" integer NOT NULL,
	"graduation_raise" numeric(78, 0) NOT NULL,
	"deploy_fee" numeric(78, 0) NOT NULL,
	"created_block" integer NOT NULL,
	"created_tx" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"graduated" boolean DEFAULT false NOT NULL,
	"graduated_block" integer,
	"graduated_at" timestamp with time zone,
	"quote_reserve" numeric(78, 0) NOT NULL,
	"token_reserve" numeric(78, 0) NOT NULL,
	"price" numeric(78, 0) NOT NULL,
	"market_cap" numeric(78, 0) NOT NULL,
	"trade_count" integer DEFAULT 0 NOT NULL,
	"volume_quote" numeric(78, 0) DEFAULT '0' NOT NULL,
	"last_trade_at" timestamp with time zone,
	CONSTRAINT "launches_preset_check" CHECK ("launches"."preset" between 0 and 2),
	CONSTRAINT "launches_reserves_check" CHECK ("launches"."quote_reserve" > 0 and "launches"."token_reserve" > 0)
);
--> statement-breakpoint
CREATE TABLE "quote_token_events" (
	"id" text PRIMARY KEY NOT NULL,
	"quote_token" text NOT NULL,
	"enabled" boolean NOT NULL,
	"deploy_fee" numeric(78, 0) NOT NULL,
	"graduation_raise" numeric(78, 0) NOT NULL,
	"block_number" integer NOT NULL,
	"index_in_block" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"id" text PRIMARY KEY NOT NULL,
	"curve" text NOT NULL,
	"token" text NOT NULL,
	"side" text NOT NULL,
	"trader" text NOT NULL,
	"quote_amount" numeric(78, 0) NOT NULL,
	"token_amount" numeric(78, 0) NOT NULL,
	"quote_reserve" numeric(78, 0) NOT NULL,
	"token_reserve" numeric(78, 0) NOT NULL,
	"price" numeric(78, 0) NOT NULL,
	"block_number" integer NOT NULL,
	"index_in_block" integer NOT NULL,
	"tx_hash" text NOT NULL,
	"block_time" timestamp with time zone NOT NULL,
	CONSTRAINT "trades_side_check" CHECK ("trades"."side" in ('buy', 'sell')),
	CONSTRAINT "trades_amounts_check" CHECK ("trades"."quote_amount" > 0 and "trades"."token_amount" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "launches_curve_idx" ON "launches" USING btree ("curve");--> statement-breakpoint
CREATE INDEX "launches_creator_idx" ON "launches" USING btree ("creator");--> statement-breakpoint
CREATE INDEX "launches_created_at_idx" ON "launches" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "launches_quote_market_cap_idx" ON "launches" USING btree ("quote_token","market_cap");--> statement-breakpoint
CREATE INDEX "quote_token_events_asset_idx" ON "quote_token_events" USING btree ("quote_token","block_number","index_in_block");--> statement-breakpoint
CREATE INDEX "trades_curve_order_idx" ON "trades" USING btree ("curve","block_number","index_in_block");--> statement-breakpoint
CREATE INDEX "trades_trader_idx" ON "trades" USING btree ("trader");--> statement-breakpoint
CREATE INDEX "trades_block_idx" ON "trades" USING btree ("block_number");