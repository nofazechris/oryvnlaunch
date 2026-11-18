import { eq, sql } from "drizzle-orm";
import type { Db } from "./client.js";
import { feeAssetEvents, quoteTokenEvents, transfers, type FeeAssetEventRow, type QuoteTokenEventRow } from "./schema.js";

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

/**
 * The current setting of every deploy-fee asset: the newest change event for each. An asset whose
 * newest event says `enabled = false` can no longer pay for new launches.
 */
export async function currentFeeAssets(db: Db): Promise<FeeAssetEventRow[]> {
  return db
    .selectDistinctOn([feeAssetEvents.feeToken])
    .from(feeAssetEvents)
    .orderBy(feeAssetEvents.feeToken, sql`${feeAssetEvents.blockNumber} desc`, sql`${feeAssetEvents.indexInBlock} desc`);
}

const ZERO_ADDRESS = "0x" + "0".repeat(64);

export interface Holder {
  address: string;
  /** In the token's smallest unit, exact. */
  balance: bigint;
}

/**
 * Who holds a token, biggest first: every address whose transfers add up to more than zero. The
 * zero address (the mint source) is never a holder. `count` is all holders, not just the `limit`
 * returned, and `minted` is the total ever minted, so a caller can show each balance as a share.
 *
 * Two grouped sums (what each address received, what each sent), combined here. The work scales
 * with the number of distinct addresses, not the number of transfers.
 */
export async function holdersOf(db: Db, token: string, limit = 50): Promise<{ holders: Holder[]; count: number; minted: bigint }> {
  const received = await db
    .select({ address: transfers.to, total: sql<string>`sum(${transfers.value})::text` })
    .from(transfers)
    .where(eq(transfers.token, token))
    .groupBy(transfers.to);
  const sent = await db
    .select({ address: transfers.from, total: sql<string>`sum(${transfers.value})::text` })
    .from(transfers)
    .where(eq(transfers.token, token))
    .groupBy(transfers.from);

  const balances = new Map<string, bigint>();
  for (const r of received) balances.set(r.address, (balances.get(r.address) ?? 0n) + BigInt(r.total));
  for (const r of sent) balances.set(r.address, (balances.get(r.address) ?? 0n) - BigInt(r.total));

  const minted = -(balances.get(ZERO_ADDRESS) ?? 0n);
  const all = [...balances]
    .filter(([address, balance]) => address !== ZERO_ADDRESS && balance > 0n)
    .map(([address, balance]) => ({ address, balance }))
    .sort((a, b) => (a.balance === b.balance ? a.address.localeCompare(b.address) : a.balance > b.balance ? -1 : 1));
  return { holders: all.slice(0, limit), count: all.length, minted };
}
