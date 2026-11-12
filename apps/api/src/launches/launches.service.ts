import { Inject, Injectable } from "@nestjs/common";
import { type Db, type LaunchRow, type TradeRow, and, desc, eq, launches, sql, trades } from "@launchpad/db";
import { DB } from "../database.js";
import type { ListLaunchesQuery, TradesQuery } from "./launches.query.js";

/**
 * Graduation progress as a SQL expression, 0 to 10000, mirroring graduationProgressBps in
 * @launchpad/chain: how much of the raise the curve holds beyond its virtual reserve. Used only to
 * ORDER launches. The number shown to clients is computed in TypeScript from the same rule,
 * including that a graduated launch is always at 10000.
 */
const progressBps = sql`case when ${launches.graduated} then 10000 else greatest(0, least(10000,
  floor(${launches.quoteReserve} * 10000 / ${launches.graduationRaise})
  - case ${launches.preset} when 0 then 10000 when 1 then 5000 else 2500 end)) end`;

@Injectable()
export class LaunchesService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async list(query: ListLaunchesQuery): Promise<{ items: LaunchRow[]; total: number }> {
    const filters = [
      query.quote ? eq(launches.quoteToken, query.quote) : undefined,
      query.creator ? eq(launches.creator, query.creator) : undefined,
      query.graduated === undefined ? undefined : eq(launches.graduated, query.graduated),
    ].filter((f): f is NonNullable<typeof f> => f !== undefined);
    const where = filters.length ? and(...filters) : undefined;

    const order = {
      newest: [desc(launches.createdAt), desc(launches.token)],
      volume: [desc(launches.volumeQuote), desc(launches.token)],
      marketcap: [desc(launches.marketCap), desc(launches.token)],
      progress: [desc(progressBps), desc(launches.createdAt), desc(launches.token)],
    }[query.sort];

    const items = await this.db.select().from(launches).where(where).orderBy(...order).limit(query.limit).offset(query.offset);
    const [count] = await this.db.select({ n: sql<number>`count(*)::int` }).from(launches).where(where);
    return { items, total: count?.n ?? 0 };
  }

  async get(token: string): Promise<LaunchRow | undefined> {
    const [row] = await this.db.select().from(launches).where(eq(launches.token, token));
    return row;
  }

  /** Trades for a launch, newest first. Undefined if the launch does not exist. */
  async tradesFor(token: string, query: TradesQuery): Promise<{ items: TradeRow[]; total: number } | undefined> {
    const launch = await this.get(token);
    if (!launch) return undefined;
    const items = await this.db
      .select()
      .from(trades)
      .where(eq(trades.curve, launch.curve))
      .orderBy(desc(trades.blockNumber), desc(trades.indexInBlock))
      .limit(query.limit)
      .offset(query.offset);
    return { items, total: launch.tradeCount };
  }
}
