import { Inject, Injectable } from "@nestjs/common";
import { initialReserves, spotPrice } from "@launchpad/chain";
import { type Db, type Holder, type LaunchRow, type TradeRow, and, asc, desc, eq, gte, inArray, launches, lt, lte, sql, trades, holdersOf } from "@launchpad/db";
import { type Candle, INTERVAL_SECONDS, buildCandles, changeBps } from "../candles.js";
import { DB } from "../database.js";
import { TtlCache } from "../security.js";
import type { CandlesQuery, ListLaunchesQuery, TradesQuery } from "./launches.query.js";

/** A launch plus its price change over the last 24 hours (or since launch, if younger), in basis points. */
export type LaunchWithChange = LaunchRow & { change24hBps: number | null };

const DAY_MS = 24 * 60 * 60 * 1000;

/** The price a curve opened at, before any trade. */
function openingPrice(launch: LaunchRow): bigint {
  const opening = initialReserves(launch.preset, BigInt(launch.graduationRaise));
  return spotPrice(opening.quoteReserve, opening.tokenReserve);
}

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
  private readonly holderCache = new TtlCache<{ holders: Holder[]; count: number; minted: bigint }>(process.env.NODE_ENV === "test" ? 0 : 5_000, 200);
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * Add each launch's 24h price change. The reference is the price after the last trade at least 24
   * hours ago; for a launch with no trade that old, the price it opened at. One query for all launches.
   */
  private async withChange(rows: LaunchRow[], now = Date.now()): Promise<LaunchWithChange[]> {
    if (rows.length === 0) return [];
    const cutoff = new Date(now - DAY_MS);
    const refs = await this.db
      .selectDistinctOn([trades.curve], { curve: trades.curve, price: trades.price })
      .from(trades)
      .where(and(inArray(trades.curve, rows.map((r) => r.curve)), lte(trades.blockTime, cutoff)))
      .orderBy(trades.curve, desc(trades.blockNumber), desc(trades.indexInBlock));
    const byCurve = new Map(refs.map((r) => [r.curve, BigInt(r.price)]));
    return rows.map((row) => ({
      ...row,
      change24hBps: changeBps(BigInt(row.price), byCurve.get(row.curve) ?? openingPrice(row)),
    }));
  }

  async list(query: ListLaunchesQuery): Promise<{ items: LaunchWithChange[]; total: number }> {
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
    return { items: await this.withChange(items), total: count?.n ?? 0 };
  }

  async get(token: string): Promise<LaunchWithChange | undefined> {
    const row = await this.getRow(token);
    return row ? (await this.withChange([row]))[0] : undefined;
  }

  private async getRow(token: string): Promise<LaunchRow | undefined> {
    const [row] = await this.db.select().from(launches).where(eq(launches.token, token));
    return row;
  }

  /**
   * Candles for a launch, oldest first, ending now. Empty buckets are flat at the previous close, and
   * nothing is drawn before the launch existed. Undefined if the launch does not exist.
   */
  async candles(token: string, query: CandlesQuery, now = Date.now()): Promise<{ launch: LaunchRow; items: Candle[] } | undefined> {
    const launch = await this.getRow(token);
    if (!launch) return undefined;
    const size = INTERVAL_SECONDS[query.interval];
    const nowSec = Math.floor(now / 1000);
    const lastBucket = Math.floor(nowSec / size) * size;
    const launchBucket = Math.floor(launch.createdAt.getTime() / 1000 / size) * size;
    const from = Math.max(lastBucket - (query.limit - 1) * size, launchBucket);
    const fromDate = new Date(from * 1000);

    const [prior] = await this.db
      .select({ price: trades.price })
      .from(trades)
      .where(and(eq(trades.curve, launch.curve), lt(trades.blockTime, fromDate)))
      .orderBy(desc(trades.blockNumber), desc(trades.indexInBlock))
      .limit(1);
    const rows = await this.db
      .select({ blockTime: trades.blockTime, price: trades.price, quoteAmount: trades.quoteAmount })
      .from(trades)
      .where(and(eq(trades.curve, launch.curve), gte(trades.blockTime, fromDate)))
      .orderBy(asc(trades.blockNumber), asc(trades.indexInBlock))
      .limit(20_000);

    const items = buildCandles(
      rows.map((r) => ({ time: Math.floor(r.blockTime.getTime() / 1000), price: BigInt(r.price), quoteAmount: BigInt(r.quoteAmount) })),
      query.interval,
      from,
      nowSec,
      prior ? BigInt(prior.price) : openingPrice(launch),
    );
    return { launch, items };
  }

  /** Trades for a launch, newest first. Undefined if the launch does not exist. */
  /**
   * Who holds a token. Every holder is read (not just the page returned) so the counts and the
   * concentration figure are exact; that is fine at launchpad scale and cheap, since it is two grouped
   * sums over one token's transfers. Undefined if the launch does not exist.
   */
  async holders(token: string): Promise<{ launch: LaunchRow; holders: Holder[]; count: number; minted: bigint } | undefined> {
    const launch = await this.getRow(token);
    if (!launch) return undefined;
    // Reading every holder is the heaviest query we serve, so repeats within a few seconds share one answer.
    const { holders, count, minted } = await this.holderCache.get(token, () => holdersOf(this.db, token, 100_000));
    return { launch, holders, count, minted };
  }

  async tradesFor(token: string, query: TradesQuery): Promise<{ items: TradeRow[]; total: number } | undefined> {
    const launch = await this.getRow(token);
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
