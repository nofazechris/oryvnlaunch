import { describe, expect, it, vi } from "vitest";
import { StarknetRpc, RpcError } from "./rpc.js";

type Handler = (method: string, params: unknown) => unknown;

/** A fake node: answers each JSON-RPC call from `handler`; records what was asked. */
function fakeNode(handler: Handler) {
  const calls: { method: string; params: unknown }[] = [];
  const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body)) as { id: number; method: string; params: unknown };
    calls.push({ method: request.method, params: request.params });
    const result = handler(request.method, request.params);
    if (result instanceof Response) return result;
    if (result && typeof result === "object" && "error" in (result as object)) {
      return Response.json({ jsonrpc: "2.0", id: request.id, ...(result as object) });
    }
    return Response.json({ jsonrpc: "2.0", id: request.id, result });
  });
  return { calls, fetchImpl: fetchImpl as unknown as typeof fetch };
}

const event = (n: number) => ({
  from_address: "0x1",
  keys: ["0x2"],
  data: [],
  block_number: n,
  block_hash: "0x3",
  transaction_hash: "0x4",
});

describe("StarknetRpc.getEvents", () => {
  it("sends one named `filter` object with the address and paging fields side by side", async () => {
    // A node ignores misplaced fields and returns EVERY event on the chain, so the shape of
    // this request is the thing that keeps the indexer from ingesting other contracts' events.
    const node = fakeNode(() => ({ events: [], continuation_token: undefined }));
    const rpc = new StarknetRpc({ url: "http://node", fetchImpl: node.fetchImpl });
    await rpc.getEvents({ address: "0xabc", fromBlock: 5, toBlock: 9, keys: ["0x1", "0x2"], chunkSize: 100 });

    expect(node.calls).toHaveLength(1);
    expect(node.calls[0]?.method).toBe("starknet_getEvents");
    expect(node.calls[0]?.params).toEqual({
      filter: {
        from_block: { block_number: 5 },
        to_block: { block_number: 9 },
        address: "0xabc",
        keys: [["0x1", "0x2"]],
        chunk_size: 100,
      },
    });
  });

  it("follows continuation tokens until the node stops returning one", async () => {
    const pages: Record<string, unknown> = {
      first: { events: [event(1), event(2)], continuation_token: "t1" },
      t1: { events: [event(3)], continuation_token: "t2" },
      t2: { events: [event(4)] },
    };
    const node = fakeNode((_m, params) => {
      const token = (params as { filter: { continuation_token?: string } }).filter.continuation_token;
      return pages[token ?? "first"];
    });
    const rpc = new StarknetRpc({ url: "http://node", fetchImpl: node.fetchImpl });
    const events = await rpc.getEvents({ address: "0x1", fromBlock: 0, toBlock: 10 });
    expect(events.map((e) => e.block_number)).toEqual([1, 2, 3, 4]);
    expect(node.calls).toHaveLength(3);
  });
});

describe("StarknetRpc resilience", () => {
  it("retries a rate-limited request and then succeeds", async () => {
    let attempts = 0;
    const node = fakeNode(() => (++attempts < 3 ? new Response("slow down", { status: 429 }) : 42));
    const rpc = new StarknetRpc({ url: "http://node", fetchImpl: node.fetchImpl, retryDelayMs: 1 });
    expect(await rpc.blockNumber()).toBe(42);
    expect(attempts).toBe(3);
  });

  it("gives up after the retry limit with the original error", async () => {
    const node = fakeNode(() => new Response("down", { status: 503 }));
    const rpc = new StarknetRpc({ url: "http://node", fetchImpl: node.fetchImpl, retries: 2, retryDelayMs: 1 });
    await expect(rpc.blockNumber()).rejects.toThrow(/HTTP 503/);
    expect(node.calls).toHaveLength(3);
  });

  it("does not retry an error the node returned on purpose", async () => {
    const node = fakeNode(() => ({ error: { code: -32602, message: "Invalid params" } }));
    const rpc = new StarknetRpc({ url: "http://node", fetchImpl: node.fetchImpl, retryDelayMs: 1 });
    await expect(rpc.blockNumber()).rejects.toThrow(RpcError);
    expect(node.calls).toHaveLength(1);
  });

  it("caches block timestamps by hash, since a hash names one block forever", async () => {
    const node = fakeNode(() => ({ timestamp: 1_700_000_000 }));
    const rpc = new StarknetRpc({ url: "http://node", fetchImpl: node.fetchImpl });
    expect(await rpc.blockTimestamp("0xabc")).toBe(1_700_000_000);
    // the same hash written with leading zeros is the same block
    expect(await rpc.blockTimestamp("0x000abc")).toBe(1_700_000_000);
    expect(node.calls).toHaveLength(1);
    expect(node.calls[0]?.params).toEqual([{ block_hash: "0xabc" }]);
  });

  it("never caches the hash at a height, because a reorg changes it", async () => {
    let hash = "0x1";
    const node = fakeNode(() => ({ block_hash: hash }));
    const rpc = new StarknetRpc({ url: "http://node", fetchImpl: node.fetchImpl });
    expect(await rpc.blockHash(7)).toBe("0x1");
    hash = "0x2";
    expect(await rpc.blockHash(7)).toBe("0x2");
    expect(node.calls).toHaveLength(2);
  });
});
