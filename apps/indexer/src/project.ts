// Turning decoded chain events into database rows.
//
// The one rule that matters: applying the same block range twice must leave the database
// exactly as applying it once. That is what makes retries, restarts and reorgs safe. It is done
// by REWINDING the range first (delete what was derived from it) and then applying the events
// the chain reports now. If the chain still says the same thing, nothing changes. If a shallow
// reorg removed a trade, the trade disappears. Snapshots on `launches` are recomputed from the
// trades table every time, never nudged by deltas, so they cannot drift.

import {
  type CurveEvent,
  type FactoryEvent,
  initialReserves,
  marketCap,
  spotPrice,
} from "@launchpad/chain";
import {
  type Db,
  desc,
  eq,
  gte,
  indexerState,
  inArray,
  launches,
  quoteTokenEvents,
  sql,
  trades,
} from "@launchpad/db";

export const CURSOR_KEY = "cursor";
export const CURSOR_HASH_KEY = "cursor_hash";

/** How far indexing has got: the last block applied, and that block's hash at the time. */
export interface Cursor {
  block: number;
  hash: string;
}

export interface Batch {
  /**
   * Inclusive block range this batch covers. Everything derived from block `from` onwards is
   * rebuilt, including anything beyond `to` left over from a chain that has since rolled back.
   */
  from: number;
  to: number;
  /** Hash of block `to` when it was read, so the next pass can tell whether the chain moved under us. */
  toHash: string;
  factoryEvents: FactoryEvent[];
  curveEvents: CurveEvent[];
  /** Unix seconds, for every block that has an event. */
  blockTimes: ReadonlyMap<number, number>;
}

export async function getCursor(db: Db): Promise<Cursor | null> {
  const rows = await db.select().from(indexerState).where(inArray(indexerState.key, [CURSOR_KEY, CURSOR_HASH_KEY]));
  const block = rows.find((r) => r.key === CURSOR_KEY);
  const hash = rows.find((r) => r.key === CURSOR_HASH_KEY);
  return block && hash ? { block: Number(block.value), hash: hash.value } : null;
}

const asDate = (blockTimes: ReadonlyMap<number, number>, block: number): Date => {
  const seconds = blockTimes.get(block);
  if (seconds === undefined) throw new Error(`no timestamp for block ${block}`);
  return new Date(seconds * 1000);
};

