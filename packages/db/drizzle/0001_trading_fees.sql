ALTER TABLE "launches" ADD COLUMN "trade_fee_bps" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "launches" ADD COLUMN "creator_fee_share_bps" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "launches" ADD COLUMN "fees_total" numeric(78, 0) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "fee" numeric(78, 0) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "launches" ADD CONSTRAINT "launches_fee_check" CHECK ("launches"."trade_fee_bps" between 0 and 300 and "launches"."creator_fee_share_bps" between 0 and 10000);