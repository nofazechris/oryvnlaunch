// The polling loop: decide which blocks to read, read the factory's and every curve's events
// for them, and hand the lot to `applyBatch`.
//
// Why polling and not Apibara (the PRD's choice): this keeps the indexer working against devnet,
// a public Sepolia node or any paid provider with no extra account, and it is testable end to
// end. The cost is one `getEvents` call per curve per pass, which is fine for hundreds of
// launches and not for tens of thousands. `ChainSource` is the seam: an Apibara-backed source
// can replace this one without touching `applyBatch` or the database.

import {
  CURVE_EVENT_KEYS,
  TOKEN_EVENT_KEYS,
  type CurveEvent,
  type FactoryEvent,
  type RawEvent,
  type TokenTransfer,
  decodeCurveEvent,
  decodeFactoryEvent,
  decodeTokenEvent,
} from "@launchpad/chain";
import { type Db, launches, lte } from "@launchpad/db";
import { type Batch, applyBatch, getCursor } from "./project.js";

/** What the indexer needs from a node. `StarknetRpc` from @launchpad/chain satisfies it. */
export interface ChainSource {
  blockNumber(): Promise<number>;
  /** Hash of the block currently at this height. */
  blockHash(blockNumber: number): Promise<string>;
  /** Timestamp in unix seconds of the block with this hash. */
  blockTimestamp(blockHash: string): Promise<number>;
  getEvents(args: { address: string; fromBlock: number; toBlock: number; keys?: string[] }): Promise<RawEvent[]>;
}

export interface IndexerOptions {
  factory: string;
  startBlock: number;
  overlapBlocks: number;
  maxBlockRange: number;
  /** How many curves to read at once. Default 4. */
  concurrency?: number;
}

export type Logger = (level: "info" | "error", message: string, fields?: Record<string, unknown>) => void;

export type TickResult =
  | { status: "idle"; head: number }
  | { status: "indexed"; head: number; from: number; to: number; factoryEvents: number; curveEvents: number; tokenEvents: number; caughtUp: boolean };

/**
 * Decode raw events, numbering each by its position among that contract's events in its block.
 * The number only has to be stable: the same block read the same way gives the same numbers.
 */
function decodeAll<T>(raw: RawEvent[], decode: (event: RawEvent, indexInBlock: number) => T | null): T[] {
  const seen = new Map<number, number>();
  const out: T[] = [];
  for (const event of raw) {
    const index = seen.get(event.block_number) ?? 0;
    seen.set(event.block_number, index + 1);
    const decoded = decode(event, index);
    if (decoded !== null) out.push(decoded);
  }
  return out;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i] as T);
    }
  });
  await Promise.all(workers);
  return results;
}

const sameHash = (a: string, b: string): boolean => BigInt(a) === BigInt(b);

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => (clearTimeout(timer), resolve()), { once: true });
  });

export class Indexer {
  constructor(
    private readonly source: ChainSource,
    private readonly db: Db,
    private readonly options: IndexerOptions,
    private readonly log: Logger = () => {},
  ) {}

  /** Read and apply the next range of blocks, if there is one. */
  async tick(): Promise<TickResult> {
    const { factory, startBlock, overlapBlocks, maxBlockRange } = this.options;
    const head = await this.source.blockNumber();
    const cursor = await getCursor(this.db);

    let from: number;
    if (cursor === null) {
      from = startBlock;
    } else {
      // Is the block we last indexed still the block the node has at that height? If so the chain
      // only grew, and we continue right after it. If not (or the node's head is behind us), the
      // chain moved under us: go back `overlapBlocks` and rebuild from there.
      const probe = Math.min(cursor.block, head);
      const onChain = await this.source.blockHash(probe);
      const continuous = probe === cursor.block && sameHash(onChain, cursor.hash);
      if (continuous) {
        if (head === cursor.block) return { status: "idle", head };
        from = cursor.block + 1;
      } else {
        from = Math.max(startBlock, probe + 1 - overlapBlocks);
        this.log("error", "chain changed under the indexer, rebuilding recent blocks", {
          indexedBlock: cursor.block,
          head,
          rebuildFrom: from,
        });
      }
    }
    const to = Math.min(head, from + maxBlockRange - 1);
    if (to < from) return { status: "idle", head };

    // The factory first: it announces new curves.
    const factoryEvents: FactoryEvent[] = decodeAll(
      await this.source.getEvents({ address: factory, fromBlock: from, toBlock: to }),
      decodeFactoryEvent,
    );

    // Every curve we know of, plus any announced in this very range.
    const known = await this.db.select({ curve: launches.curve, token: launches.token }).from(launches).where(lte(launches.createdBlock, to));
    const curves = new Set(known.map((row) => row.curve));
    const tokens = new Set(known.map((row) => row.token));
    for (const event of factoryEvents) {
      if (event.type !== "LaunchCreated") continue;
      curves.add(event.curve);
      tokens.add(event.token);
    }

    const perCurve = await mapLimit([...curves], this.options.concurrency ?? 4, async (curve) =>
      decodeAll(
        await this.source.getEvents({ address: curve, fromBlock: from, toBlock: to, keys: CURVE_EVENT_KEYS }),
        decodeCurveEvent,
      ),
    );
    const curveEvents: CurveEvent[] = perCurve.flat();

    // Every token's transfers, which is what holder balances are built from. A launch announced in
    // this range has its mint here too, because the token is created in the same transaction.
    const perToken = await mapLimit([...tokens], this.options.concurrency ?? 4, async (token) =>
      decodeAll(
        await this.source.getEvents({ address: token, fromBlock: from, toBlock: to, keys: TOKEN_EVENT_KEYS }),
        decodeTokenEvent,
      ),
    );
    const tokenEvents: TokenTransfer[] = perToken.flat();

    // Block times, looked up by hash so a reorg can never serve a stale time for a block number.
    const hashByBlock = new Map<number, string>();
    for (const event of [...factoryEvents, ...curveEvents, ...tokenEvents]) hashByBlock.set(event.blockNumber, event.blockHash);
    const blockTimes = new Map<number, number>();
    for (const [block, hash] of [...hashByBlock].sort((a, b) => a[0] - b[0])) {
      blockTimes.set(block, await this.source.blockTimestamp(hash));
    }

    const toHash = await this.source.blockHash(to);
    const batch: Batch = { from, to, toHash, factoryEvents, curveEvents, tokenEvents, blockTimes };
    await applyBatch(this.db, batch);

    return {
      status: "indexed",
      head,
      from,
      to,
      factoryEvents: factoryEvents.length,
      curveEvents: curveEvents.length,
      tokenEvents: tokenEvents.length,
      caughtUp: to >= head,
    };
  }

  /** Poll until aborted. Failures are logged and retried with a growing pause, never swallowed. */
  async run(signal: AbortSignal, pollIntervalMs: number): Promise<void> {
    let failures = 0;
    while (!signal.aborted) {
      try {
        const result = await this.tick();
        failures = 0;
        if (result.status === "indexed") {
          this.log("info", "indexed blocks", { ...result });
          if (!result.caughtUp) continue; // still catching up: go straight to the next range
        }
        await sleep(pollIntervalMs, signal);
      } catch (error) {
        failures += 1;
        const pause = Math.min(30_000, pollIntervalMs * 2 ** Math.min(failures, 5));
        this.log("error", "indexing failed, will retry", {
          error: error instanceof Error ? error.message : String(error),
          failures,
          retryInMs: pause,
        });
        await sleep(pause, signal);
      }
    }
  }
}
