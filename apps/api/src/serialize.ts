// How rows leave the API.
//
// Every amount, price and market cap is a DECIMAL STRING in the asset's smallest unit. Never a
// JSON number: JavaScript numbers lose precision above 2^53, and these values go up to 2^256.
// Clients convert with BigInt and format using the asset's `decimals`.

import { PRESET_NAMES, graduationProgressBps } from "@launchpad/chain";
import type { LaunchRow, TradeRow } from "@launchpad/db";
import { parseMetadata } from "./metadata.js";
import { describeQuoteAsset } from "./assets.js";
import { MAX_METADATA_URI_CHARS, cleanText } from "./sanitize.js";

/**
 * What the launch said about itself, if it said it in a form we can check (see metadata.ts). Always an
 * object, so a client never has to guess: an unreadable or missing document is just empty fields.
 */
function serializeMetadata(uri: string) {
  const m = parseMetadata(uri);
  return {
    description: cleanText(m?.description ?? "", 280),
    links: m?.links ?? {},
    /** Path of the image on this API (join it to the API's address), or null. */
    image: m?.imageHash ? `/images/${m.imageHash}` : null,
  };
}

export function serializeLaunch(row: LaunchRow & { change24hBps?: number | null }) {
  return {
    token: row.token,
    curve: row.curve,
    creator: row.creator,
    quote: describeQuoteAsset(row.quoteToken),
    // Written by the creator, so cleaned of hidden and direction-flipping characters on the way out.
    name: cleanText(row.name, 64),
    symbol: cleanText(row.symbol, 16),
    metadataUri: row.metadataUri.length <= MAX_METADATA_URI_CHARS ? row.metadataUri : "",
    metadata: serializeMetadata(row.metadataUri),
    preset: { id: row.preset, name: PRESET_NAMES[row.preset] ?? null },
    creatorBps: row.creatorBps,
    graduationRaise: row.graduationRaise,
    deployFee: row.deployFee,
    /** The asset the deploy fee was paid in. The token itself trades in `quote`. */
    feeAsset: describeQuoteAsset(row.feeToken ?? row.quoteToken),
    /** The trading fee this curve keeps for life. Each trade pays `tradeFeeBps` of its curve-side amount. */
    tradeFee: {
      bps: row.tradeFeeBps,
      /** Creator's share of each fee, in basis points of the fee. The platform gets the rest. */
      creatorShareBps: row.creatorFeeShareBps,
      /** Sum of every trade's fee so far, in the quote asset's smallest unit. */
      totalCollected: row.feesTotal,
    },
    createdAt: row.createdAt.toISOString(),
    createdBlock: row.createdBlock,
    createdTx: row.createdTx,
    graduated: row.graduated,
    graduatedAt: row.graduatedAt ? row.graduatedAt.toISOString() : null,
    market: {
      quoteReserve: row.quoteReserve,
      tokenReserve: row.tokenReserve,
      /** Smallest quote units per whole token, scaled by 1e18. */
      price: row.price,
      /** Whole supply at the current price, in the quote asset's smallest unit. */
      marketCap: row.marketCap,
      volumeQuote: row.volumeQuote,
      tradeCount: row.tradeCount,
      lastTradeAt: row.lastTradeAt ? row.lastTradeAt.toISOString() : null,
      /**
       * Price change over the last 24 hours, or since launch if the launch is younger, in basis points
       * (100 = 1%, negative when the price fell). Null when it cannot be worked out.
       */
      change24hBps: row.change24hBps ?? null,
      /**
       * 0 to 10000: how much of the graduation raise the curve holds. Comparable across assets.
       * Always 10000 once graduated: selling after graduation lowers the reserve, but graduation
       * does not undo itself, so the figure must not fall back.
       */
      progressBps: row.graduated
        ? 10_000
        : graduationProgressBps(BigInt(row.quoteReserve), row.preset, BigInt(row.graduationRaise)),
    },
  };
}

/**
 * Who holds a token. The curve and the factory (which keeps the reserved share until it is released)
 * are shown but never counted as holders or in the concentration figure: they are the product's own
 * contracts, and counting them would make every token look like it has one giant holder.
 */
export function serializeHolders(
  launch: LaunchRow,
  all: { address: string; balance: bigint }[],
  count: number,
  minted: bigint,
  limit: number,
) {
  const role = (address: string) => (address === launch.curve ? "curve" : address === launch.factory ? "reserve" : address === launch.creator ? "creator" : "holder");
  const share = (balance: bigint) => (minted > 0n ? Number((balance * 10_000n) / minted) : 0);
  const wallets = all.filter((h) => role(h.address) !== "curve" && role(h.address) !== "reserve");
  const top10 = wallets.slice(0, 10).reduce((a, h) => a + h.balance, 0n);
  const creator = all.find((h) => h.address === launch.creator);
  return {
    /** Everyone with a balance, including the curve and the reserve. */
    count,
    /** Wallets holding the token, not counting the curve or the reserve. */
    wallets: wallets.length,
    /** Total ever minted: the fixed supply. */
    supply: minted.toString(),
    /** Share of the supply held by the ten biggest wallets, in basis points. Excludes the curve and the reserve. */
    top10ShareBps: share(top10),
    creatorShareBps: creator ? share(creator.balance) : 0,
    items: all.slice(0, limit).map((h) => ({ address: h.address, role: role(h.address), balance: h.balance.toString(), shareBps: share(h.balance) })),
  };
}

export function serializeTrade(row: TradeRow) {
  // What actually left (buy) or reached (sell) the trader's wallet, fee included. Exact: BigInt.
  const traderAmount =
    row.side === "buy" ? BigInt(row.quoteAmount) + BigInt(row.fee) : BigInt(row.quoteAmount) - BigInt(row.fee);
  return {
    id: row.id,
    side: row.side,
    trader: row.trader,
    /** The curve-side amount: what went into the curve (buy) or left its reserve (sell). Fee excluded. */
    quoteAmount: row.quoteAmount,
    /** Trading fee on this trade. */
    fee: row.fee,
    /** What the trader paid (buy) or received (sell), fee included. */
    traderAmount: traderAmount.toString(),
    tokenAmount: row.tokenAmount,
    price: row.price,
    quoteReserve: row.quoteReserve,
    tokenReserve: row.tokenReserve,
    txHash: row.txHash,
    blockNumber: row.blockNumber,
    blockTime: row.blockTime.toISOString(),
  };
}

export function serializeCandle(c: { time: number; open: bigint; high: bigint; low: bigint; close: bigint; volume: bigint; trades: number }) {
  return {
    time: c.time,
    open: c.open.toString(),
    high: c.high.toString(),
    low: c.low.toString(),
    close: c.close.toString(),
    volume: c.volume.toString(),
    trades: c.trades,
  };
}
