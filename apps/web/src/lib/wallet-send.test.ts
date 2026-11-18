import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const CALLS = [{ contract_address: "0x1", entry_point: "approve", calldata: ["0x2", "0x3", "0x0"] }];
const SEPOLIA = "0x534e5f5345504f4c4941";
const MAINNET = "0x534e5f4d41494e";
const ADDRESS = "0x" + "ab".repeat(32);

type Req = { type: string; params?: unknown };

/** A fake extension. `handlers` answer by request type; anything unlisted throws "method not found". */
function fakeWallet(handlers: Record<string, (params: unknown, n: number) => unknown>, extra: Record<string, unknown> = {}) {
  const log: Req[] = [];
  const counts: Record<string, number> = {};
  const wallet = {
    id: "argentX",
    name: "Argent X",
    request: vi.fn(async (call: Req) => {
      log.push(call);
      counts[call.type] = (counts[call.type] ?? 0) + 1;
      const h = handlers[call.type];
      if (!h) throw new Error("method not found");
      return h(call.params, counts[call.type]!);
    }),
    ...extra,
  };
  return { wallet, log };
}

/** `deployed`: what the node says about the account (only consulted after the wallet has failed). */
async function load(network: "sepolia" | "devnet", wallet: unknown, opts: { connected?: boolean; deployed?: boolean } = {}) {
  const { connected = true, deployed = true } = opts;
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_NETWORK", network);
  vi.stubEnv("NEXT_PUBLIC_RPC_URL", "http://node.test/rpc");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ json: async () => (deployed ? { result: "0x1" } : { error: { code: 20, message: "Contract not found" } }) })),
  );
  const store = new Map<string, string>();
  if (connected) store.set("oryvn.wallet", "Argent X");
  vi.stubGlobal("window", {
    starknet_argentX: wallet,
    localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) },
  });
  const mod = await import("./wallet-store");
  if (connected) mod.useWalletStore.setState({ wallet: ADDRESS, provider: "Argent X" });
  return mod;
}

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => undefined));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const ok = { wallet_requestAccounts: () => [ADDRESS], wallet_requestChainId: () => SEPOLIA, wallet_addInvokeTransaction: () => ({ transaction_hash: "0xdead" }) };

