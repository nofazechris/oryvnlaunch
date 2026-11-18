CREATE TABLE "transfers" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"from_address" text NOT NULL,
	"to_address" text NOT NULL,
	"value" numeric(78, 0) NOT NULL,
	"block_number" integer NOT NULL,
	"index_in_block" integer NOT NULL,
	"tx_hash" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "transfers_token_idx" ON "transfers" USING btree ("token");--> statement-breakpoint
CREATE INDEX "transfers_block_idx" ON "transfers" USING btree ("block_number");