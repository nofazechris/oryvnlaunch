import { Controller, Get, HttpException, Inject } from "@nestjs/common";
import { type Db, currentFeeAssets, currentQuoteTokens, indexerState, inArray, launches, sql, trades } from "@launchpad/db";
import { describeQuoteAsset } from "./assets.js";
import { TtlCache } from "./security.js";
import { DB } from "./database.js";

@Controller()
export class MarketController {
  private readonly statsCache = new TtlCache<unknown>(process.env.NODE_ENV === "test" ? 0 : 15_000, 1);
  constructor(@Inject(DB) private readonly db: Db) {}

  /** The assets a creator can launch in right now, with each one's fee and graduation raise. */
  @Get("quote-tokens")
  async quoteTokens() {
    const rows = await currentQuoteTokens(this.db);
    return {
      items: rows.map((row) => ({
        ...describeQuoteAsset(row.quoteToken),
        enabled: row.enabled,
        deployFee: row.deployFee,
        graduationRaise: row.graduationRaise,
        sinceBlock: row.blockNumber,
      })),
    };
  }

  /**
   * The assets a creator can pay the deploy fee in (STRK, USDC), with each one's fee. This is only how
   * the creator pays: every token trades in STRK.
   */
  @Get("fee-assets")
  async feeAssets() {
    const rows = await currentFeeAssets(this.db);
    return {
      items: rows.map((row) => ({
        ...describeQuoteAsset(row.feeToken),
        enabled: row.enabled,
        deployFee: row.deployFee,
        sinceBlock: row.blockNumber,
      })),
    };
  }

  /** Platform totals, for the landing page and for tracking growth. */
  @Get("stats")
  stats() {
    // Counting everyone touches every trade, so do it at most every 15 seconds however many callers ask.
    return this.statsCache.get("stats", () => this.computeStats());
  }

  private async computeStats() {
    const [counts] = await this.db
      .select({
        launches: sql<number>`count(*)::int`,
        graduated: sql<number>`count(*) filter (where ${launches.graduated})::int`,
        trades: sql<number>`coalesce(sum(${launches.tradeCount}), 0)::int`,
      })
      .from(launches);
    // Distinct wallets that have ever launched or traded. Two small queries merged here keeps this
    // portable across the database drivers we run on.
    const traders = await this.db.selectDistinct({ wallet: trades.trader }).from(trades).limit(200_000);
    const creators = await this.db.selectDistinct({ wallet: launches.creator }).from(launches).limit(200_000);
    const wallets = new Set([...traders.map((t) => t.wallet), ...creators.map((c) => c.wallet)]);
    const perAsset = await this.db
      .select({
        quoteToken: launches.quoteToken,
        launches: sql<number>`count(*)::int`,
        volume: sql<string>`coalesce(sum(${launches.volumeQuote}), 0)::text`,
        fees: sql<string>`coalesce(sum(${launches.feesTotal}), 0)::text`,
      })
      .from(launches)
      .groupBy(launches.quoteToken);
    return {
      launches: counts?.launches ?? 0,
      graduated: counts?.graduated ?? 0,
      trades: counts?.trades ?? 0,
      wallets: wallets.size,
      /** Amounts are exact strings in each asset's smallest unit; assets are never added together. */
      byAsset: perAsset.map((a) => ({ ...describeQuoteAsset(a.quoteToken), launches: a.launches, volume: a.volume, fees: a.fees })),
    };
  }

  /** Is the service up, can it reach the database, and how fresh is the indexer? */
  @Get("health")
  async health() {
    try {
      await this.db.execute(sql`select 1`);
    } catch {
      throw new HttpException({ status: "down", database: "unreachable" }, 503);
    }
    const rows = await this.db.select().from(indexerState).where(inArray(indexerState.key, ["cursor"]));
    const cursor = rows[0];
    return {
      status: "ok",
      database: "ok",
      indexer: cursor
        ? {
            block: Number(cursor.value),
            updatedAt: cursor.updatedAt.toISOString(),
            ageSeconds: Math.max(0, Math.round((Date.now() - cursor.updatedAt.getTime()) / 1000)),
          }
        : null,
    };
  }
}
