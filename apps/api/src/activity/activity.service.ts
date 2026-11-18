import { Inject, Injectable } from "@nestjs/common";
import { type Db, and, desc, eq, isNotNull, launches, trades } from "@launchpad/db";
import { DB } from "../database.js";
import type { ActivityQuery } from "../launches/launches.query.js";

export interface ActivityEvent {
  kind: "launch" | "buy" | "sell" | "graduation";
  time: Date;
  token: string;
  symbol: string;
  name: string;
  quoteToken: string;
  /** Null for a graduation, which has no wallet of its own. */
  wallet: string | null;
  /**
   * Buy: what the wallet paid, fee included. Sell: what it received, after the fee. Launch: the deploy
   * fee the creator paid. Graduation: null. In the quote asset's smallest unit.
   */
  amount: bigint | null;
  tokenAmount: bigint | null;
  txHash: string | null;
  blockNumber: number | null;
}

@Injectable()
export class ActivityService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Recent platform events, newest first: launches, buys, sells and graduations, merged. */
  async recent(query: ActivityQuery): Promise<ActivityEvent[]> {
    const { limit, wallet, token } = query;
    const events: ActivityEvent[] = [];

    const tradeRows = await this.db
      .select({
        side: trades.side,
        trader: trades.trader,
        quoteAmount: trades.quoteAmount,
        fee: trades.fee,
        tokenAmount: trades.tokenAmount,
        txHash: trades.txHash,
        blockNumber: trades.blockNumber,
        blockTime: trades.blockTime,
        token: launches.token,
        symbol: launches.symbol,
        name: launches.name,
        quoteToken: launches.quoteToken,
      })
      .from(trades)
      .innerJoin(launches, eq(trades.curve, launches.curve))
      .where(and(wallet ? eq(trades.trader, wallet) : undefined, token ? eq(launches.token, token) : undefined))
      .orderBy(desc(trades.blockNumber), desc(trades.indexInBlock))
      .limit(limit);
    for (const r of tradeRows) {
      const curveSide = BigInt(r.quoteAmount);
      const fee = BigInt(r.fee);
      events.push({
        kind: r.side,
        time: r.blockTime,
        token: r.token,
        symbol: r.symbol,
        name: r.name,
        quoteToken: r.quoteToken,
        wallet: r.trader,
        amount: r.side === "buy" ? curveSide + fee : curveSide - fee,
        tokenAmount: BigInt(r.tokenAmount),
        txHash: r.txHash,
        blockNumber: r.blockNumber,
      });
    }

    const launchFilter = and(wallet ? eq(launches.creator, wallet) : undefined, token ? eq(launches.token, token) : undefined);
    const launchRows = await this.db.select().from(launches).where(launchFilter).orderBy(desc(launches.createdAt)).limit(limit);
    for (const l of launchRows) {
      events.push({
        kind: "launch",
        time: l.createdAt,
        token: l.token,
        symbol: l.symbol,
        name: l.name,
        quoteToken: l.quoteToken,
        wallet: l.creator,
        amount: BigInt(l.deployFee),
        tokenAmount: null,
        txHash: l.createdTx,
        blockNumber: l.createdBlock,
      });
    }

    // A graduation belongs to a token, not a wallet, so a per-wallet feed does not include them.
    if (!wallet) {
      const graduated = await this.db
        .select()
        .from(launches)
        .where(and(eq(launches.graduated, true), isNotNull(launches.graduatedAt), token ? eq(launches.token, token) : undefined))
        .orderBy(desc(launches.graduatedAt))
        .limit(limit);
      for (const l of graduated) {
        events.push({
          kind: "graduation",
          time: l.graduatedAt as Date,
          token: l.token,
          symbol: l.symbol,
          name: l.name,
          quoteToken: l.quoteToken,
          wallet: null,
          amount: null,
          tokenAmount: null,
          txHash: null,
          blockNumber: l.graduatedBlock,
        });
      }
    }

    // Newest first. At the same instant, a graduation follows the buy that caused it, so it sorts above it.
    const rank = { graduation: 3, buy: 2, sell: 2, launch: 1 } as const;
    events.sort((a, b) => b.time.getTime() - a.time.getTime() || rank[b.kind] - rank[a.kind]);
    return events.slice(0, limit);
  }
}
