// Shared by the indexer tests: a fake node that replays REAL events captured from a devnet, and
// that can grow, fork and roll back on command, plus helpers to read the database back.

import { readFileSync } from "node:fs";
import { normalizeAddress, type RawEvent } from "@launchpad/chain";
import { type Db, indexerState, launches, quoteTokenEvents, trades } from "@launchpad/db";
import type { ChainSource, Indexer, TickResult } from "./indexer.js";

export interface Fixture {
  capturedAtBlock: number;
  factory: string;
  factoryEvents: RawEvent[];
  curveEvents: Record<string, RawEvent[]>;
  expected: Record<string, { spotPrice: string[]; state: string[] }>;
  timestamps: Record<string, number>;
}

/** Events captured from a devnet that ran the smoke scenario: see packages/chain/scripts/capture-fixtures.mjs. */
export const fixture: Fixture = JSON.parse(
  readFileSync(new URL("../../../packages/chain/fixtures/devnet-events.json", import.meta.url), "utf8"),
) as Fixture;

export const FACTORY = normalizeAddress(fixture.factory);
export const CURVE = normalizeAddress(Object.keys(fixture.curveEvents)[0] as string);
export const STRK = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
export const E18 = 10n ** 18n;
/** Blocks in the fixture: factory deployed at 4, launch at 6, then trades at 8, 10, 12 (graduates) and 14. */
export const HEAD = fixture.capturedAtBlock;

const sameAddress = (a: string, b: string) => BigInt(a) === BigInt(b);

const realHashes = new Map<number, string>();
for (const e of [...fixture.factoryEvents, ...Object.values(fixture.curveEvents).flat()]) {
  realHashes.set(e.block_number, e.block_hash);
}

/** A node serving the fixture. Blocks without events get made-up hashes and times. */
export class FakeNode implements ChainSource {
  head = HEAD;
  events: RawEvent[] = [...fixture.factoryEvents, ...Object.values(fixture.curveEvents).flat()];
  readonly requests: string[] = [];
  private forks: { fromBlock: number; id: number }[] = [];
  private times = new Map<string, number>();
  /** Set to make the next N calls fail, to test retries. */
  failNext = 0;

  private forkOf(block: number) {
    return this.forks.filter((f) => f.fromBlock <= block).sort((a, b) => b.id - a.id)[0];
  }

  hashOf(block: number): string {
    const fork = this.forkOf(block);
    const hash = !fork && realHashes.has(block)
      ? (realHashes.get(block) as string)
      : "0x" + (0xabc000000n + BigInt(block) * 1000n + BigInt(fork?.id ?? 0)).toString(16);
    const base = fixture.timestamps[String(block)] ?? 1_794_496_460 + block;
    this.times.set(BigInt(hash).toString(16), base + (fork?.id ?? 0));
    return hash;
  }

  /**
   * A reorg: every block from `fromBlock` on becomes a different block (new hash and time). Pass
   * `edit` to change which events the new blocks contain.
   */
  fork(fromBlock: number, edit?: (events: RawEvent[]) => RawEvent[]): void {
    this.forks.push({ fromBlock, id: this.forks.length + 1 });
    if (edit) this.events = edit(this.events);
  }

  private maybeFail() {
    if (this.failNext > 0) {
      this.failNext -= 1;
      throw new Error("node unavailable");
    }
  }

  async blockNumber(): Promise<number> {
    this.maybeFail();
    this.requests.push("blockNumber");
    return this.head;
  }

  async blockHash(blockNumber: number): Promise<string> {
    this.requests.push(`blockHash ${blockNumber}`);
    if (blockNumber > this.head) throw new Error(`block ${blockNumber} does not exist yet`);
    return this.hashOf(blockNumber);
  }

  async blockTimestamp(blockHash: string): Promise<number> {
    const time = this.times.get(BigInt(blockHash).toString(16));
    if (time === undefined) throw new Error(`unknown block hash ${blockHash}`);
    return time;
  }

  async getEvents(args: { address: string; fromBlock: number; toBlock: number; keys?: string[] }): Promise<RawEvent[]> {
    this.requests.push(`getEvents ${args.address.slice(0, 8)} ${args.fromBlock}-${args.toBlock}`);
    const wanted = args.keys ? new Set(args.keys.map((k) => BigInt(k))) : null;
    return this.events
      .filter(
        (e) =>
          sameAddress(e.from_address, args.address) &&
          e.block_number >= args.fromBlock &&
          e.block_number <= Math.min(args.toBlock, this.head) &&
          (!wanted || wanted.has(BigInt(e.keys[0] ?? "0x0"))),
      )
      .map((e) => ({ ...e, block_hash: this.hashOf(e.block_number) }));
  }
}

/** Tick until the indexer reports it has nothing left to do. */
export async function runToIdle(indexer: Indexer, maxTicks = 500): Promise<TickResult[]> {
  const results: TickResult[] = [];
  for (let i = 0; i < maxTicks; i += 1) {
    const result = await indexer.tick();
    results.push(result);
    if (result.status === "idle") return results;
  }
  throw new Error(`indexer did not go idle within ${maxTicks} ticks`);
}

/** Everything the indexer wrote, in a stable order, so two databases can be compared directly. */
export async function dump(db: Db) {
  const json = (rows: unknown[]) => JSON.parse(JSON.stringify(rows, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
  return {
    launches: json(await db.select().from(launches).orderBy(launches.token)),
    trades: json(await db.select().from(trades).orderBy(trades.blockNumber, trades.indexInBlock)),
    quoteTokenEvents: json(await db.select().from(quoteTokenEvents).orderBy(quoteTokenEvents.id)),
  };
}

export async function clearDatabase(db: Db): Promise<void> {
  await db.delete(trades);
  await db.delete(launches);
  await db.delete(quoteTokenEvents);
  await db.delete(indexerState);
}

/** The contract's own answer for the fixture curve at the captured head. */
export function contractState() {
  const curve = fixture.expected[Object.keys(fixture.expected)[0] as string] as { spotPrice: string[]; state: string[] };
  const u256 = (felts: string[], at: number) => BigInt(felts[at] as string) + (BigInt(felts[at + 1] as string) << 128n);
  return {
    quoteReserve: u256(curve.state, 0),
    tokenReserve: u256(curve.state, 2),
    spotPrice: u256(curve.spotPrice, 0),
    graduated: BigInt(curve.state[12] as string) === 1n,
  };
}
