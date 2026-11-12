// A small Starknet JSON-RPC client: just the four calls the indexer needs.
//
// Plain `fetch` on purpose. It works the same against devnet, a public Sepolia node and a paid
// provider, and it does not tie us to one RPC spec version of a client library.

import type { RawEvent } from "./events.js";

export interface RpcOptions {
  url: string;
  /** Extra headers, for example an API key header some providers require. */
  headers?: Record<string, string>;
  fetchImpl?: typeof fetch;
  /** How many times to retry a failed or rate-limited request. Default 4. */
  retries?: number;
  /** Delay before the first retry in ms; doubles each time. Default 300. */
  retryDelayMs?: number;
}

export class RpcError extends Error {
  constructor(
    message: string,
    readonly code?: number,
  ) {
    super(message);
    this.name = "RpcError";
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class StarknetRpc {
  private nextId = 1;
  private readonly fetchImpl: typeof fetch;
  private readonly retries: number;
  private readonly retryDelayMs: number;
  private readonly timestamps = new Map<string, number>();

  constructor(private readonly options: RpcOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.retries = options.retries ?? 4;
    this.retryDelayMs = options.retryDelayMs ?? 300;
  }

  private async call<T>(method: string, params: unknown): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.retries; attempt += 1) {
      try {
        const response = await this.fetchImpl(this.options.url, {
          method: "POST",
          headers: { "content-type": "application/json", ...this.options.headers },
          body: JSON.stringify({ jsonrpc: "2.0", id: this.nextId++, method, params }),
        });
        if (response.status === 429 || response.status >= 500) {
          throw new RpcError(`${method}: HTTP ${response.status}`);
        }
        const body = (await response.json()) as { result?: T; error?: { code: number; message: string } };
        if (body.error) {
          // A node-side error is final: retrying will not fix a bad request.
          throw new RpcError(`${method}: ${body.error.message}`, body.error.code);
        }
        return body.result as T;
      } catch (error) {
        lastError = error;
        const final = error instanceof RpcError && error.code !== undefined;
        if (final || attempt === this.retries) break;
        await sleep(this.retryDelayMs * 2 ** attempt);
      }
    }
    throw lastError instanceof Error ? lastError : new RpcError(String(lastError));
  }

  /** Number of the latest accepted block. */
  async blockNumber(): Promise<number> {
    return this.call<number>("starknet_blockNumber", []);
  }

  /** Hash of the block currently at this height. Never cached: after a reorg the answer changes. */
  async blockHash(blockNumber: number): Promise<string> {
    const block = await this.call<{ block_hash: string }>("starknet_getBlockWithTxHashes", [
      { block_number: blockNumber },
    ]);
    return block.block_hash;
  }

  /**
   * Unix timestamp (seconds) of a block, looked up by its HASH. A hash names exactly one block
   * forever, so the answer can be cached safely. Caching by block number would be wrong: after a
   * reorg the same number is a different block with a different time.
   */
  async blockTimestamp(blockHash: string): Promise<number> {
    const key = BigInt(blockHash).toString(16);
    const cached = this.timestamps.get(key);
    if (cached !== undefined) return cached;
    const block = await this.call<{ timestamp: number }>("starknet_getBlockWithTxHashes", [
      { block_hash: blockHash },
    ]);
    this.timestamps.set(key, block.timestamp);
    if (this.timestamps.size > 5_000) this.timestamps.delete(this.timestamps.keys().next().value as string);
    return block.timestamp;
  }

  /**
   * Every event from one contract in [fromBlock, toBlock], oldest first, following pagination.
   * `keys` optionally limits the result to certain event selectors.
   */
  async getEvents(args: {
    address: string;
    fromBlock: number;
    toBlock: number;
    keys?: string[];
    chunkSize?: number;
  }): Promise<RawEvent[]> {
    const events: RawEvent[] = [];
    let continuationToken: string | undefined;
    do {
      // The spec takes ONE named parameter, `filter`, which holds the event filter and the paging
      // fields side by side. A node may silently ignore fields in the wrong place, so a wrong
      // shape does not error: it returns every event on the chain. The tests below guard this.
      const page = await this.call<{ events: RawEvent[]; continuation_token?: string }>("starknet_getEvents", {
        filter: {
          from_block: { block_number: args.fromBlock },
          to_block: { block_number: args.toBlock },
          address: args.address,
          ...(args.keys ? { keys: [args.keys] } : {}),
          chunk_size: args.chunkSize ?? 500,
          ...(continuationToken ? { continuation_token: continuationToken } : {}),
        },
      });
      events.push(...page.events);
      continuationToken = page.continuation_token || undefined;
    } while (continuationToken);
    return events;
  }
}