describe("sendCalls: the wallet is asked first", () => {
  it("sends the request to the wallet before anything else, and returns the hash", async () => {
    const { wallet, log } = fakeWallet(ok);
    const { sendCalls } = await load("sepolia", wallet);
    expect(await sendCalls(CALLS)).toBe("0xdead");
    // nothing asked of the wallet or the network beforehand: the window can open the instant of the click
    expect(log.map((r) => r.type)).toEqual(["wallet_addInvokeTransaction"]);
    expect(log[0]?.params).toEqual({ calls: CALLS });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("works if the page forgot which wallet was connected but remembers it from last time", async () => {
    const { wallet } = fakeWallet(ok);
    const { sendCalls, useWalletStore } = await load("sepolia", wallet);
    useWalletStore.setState({ wallet: null, provider: null });
    expect(await sendCalls(CALLS)).toBe("0xdead");
  });

  it("says plainly when there is no connected wallet, without trying to send", async () => {
    const { wallet, log } = fakeWallet(ok);
    const { sendCalls } = await load("sepolia", wallet, { connected: false });
    await expect(sendCalls(CALLS)).rejects.toThrow(/not connected/i);
    expect(log).toHaveLength(0);
  });

  it("never refuses on its own account of the wallet: even a wallet whose account is not on-chain yet is just asked", async () => {
    // Some wallets deploy the account themselves with the first transaction, so the app must not second-guess it.
    const { wallet, log } = fakeWallet(ok);
    const { sendCalls } = await load("sepolia", wallet, { deployed: false });
    expect(await sendCalls(CALLS)).toBe("0xdead");
    expect(log.map((r) => r.type)).toEqual(["wallet_addInvokeTransaction"]);
  });
});

describe("sendCalls: explaining a failure", () => {
  it("passes a declined signature through, and runs no further checks", async () => {
    const { wallet, log } = fakeWallet({ ...ok, wallet_addInvokeTransaction: () => { throw new Error("User rejected the request"); } });
    const { sendCalls } = await load("sepolia", wallet);
    await expect(sendCalls(CALLS)).rejects.toThrow(/rejected/i);
    expect(log.map((r) => r.type)).toEqual(["wallet_addInvokeTransaction"]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("when the wallet fails and the account does not exist on-chain, says the account is not activated", async () => {
    const { wallet } = fakeWallet({ ...ok, wallet_addInvokeTransaction: () => { throw new Error("something went wrong"); } });
    const { sendCalls } = await load("sepolia", wallet, { deployed: false });
    await expect(sendCalls(CALLS)).rejects.toThrow(/not activated/i);
  });

  it("when the wallet is on the wrong network, asks it to switch and tries again", async () => {
    let chain = MAINNET;
    const { wallet, log } = fakeWallet({
      ...ok,
      wallet_requestChainId: () => chain,
      wallet_switchStarknetChain: () => ((chain = SEPOLIA), true),
      wallet_addInvokeTransaction: (_p, n) => {
        if (n === 1) throw new Error("wrong network");
        return { transaction_hash: "0xbeef" };
      },
    });
    const { sendCalls } = await load("sepolia", wallet);
    expect(await sendCalls(CALLS)).toBe("0xbeef");
    expect(log.find((r) => r.type === "wallet_switchStarknetChain")?.params).toEqual({ chainId: SEPOLIA });
  });

  it("stops with a clear sentence if the user will not switch network", async () => {
    const { wallet, log } = fakeWallet({
      ...ok,
      wallet_requestChainId: () => MAINNET,
      wallet_switchStarknetChain: () => { throw new Error("User rejected the request"); },
      wallet_addInvokeTransaction: () => { throw new Error("wrong network"); },
    });
    const { sendCalls } = await load("sepolia", wallet);
    await expect(sendCalls(CALLS)).rejects.toThrow(/declined switching/i);
    expect(log.filter((r) => r.type === "wallet_addInvokeTransaction")).toHaveLength(1);
  });

  it("stops if the wallet claims to switch but is still on the wrong network", async () => {
    const { wallet } = fakeWallet({ ...ok, wallet_requestChainId: () => MAINNET, wallet_switchStarknetChain: () => true, wallet_addInvokeTransaction: () => { throw new Error("wrong network"); } });
    const { sendCalls } = await load("sepolia", wallet);
    await expect(sendCalls(CALLS)).rejects.toThrow(/still not on/i);
  });

  it("on devnet, where any chain is fine, does not try to switch networks", async () => {
    const { wallet, log } = fakeWallet({ ...ok, wallet_requestChainId: () => "0x1234", wallet_addInvokeTransaction: () => { throw new Error("boom"); } });
    const { sendCalls } = await load("devnet", wallet);
    await expect(sendCalls(CALLS)).rejects.toThrow(/boom/);
    expect(log.some((r) => r.type === "wallet_switchStarknetChain")).toBe(false);
  });

  it("falls back to the older account interface when the standard method is not supported", async () => {
    const execute = vi.fn(async () => ({ transaction_hash: "0xfeed" }));
    const { wallet } = fakeWallet({ ...ok, wallet_addInvokeTransaction: () => { throw new Error("Method not supported"); } }, { account: { execute } });
    const { sendCalls } = await load("sepolia", wallet);
    expect(await sendCalls(CALLS)).toBe("0xfeed");
    expect(execute).toHaveBeenCalledWith([{ contractAddress: "0x1", entrypoint: "approve", calldata: ["0x2", "0x3", "0x0"] }]);
  });

  it("never retries a rejection through the older interface", async () => {
    const execute = vi.fn();
    const { wallet } = fakeWallet({ ...ok, wallet_addInvokeTransaction: () => { throw new Error("User rejected the request"); } }, { account: { execute } });
    const { sendCalls } = await load("sepolia", wallet);
    await expect(sendCalls(CALLS)).rejects.toThrow(/rejected/i);
    expect(execute).not.toHaveBeenCalled();
  });

  it("explains a wallet that answers without a transaction hash", async () => {
    const { wallet } = fakeWallet({ ...ok, wallet_addInvokeTransaction: () => ({}) });
    const { sendCalls } = await load("sepolia", wallet);
    await expect(sendCalls(CALLS)).rejects.toThrow(/did not return a transaction hash/i);
  });

  it("still reports the wallet's own error when it cannot tell why (node down)", async () => {
    const { wallet } = fakeWallet({ ...ok, wallet_addInvokeTransaction: () => { throw new Error("weird wallet failure"); } });
    const mod = await load("sepolia", wallet);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    await expect(mod.sendCalls(CALLS)).rejects.toThrow(/weird wallet failure/);
  });
});

describe("installedWallets", () => {
  it("lists the wallet extensions this browser has", async () => {
    const { wallet } = fakeWallet(ok);
    const { installedWallets } = await load("sepolia", wallet);
    expect(installedWallets()).toEqual(["Argent X"]);
    vi.stubGlobal("window", { starknet_argentX: wallet, starknet_braavos: { id: "braavos", name: "Braavos", request: async () => undefined } });
    expect(installedWallets()).toEqual(["Argent X", "Braavos"]);
    vi.stubGlobal("window", {});
    expect(installedWallets()).toEqual([]);
  });
});