export async function applyBatch(db: Db, batch: Batch): Promise<void> {
  await db.transaction(async (tx) => {
    const touched = new Set<string>();

    // 1. Rewind from `from` onwards. Normally nothing exists past `to`, so this is the same as
    //    rewinding the range. If the chain rolled back, it also clears what the old chain left.
    const staleTrades = await tx
      .selectDistinct({ curve: trades.curve })
      .from(trades)
      .where(gte(trades.blockNumber, batch.from));
    for (const row of staleTrades) touched.add(row.curve);
    await tx.delete(trades).where(gte(trades.blockNumber, batch.from));

    await tx.delete(launches).where(gte(launches.createdBlock, batch.from));
    await tx.delete(quoteTokenEvents).where(gte(quoteTokenEvents.blockNumber, batch.from));

    const staleGraduations = await tx
      .update(launches)
      .set({ graduated: false, graduatedBlock: null, graduatedAt: null })
      .where(gte(launches.graduatedBlock, batch.from))
      .returning({ curve: launches.curve });
    for (const row of staleGraduations) touched.add(row.curve);

    // 2. Quote asset changes, kept as history.
    for (const event of batch.factoryEvents) {
      if (event.type !== "QuoteTokenSet") continue;
      await tx
        .insert(quoteTokenEvents)
        .values({
          id: `${event.blockNumber}:${event.factory}:${event.indexInBlock}`,
          quoteToken: event.quoteToken,
          enabled: event.enabled,
          deployFee: event.deployFee.toString(),
          graduationRaise: event.graduationRaise.toString(),
          blockNumber: event.blockNumber,
          indexInBlock: event.indexInBlock,
        })
        .onConflictDoNothing();
    }

    // 3. New launches, opening at the curve's starting reserves.
    for (const event of batch.factoryEvents) {
      if (event.type !== "LaunchCreated") continue;
      const opening = initialReserves(event.preset, event.graduationRaise);
      await tx
        .insert(launches)
        .values({
          token: event.token,
          curve: event.curve,
          factory: event.factory,
          creator: event.creator,
          quoteToken: event.quoteToken,
          launchId: event.launchId.toString(),
          name: event.name,
          symbol: event.symbol,
          metadataUri: event.metadataUri,
          preset: event.preset,
          creatorBps: event.creatorBps,
          graduationRaise: event.graduationRaise.toString(),
          deployFee: event.deployFee.toString(),
          createdBlock: event.blockNumber,
          createdTx: event.transactionHash,
          createdAt: asDate(batch.blockTimes, event.blockNumber),
          quoteReserve: opening.quoteReserve.toString(),
          tokenReserve: opening.tokenReserve.toString(),
          price: spotPrice(opening.quoteReserve, opening.tokenReserve).toString(),
          marketCap: marketCap(opening.quoteReserve, opening.tokenReserve).toString(),
        })
        .onConflictDoNothing();
      touched.add(event.curve);
    }

    // 4. Trades and graduation.
    const curvesInBatch = [...new Set(batch.curveEvents.map((e) => e.curve))];
    const tokenByCurve = new Map<string, string>();
    for (const curve of curvesInBatch) {
      const [launch] = await tx.select({ token: launches.token }).from(launches).where(eq(launches.curve, curve));
      // A curve event for a curve we never saw launch means we missed a factory event. Stop
      // rather than guess: silently dropping it would put wrong numbers in the database.
      if (!launch) throw new Error(`event from unknown curve ${curve}: its LaunchCreated was never indexed`);
      tokenByCurve.set(curve, launch.token);
    }

    for (const event of batch.curveEvents) {
      const token = tokenByCurve.get(event.curve) as string;
      touched.add(event.curve);
      if (event.type === "Graduated") {
        await tx
          .update(launches)
          .set({
            graduated: true,
            graduatedBlock: event.blockNumber,
            graduatedAt: asDate(batch.blockTimes, event.blockNumber),
          })
          .where(eq(launches.curve, event.curve));
        continue;
      }
      const buy = event.type === "TokensBought";
      await tx
        .insert(trades)
        .values({
          id: `${event.blockNumber}:${event.curve}:${event.indexInBlock}`,
          curve: event.curve,
          token,
          side: buy ? "buy" : "sell",
          trader: buy ? event.buyer : (event as Extract<CurveEvent, { type: "TokensSold" }>).seller,
          quoteAmount: (buy ? event.quoteIn : (event as Extract<CurveEvent, { type: "TokensSold" }>).quoteOut).toString(),
          tokenAmount: (buy ? event.tokensOut : (event as Extract<CurveEvent, { type: "TokensSold" }>).tokensIn).toString(),
          quoteReserve: event.quoteReserve.toString(),
          tokenReserve: event.tokenReserve.toString(),
          price: spotPrice(event.quoteReserve, event.tokenReserve).toString(),
          blockNumber: event.blockNumber,
          indexInBlock: event.indexInBlock,
          txHash: event.transactionHash,
          blockTime: asDate(batch.blockTimes, event.blockNumber),
        })
        .onConflictDoNothing();
    }

    // 5. Snapshots, recomputed from the trades table.
    for (const curve of touched) await refreshSnapshot(tx, curve);

    // 6. Progress commits in the same transaction as the data it describes.
    for (const [key, value] of [
      [CURSOR_KEY, String(batch.to)],
      [CURSOR_HASH_KEY, batch.toHash],
    ] as const) {
      await tx
        .insert(indexerState)
        .values({ key, value })
        .onConflictDoUpdate({ target: indexerState.key, set: { value, updatedAt: sql`now()` } });
    }
  });
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Rebuild one launch's market snapshot from its trades. */
async function refreshSnapshot(tx: Tx, curve: string): Promise<void> {
  const [launch] = await tx.select().from(launches).where(eq(launches.curve, curve));
  if (!launch) return; // rewound and not re-created in this batch: nothing to update

  const [totals] = await tx
    .select({
      count: sql<number>`count(*)::int`,
      volume: sql<string>`coalesce(sum(${trades.quoteAmount}), 0)::text`,
    })
    .from(trades)
    .where(eq(trades.curve, curve));
  const [last] = await tx
    .select()
    .from(trades)
    .where(eq(trades.curve, curve))
    .orderBy(desc(trades.blockNumber), desc(trades.indexInBlock))
    .limit(1);

  const reserves = last
    ? { quoteReserve: BigInt(last.quoteReserve), tokenReserve: BigInt(last.tokenReserve) }
    : initialReserves(launch.preset, BigInt(launch.graduationRaise));

  await tx
    .update(launches)
    .set({
      quoteReserve: reserves.quoteReserve.toString(),
      tokenReserve: reserves.tokenReserve.toString(),
      price: spotPrice(reserves.quoteReserve, reserves.tokenReserve).toString(),
      marketCap: marketCap(reserves.quoteReserve, reserves.tokenReserve).toString(),
      tradeCount: totals?.count ?? 0,
      volumeQuote: totals?.volume ?? "0",
      lastTradeAt: last?.blockTime ?? null,
    })
    .where(eq(launches.curve, curve));
}
