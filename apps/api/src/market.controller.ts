import { Controller, Get, HttpException, Inject } from "@nestjs/common";
import { type Db, currentQuoteTokens, indexerState, inArray, sql } from "@launchpad/db";
import { describeQuoteAsset } from "./assets.js";
import { DB } from "./database.js";

@Controller()
export class MarketController {
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
