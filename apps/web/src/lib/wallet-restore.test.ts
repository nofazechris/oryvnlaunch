import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ADDRESS = "0x" + "cd".repeat(32);

type Req = { type: string; params?: unknown };

const fake = (answer: () => unknown) => ({
  id: "argentX",
  name: "Argent X",
  request: vi.fn(async (call: Req) => {
    if (call.type === "wallet_requestAccounts") return answer();
    throw new Error("method not found");
  }),
});

async function boot(opts: { remembered?: boolean; wallet?: unknown }) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_NETWORK", "sepolia");
  const store = new Map<string, string>();
  if (opts.remembered !== false) store.set("oryvn.wallet", "Argent X");
  const win: Record<string, unknown> = {
    localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) },
    addEventListener: vi.fn(),
  };
  if (opts.wallet) win.starknet_argentX = opts.wallet;
  vi.stubGlobal("window", win);
  const mod = await import("./wallet-store");
  return { win, store, state: () => mod.useWalletStore.getState() };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("remembering the wallet", () => {
  it("reconnects at once, without a prompt, when the extension is already there and was approved", async () => {
    const w = fake(() => [ADDRESS]);
    const { state } = await boot({ wallet: w });
    state().hydrate();
    await vi.advanceTimersByTimeAsync(10);
    expect(state().wallet).toBe(ADDRESS);
    expect(state().provider).toBe("Argent X");
    expect(state().restoring).toBe(false);
    expect(w.request).toHaveBeenCalledWith({ type: "wallet_requestAccounts", params: { silent_mode: true } });
  });

  it("still reconnects when the extension puts itself on the page a couple of seconds late", async () => {
    const { state, win } = await boot({});
    state().hydrate();
    await vi.advanceTimersByTimeAsync(500);
    expect(state().wallet).toBeNull();
    expect(state().restoring).toBe(true); // screens can say "Reconnecting", not "Connect wallet"
    win.starknet_argentX = fake(() => [ADDRESS]);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(state().wallet).toBe(ADDRESS);
    expect(state().restoring).toBe(false);
  });

  it("gives up quietly if the extension never shows up, and keeps the remembered choice", async () => {
    const { state, store } = await boot({});
    state().hydrate();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(state().wallet).toBeNull();
    expect(state().restoring).toBe(false);
    expect(store.get("oryvn.wallet")).toBe("Argent X");
  });

  it("stays disconnected, without error, when the wallet is locked or has not approved this site", async () => {
    const { state, store } = await boot({ wallet: fake(() => []) });
    state().hydrate();
    await vi.advanceTimersByTimeAsync(100);
    expect(state().wallet).toBeNull();
    expect(state().error).toBeNull();
    expect(state().restoring).toBe(false);
    expect(store.get("oryvn.wallet")).toBe("Argent X");
  });

  it("treats a wallet that throws on the silent request the same way", async () => {
    const { state } = await boot({ wallet: fake(() => { throw new Error("locked"); }) });
    state().hydrate();
    await vi.advanceTimersByTimeAsync(100);
    expect(state().wallet).toBeNull();
    expect(state().restoring).toBe(false);
  });

  it("does nothing, and asks the wallet nothing, when no wallet was ever connected", async () => {
    const w = fake(() => [ADDRESS]);
    const { state } = await boot({ remembered: false, wallet: w });
    state().hydrate();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(w.request).not.toHaveBeenCalled();
    expect(state().restoring).toBe(false);
  });

  it("tries again when the person comes back to the tab after unlocking the wallet", async () => {
    let unlocked = false;
    const { state, win } = await boot({ wallet: fake(() => (unlocked ? [ADDRESS] : [])) });
    state().hydrate();
    await vi.advanceTimersByTimeAsync(100);
    expect(state().wallet).toBeNull();
    unlocked = true;
    const onFocus = (win.addEventListener as ReturnType<typeof vi.fn>).mock.calls.find((c) => c[0] === "focus")![1] as () => void;
    onFocus();
    await vi.advanceTimersByTimeAsync(100);
    expect(state().wallet).toBe(ADDRESS);
  });

  it("forgets the wallet on disconnect, so it does not come back by itself", async () => {
    const { state, store } = await boot({ wallet: fake(() => [ADDRESS]) });
    state().hydrate();
    await vi.advanceTimersByTimeAsync(10);
    state().disconnect();
    expect(state().wallet).toBeNull();
    expect(store.get("oryvn.wallet")).toBeUndefined();
  });
});
