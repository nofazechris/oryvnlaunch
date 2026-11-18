CREATE TABLE "fee_asset_events" (
	"id" text PRIMARY KEY NOT NULL,
	"fee_token" text NOT NULL,
	"enabled" boolean NOT NULL,
	"deploy_fee" numeric(78, 0) NOT NULL,
	"block_number" integer NOT NULL,
	"index_in_block" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "launches" ADD COLUMN "fee_token" text;--> statement-breakpoint
CREATE INDEX "fee_asset_events_asset_idx" ON "fee_asset_events" USING btree ("fee_token","block_number","index_in_block");