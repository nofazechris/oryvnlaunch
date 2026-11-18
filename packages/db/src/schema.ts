// The database holds what the chain says, in a shape that is quick to query. It is never the
// source of truth: every row here is derived from an event, and the indexer can rebuild the lot
// from the chain.
//
// Money rules:
//  - Token and quote amounts are u256 on-chain, so they are stored as numeric(78,0): exact
//    integers, in the asset's smallest unit (wei for STRK, 1e-6 for USDC). Drizzle hands them
//    back as strings; convert with BigInt, never Number.
//  - No float anywhere near an amount, a price or a market cap. launch_id (a u64) is numeric too.
//  - Addresses are canonical: 0x + 64 lowercase hex digits (see normalizeAddress in
//    @launchpad/chain).

import { sql } from "drizzle-orm";

import {
  boolean,
  check,
  customType,
  index,
  integer,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({
  dataType: () => "bytea",
});

/** An unsigned 256-bit integer: up to 78 decimal digits. */
const u256 = (name: string) => numeric(name, { precision: 78, scale: 0 });
/** An unsigned 64-bit integer: up to 20 decimal digits. Postgres bigint is signed, so it cannot hold every u64. */
const u64 = (name: string) => numeric(name, { precision: 20, scale: 0 });
const when = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/**
 * Every time the factory enabled, disabled or repriced a quote asset. History, not state: a
 * table that only held the latest value could not be rewound after a reorg, because the value
 * before the rolled-back change would be gone. The current setting of an asset is its newest
 * row here (see `currentQuoteTokens` in the db package).
 */
export const quoteTokenEvents = pgTable(
  "quote_token_events",
  {
    /** `${blockNumber}:${factory}:${indexInBlock}` */
    id: text("id").primaryKey(),
    quoteToken: text("quote_token").notNull(),
    enabled: boolean("enabled").notNull(),
    /** Deploy fee in the asset's smallest unit. */
    deployFee: u256("deploy_fee").notNull(),
    /** Amount a curve in this asset raises before graduating, in the smallest unit. */
    graduationRaise: u256("graduation_raise").notNull(),
    blockNumber: integer("block_number").notNull(),
    indexInBlock: integer("index_in_block").notNull(),
  },
  (t) => [index("quote_token_events_asset_idx").on(t.quoteToken, t.blockNumber, t.indexInBlock)],
);

/**
 * Every time the factory enabled, disabled or repriced an asset a creator can pay the deploy fee in
 * (STRK or USDC). History, for the same reason as `quoteTokenEvents`: a reorg must be able to rewind it.
 * USDC appears here and nowhere else: no token trades in it.
 */
export const feeAssetEvents = pgTable(
  "fee_asset_events",
  {
    /** `${blockNumber}:${factory}:${indexInBlock}` */
    id: text("id").primaryKey(),
    feeToken: text("fee_token").notNull(),
    enabled: boolean("enabled").notNull(),
    /** Deploy fee in the asset's smallest unit. */
    deployFee: u256("deploy_fee").notNull(),
    blockNumber: integer("block_number").notNull(),
    indexInBlock: integer("index_in_block").notNull(),
  },
  (t) => [index("fee_asset_events_asset_idx").on(t.feeToken, t.blockNumber, t.indexInBlock)],
);

/** One row per launched token. */
export const launches = pgTable(
  "launches",
  {
    /** The token's address is its identity everywhere in the product. */
    token: text("token").primaryKey(),
    curve: text("curve").notNull(),
    factory: text("factory").notNull(),
    creator: text("creator").notNull(),
    quoteToken: text("quote_token").notNull(),
    launchId: u64("launch_id").notNull(),
    name: text("name").notNull(),
    symbol: text("symbol").notNull(),
    metadataUri: text("metadata_uri").notNull(),
    /** 0 Gentle, 1 Standard, 2 Steep. */
    preset: smallint("preset").notNull(),
    creatorBps: integer("creator_bps").notNull(),
    graduationRaise: u256("graduation_raise").notNull(),
    deployFee: u256("deploy_fee").notNull(),
    /** The asset the deploy fee was paid in. Null for launches indexed before fee assets existed: then it was `quoteToken`. */
    feeToken: text("fee_token"),
    /** Trading fee this curve keeps for life, in basis points of each trade (100 = 1%). */
    tradeFeeBps: integer("trade_fee_bps").notNull().default(0),
    /** Creator's share of each fee, in basis points of the fee (5000 = half). */
    creatorFeeShareBps: integer("creator_fee_share_bps").notNull().default(0),
    createdBlock: integer("created_block").notNull(),
    createdTx: text("created_tx").notNull(),
    createdAt: when("created_at").notNull(),

    graduated: boolean("graduated").notNull().default(false),
    graduatedBlock: integer("graduated_block"),
    graduatedAt: when("graduated_at"),

    // Market snapshot. Recomputed from the trades table, so reprocessing a block range gives
    // the same answer. Before the first trade it holds the curve's opening reserves.
    quoteReserve: u256("quote_reserve").notNull(),
    tokenReserve: u256("token_reserve").notNull(),
    /** Smallest quote units per whole token, scaled by 1e18 (the contract's spot_price). */
    price: u256("price").notNull(),
    /** Whole supply priced at the current price, in the quote asset's smallest unit. */
    marketCap: u256("market_cap").notNull(),
    tradeCount: integer("trade_count").notNull().default(0),
    /** Sum of the curve-side amount of every buy and sell, in the quote asset's smallest unit. Fees excluded. */
    volumeQuote: u256("volume_quote").notNull().default("0"),
    /** Sum of every trade's fee, in the quote asset's smallest unit. */
    feesTotal: u256("fees_total").notNull().default("0"),
    lastTradeAt: when("last_trade_at"),
  },
  (t) => [
    uniqueIndex("launches_curve_idx").on(t.curve),
    index("launches_creator_idx").on(t.creator),
    index("launches_created_at_idx").on(t.createdAt),
    index("launches_quote_market_cap_idx").on(t.quoteToken, t.marketCap),
    check("launches_preset_check", sql`${t.preset} between 0 and 2`),
    check("launches_fee_check", sql`${t.tradeFeeBps} between 0 and 300 and ${t.creatorFeeShareBps} between 0 and 10000`),
    check("launches_reserves_check", sql`${t.quoteReserve} > 0 and ${t.tokenReserve} > 0`),
  ],
);

/** Every buy and sell. */
export const trades = pgTable(
  "trades",
  {
    /** `${blockNumber}:${curve}:${indexInBlock}`: the same event always gets the same id. */
    id: text("id").primaryKey(),
    curve: text("curve").notNull(),
    token: text("token").notNull(),
    side: text("side", { enum: ["buy", "sell"] }).notNull(),
    trader: text("trader").notNull(),
    /**
     * The curve-side amount, smallest unit: what went into the curve (buy) or left its reserve
     * (sell). The trader paid `quoteAmount + fee` on a buy and received `quoteAmount - fee` on a sell.
     */
    quoteAmount: u256("quote_amount").notNull(),
    /** Trading fee on this trade, smallest unit. */
    fee: u256("fee").notNull().default("0"),
    tokenAmount: u256("token_amount").notNull(),
    /** Reserves after this trade, straight from the event. */
    quoteReserve: u256("quote_reserve").notNull(),
    tokenReserve: u256("token_reserve").notNull(),
    price: u256("price").notNull(),
    blockNumber: integer("block_number").notNull(),
    indexInBlock: integer("index_in_block").notNull(),
    txHash: text("tx_hash").notNull(),
    blockTime: when("block_time").notNull(),
  },
  (t) => [
    index("trades_curve_order_idx").on(t.curve, t.blockNumber, t.indexInBlock),
    index("trades_trader_idx").on(t.trader),
    index("trades_block_idx").on(t.blockNumber),
    check("trades_side_check", sql`${t.side} in ('buy', 'sell')`),
    check("trades_amounts_check", sql`${t.quoteAmount} > 0 and ${t.tokenAmount} > 0`),
  ],
);

/**
 * Every movement of a launched token between two addresses, mints included (`from` = the zero
 * address). Holder balances are the sum of these, computed on read (see `holdersOf`), so a rewind
 * after a reorg just deletes rows and nothing can drift.
 */
export const transfers = pgTable(
  "transfers",
  {
    /** `${blockNumber}:${token}:${indexInBlock}` */
    id: text("id").primaryKey(),
    token: text("token").notNull(),
    from: text("from_address").notNull(),
    to: text("to_address").notNull(),
    value: u256("value").notNull(),
    blockNumber: integer("block_number").notNull(),
    indexInBlock: integer("index_in_block").notNull(),
    txHash: text("tx_hash").notNull(),
  },
  (t) => [
    index("transfers_token_idx").on(t.token),
    index("transfers_block_idx").on(t.blockNumber),
  ],
);

/**
 * Token images uploaded through the API, stored by the SHA-256 of their bytes. The hash is the
 * identity: the same picture uploaded twice is one row, and a launch's metadata refers to the hash,
 * not to a server, so the image can move hosts without touching the chain. Not derived from chain
 * events, so unlike every other table it cannot be rebuilt: back it up with the rest of the database.
 */
export const images = pgTable("images", {
  /** Lowercase hex SHA-256 of `bytes`. */
  hash: text("hash").primaryKey(),
  mime: text("mime").notNull(),
  bytes: bytea("bytes").notNull(),
  size: integer("size").notNull(),
  createdAt: when("created_at").notNull().defaultNow(),
});

/** Small key/value store for the indexer's own bookkeeping, such as its cursor. */
export const indexerState = pgTable("indexer_state", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: when("updated_at").notNull().defaultNow(),
});

export type QuoteTokenEventRow = typeof quoteTokenEvents.$inferSelect;
export type FeeAssetEventRow = typeof feeAssetEvents.$inferSelect;
export type LaunchRow = typeof launches.$inferSelect;
export type NewLaunchRow = typeof launches.$inferInsert;
export type TransferRow = typeof transfers.$inferSelect;
export type NewTransferRow = typeof transfers.$inferInsert;
export type ImageRow = typeof images.$inferSelect;
export type TradeRow = typeof trades.$inferSelect;
export type NewTradeRow = typeof trades.$inferInsert;
