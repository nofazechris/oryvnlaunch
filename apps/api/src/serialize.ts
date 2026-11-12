// How rows leave the API.
//
// Every amount, price and market cap is a DECIMAL STRING in the asset's smallest unit. Never a
// JSON number: JavaScript numbers lose precision above 2^53, and these values go up to 2^256.
// Clients convert with BigInt and format using the asset's `decimals`.

import { PRESET_NAMES, graduationProgressBps } from "@launchpad/chain";
import type { LaunchRow, TradeRow } from "@launchpad/db";
import { describeQuoteAsset } from "./assets.js";

export function serializeLaunch(row: LaunchRow) {
  return {
    token: row.token,
    curve: row.curve,
    creator: row.creator,
    quote: describeQuoteAsset(row.quoteToken),
    name: row.name,
    symbol: row.symbol,
    metadataUri: row.metadataUri,
    preset: { id: row.preset, name: PRESET_NAMES[row.preset] ?? null },
    creatorBps: row.creatorBps,
    graduationRaise: row.graduationRaise,
    deployFee: row.deployFee,
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

export function serializeTrade(row: TradeRow) {
  return {
    id: row.id,
    side: row.side,
    trader: row.trader,
    quoteAmount: row.quoteAmount,
    tokenAmount: row.tokenAmount,
    price: row.price,
    quoteReserve: row.quoteReserve,
    tokenReserve: row.tokenReserve,
    txHash: row.txHash,
    blockNumber: row.blockNumber,
    blockTime: row.blockTime.toISOString(),
  };
}
