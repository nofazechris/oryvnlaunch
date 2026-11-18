import { afterEach, describe, expect, it, vi } from "vitest";
import { accountDeployed, balanceOf, curveFees, parseCurveFees, quoteBuy, quoteSell, waitForTx } from "./rpc";

function stubRpc(handler: (method: string, params: any) => unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: { body: string }) => {
      const { method, params } = JSON.parse(init.body);
      const out = handler(method, params);
      return { json: async () => (out instanceof Error ? { error: { code: 1, message: out.message } } : { result: out }) };
    }),
  );
}
afterEach(() => vi.unstubAllGlobals());

describe("waitForTx", () => {
  it("reports success once accepted and executed", async () => {
    stubRpc(() => ({ finality_status: "ACCEPTED_ON_L2", execution_status: "SUCCEEDED" }));
    expect(await waitForTx("0x1", 5_000)).toEqual({ ok: true });
  });

  it("reports a revert with the node's reason", async () => {
    stubRpc((method) => (method === "starknet_getTransactionStatus" ? { finality_status: "ACCEPTED_ON_L2", execution_status: "REVERTED" } : { revert_reason: "'CURVE_SLIPPAGE'" }));
    expect(await waitForTx("0x1", 5_000)).toEqual({ ok: false, reason: "'CURVE_SLIPPAGE'" });
  });

  it("reports a rejected transaction", async () => {
    stubRpc(() => ({ finality_status: "REJECTED" }));
    const r = await waitForTx("0x1", 5_000);
    expect(r?.ok).toBe(false);
  });

  it("keeps waiting while the node does not know the hash yet, then gives up with null", async () => {
    stubRpc(() => new Error("Transaction hash not found"));
    expect(await waitForTx("0x1", 50)).toBeNull();
  });
});

describe("contract reads", () => {
  it("balanceOf joins the two u256 felts", async () => {
    stubRpc(() => ["0x5", "0x1"]);
    expect(await balanceOf("0xt", "0xo")).toBe(5n + (1n << 128n));
  });

  it("falls back to balanceOf when balance_of is missing", async () => {
    const seen: string[] = [];
    stubRpc((_m, p) => {
      seen.push(p.request.entry_point_selector);
      return seen.length === 1 ? new Error("Entry point not found") : ["0x9", "0x0"];
    });
    expect(await balanceOf("0xt", "0xo")).toBe(9n);
    expect(seen).toHaveLength(2);
    expect(seen[0]).not.toBe(seen[1]);
  });

  it("quoteBuy and quoteSell decode the curve's answers", async () => {
    stubRpc((_m, p) => (p.request.calldata.length === 2 ? ["0xa", "0x0", "0xb", "0x0", "0x1"] : []));
    expect(await quoteBuy("0xc", 10n)).toEqual({ paid: 10n, tokensOut: 11n, sellsOut: true });
    stubRpc(() => ["0x7", "0x0"]);
    expect(await quoteSell("0xc", 3n)).toBe(7n);
  });
});

describe("curve fees", () => {
  // get_state: six u256 pairs (12 felts), graduated, fee bps, creator share, creator_fees (2), platform_fees (2)
  const state = (creator: bigint, platform: bigint) => {
    const hex = (v: bigint) => "0x" + v.toString(16);
    const pair = (v: bigint) => [hex(v & ((1n << 128n) - 1n)), hex(v >> 128n)];
    return [...Array(12).fill("0x1"), "0x0", "0x64", "0x1388", ...pair(creator), ...pair(platform)];
  };

  it("reads the creator's and the platform's share from the right places", () => {
    expect(parseCurveFees(state(7n, 9n).map((x) => BigInt(x)))).toEqual({ creatorFees: 7n, platformFees: 9n });
  });

  it("keeps the high half of a large amount", () => {
    const big = (1n << 130n) + 5n;
    expect(parseCurveFees(state(big, 0n).map((x) => BigInt(x)))).toEqual({ creatorFees: big, platformFees: 0n });
  });

  it("refuses an answer that is too short instead of guessing", () => {
    expect(() => parseCurveFees([1n, 2n, 3n])).toThrow();
  });

  it("reads them through the node", async () => {
    stubRpc(() => state(123n, 456n));
    expect(await curveFees("0xc")).toEqual({ creatorFees: 123n, platformFees: 456n });
  });
});

describe("accountDeployed", () => {
  it("is true when the node knows a class at the address", async () => {
    stubRpc(() => "0x5b4b");
    expect(await accountDeployed("0xabc")).toBe(true);
  });

  it("is false when the node says there is no contract there (a wallet that is not activated yet)", async () => {
    stubRpc(() => new Error("Contract not found"));
    // stubRpc turns an Error into { error: { code: 1, message } }; the node's real code for this is 20
    vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => ({ error: { code: 20, message: "Contract not found" } }) })));
    expect(await accountDeployed("0xabc")).toBe(false);
  });

  it("is null, not false, when it cannot tell: an unrelated node error or the node being down", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => ({ error: { code: -32000, message: "internal error" } }) })));
    expect(await accountDeployed("0xabc")).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect(await accountDeployed("0xabc")).toBeNull();
  });
});
