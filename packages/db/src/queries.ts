import { sql } from "drizzle-orm";
import type { Db } from "./client.js";
import { quoteTokenEvents, type QuoteTokenEventRow } from "./schema.js";

/**
 * The current setting of every quote asset: the newest change event for each. An asset whose
 * newest event says `enabled = false` is switched off for new launches.
 */
export async function currentQuoteTokens(db: Db): Promise<QuoteTokenEventRow[]> {
  return db
    .selectDistinctOn([quoteTokenEvents.quoteToken])
    .from(quoteTokenEvents)
    .orderBy(quoteTokenEvents.quoteToken, sql`${quoteTokenEvents.blockNumber} desc`, sql`${quoteTokenEvents.indexInBlock} desc`);
}
