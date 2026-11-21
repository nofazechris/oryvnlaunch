"use client";

// The user's Starknet wallet, connected through the extension they already have (Argent X or Braavos).
//
// Nothing here ever sees a key or a seed phrase: the extension holds them. We only ask it for the
// account address and, later, ask it to sign and send transactions the user approves one by one.
// The connection uses the injected-wallet interface both extensions expose (`wallet_requestAccounts`).

import { create } from "zustand";
import { EXPECTED_CHAIN_IDS, NETWORK, NETWORK_LABEL } from "./config";
import type { WalletCall } from "./launch-tx";
import { accountDeployed } from "./rpc";
import { walletLabel } from "./wallet-label";

const KEY = "oryvn.wallet";
/** How long, and how often, to look for a remembered wallet that has not put itself on the page yet. */
const RESTORE_WINDOW_MS = 8_000;
const RESTORE_STEP_MS = 250;

interface InjectedWallet {
  id?: string;
  name?: string;
  /** The extension's own logo: a data URI or URL, or an object with `light` and `dark` versions. */
  icon?: unknown;
  /** Older extensions expose a starknet.js-style account that can send calls directly. */
  account?: { execute?: (calls: { contractAddress: string; entrypoint: string; calldata: string[] }[]) => Promise<{ transaction_hash?: string }> };
  selectedAddress?: string;
  request: (call: { type: string; params?: unknown }) => Promise<unknown>;
}

const PROVIDERS: Record<string, string> = {
  "Argent X": "starknet_argentX",
  Braavos: "starknet_braavos",
};

// What each wallet calls itself, for the case where it is the single wallet on `window.starknet` rather
// than under its own name. Argent has been renamed Ready, so both names are accepted.
const SELF_NAMES: Record<string, RegExp> = { "Argent X": /argent|ready/i, Braavos: /braavos/i };

function injected(name: string): InjectedWallet | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, InjectedWallet | undefined>;
  const named = w[PROVIDERS[name] ?? ""];
  if (named && typeof named.request === "function") return named;
  const generic = w.starknet;
  if (generic && typeof generic.request === "function" && SELF_NAMES[name]?.test(`${generic.id ?? ""} ${generic.name ?? ""}`)) return generic;
  return null;
}

/** A sentence for an error thrown by a wallet, whatever shape it arrives in. */
export function describeWalletError(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const o = error as { message?: unknown; error?: unknown; data?: unknown; code?: unknown };
    for (const v of [o.message, o.error, o.data]) if (typeof v === "string" && v) return v;
    try {
      return JSON.stringify(error).slice(0, 200);
    } catch {
      /* fall through */
    }
  }
  return "unknown error";
}

export const looksDeclined = (message: string) => /reject|declin|cancel|abort|refus|denied/i.test(message);

/**
 * The logo the installed extension supplies for itself, or null if it is not installed or gives us
 * nothing we are willing to draw. Only an image data URI or an https URL is accepted, and it is only
 * ever used as an <img> source, which cannot run script.
 */
export function walletIcon(name: string): string | null {
  const raw = injected(name)?.icon;
  const pick = typeof raw === "string" ? raw : raw && typeof raw === "object" ? ((raw as { dark?: unknown; light?: unknown }).dark ?? (raw as { light?: unknown }).light) : null;
  if (typeof pick !== "string") return null;
  return /^data:image\/(png|jpeg|webp|gif|svg\+xml);/i.test(pick) || /^https:\/\//i.test(pick) ? pick : null;
}

/** Ask the extension for accounts. `silent` reuses an earlier approval and never opens a prompt. */
async function requestAccounts(wallet: InjectedWallet, silent: boolean): Promise<string | null> {
  const result = (await wallet.request({ type: "wallet_requestAccounts", params: { silent_mode: silent } })) as unknown;
  return Array.isArray(result) && typeof result[0] === "string" ? result[0] : null;
}

async function chainId(wallet: InjectedWallet): Promise<string | null> {
  try {
    const id = await wallet.request({ type: "wallet_requestChainId" });
    return typeof id === "string" ? id : null;
  } catch {
    return null;
  }
}

/** The chain id hex Starknet Sepolia and mainnet use, for asking a wallet to switch networks. */
const CHAIN_HEX: Record<string, string> = { sepolia: "0x534e5f5345504f4c4941", mainnet: "0x534e5f4d41494e" };

const unsupported = (message: string) => /not supported|unsupported|unknown method|method not found|not implemented|-32601|UNKNOWN_METHOD/i.test(message);

/** Shown only after the wallet has already failed to send, when its account turns out not to exist on-chain yet. */
export const NOT_ACTIVATED = (name: string) =>
  `Your ${walletLabel(name)} account is not activated on ${NETWORK_LABEL[NETWORK]} yet, so it cannot sign. Open ${walletLabel(name)}, make sure it is on ${NETWORK_LABEL[NETWORK]}, and choose "Activate" or "Deploy account" (it needs a little STRK for the network fee). Then try again.`;

/** Which wallet extensions are installed in this browser right now. */
export function installedWallets(): string[] {
  return Object.keys(PROVIDERS).filter((name) => injected(name) !== null);
}

/** The wallet we should talk to: the one connected this session, else the one remembered from last time. */
function currentWallet(): { name: string; wallet: InjectedWallet } | null {
  let name = useWalletStore.getState().provider;
  if (!name) {
    try {
      name = window.localStorage.getItem(KEY);
    } catch {
      name = null;
    }
  }
  const wallet = name ? injected(name) : null;
  return name && wallet ? { name, wallet } : null;
}

/**
 * Something went wrong sending. Work out why, so the person gets a sentence they can act on, and fix what we
 * can fix: if the wallet is on the wrong network, ask it to switch. Returns true when it is worth retrying.
 */
async function diagnose(name: string, wallet: InjectedWallet, address: string | null): Promise<boolean> {
  if (address && (await accountDeployed(address)) === false) throw new Error(NOT_ACTIVATED(name));
  if (EXPECTED_CHAIN_IDS.length === 0) return false;
  const id = await chainId(wallet);
  if (!id || EXPECTED_CHAIN_IDS.includes(id)) return false;
  try {
    await wallet.request({ type: "wallet_switchStarknetChain", params: { chainId: CHAIN_HEX[NETWORK] ?? EXPECTED_CHAIN_IDS[0] } });
  } catch (e) {
    const detail = describeWalletError(e);
    throw new Error(looksDeclined(detail) ? `You declined switching ${walletLabel(name)} to ${NETWORK_LABEL[NETWORK]}.` : `Switch ${walletLabel(name)} to ${NETWORK_LABEL[NETWORK]}, then retry.`);
  }
  const after = await chainId(wallet);
  if (after && !EXPECTED_CHAIN_IDS.includes(after)) throw new Error(`${walletLabel(name)} is still not on ${NETWORK_LABEL[NETWORK]}. Switch it, then retry.`);
  return true;
}

async function invoke(wallet: InjectedWallet, calls: WalletCall[]): Promise<string | undefined> {
  const result = (await wallet.request({ type: "wallet_addInvokeTransaction", params: { calls } })) as { transaction_hash?: string } | undefined;
  return result?.transaction_hash;
}

/**
 * Ask the connected wallet to sign and send these calls as one transaction. The wallet shows the user
 * exactly what they approve; nothing is sent unless they accept. Resolves with the transaction hash.
 *
 * The request goes to the wallet FIRST, with nothing awaited before it, so the wallet's window opens the
 * instant the user clicks (browsers only let an extension open a window shortly after a click, and every
 * network check we ran first used up that time). Checks run only if the request fails, to explain why.
 */
export async function sendCalls(calls: WalletCall[]): Promise<string> {
  const current = currentWallet();
  if (!current) throw new Error("Your wallet is not connected. Connect it again, then retry.");
  const { name, wallet } = current;

  let hash: string | undefined;
  try {
    hash = await invoke(wallet, calls);
  } catch (e) {
    const detail = describeWalletError(e);
    console.error("[wallet] wallet_addInvokeTransaction failed:", e);
    if (looksDeclined(detail)) throw new Error(detail);
    if (unsupported(detail) && wallet.account?.execute) {
      // An older extension: use its starknet.js-style account.
      try {
        hash = (await wallet.account.execute(calls.map((c) => ({ contractAddress: c.contract_address, entrypoint: c.entry_point, calldata: c.calldata }))))?.transaction_hash;
      } catch (e2) {
        console.error("[wallet] the older account interface failed too:", e2);
        throw new Error(describeWalletError(e2));
      }
    } else {
      const retry = await diagnose(name, wallet, useWalletStore.getState().wallet);
      if (!retry) throw new Error(detail);
      try {
        hash = await invoke(wallet, calls);
      } catch (e3) {
        throw new Error(describeWalletError(e3));
      }
    }
  }
  if (!hash) throw new Error("The wallet did not return a transaction hash.");
  return hash;
}

/** The full address, lower-cased and padded to 32 bytes so it matches what the API stores. */
export function normalizeAddress(address: string): string {
  const hex = address.toLowerCase().replace(/^0x/, "");
  return "0x" + hex.padStart(64, "0");
}

interface WalletState {
  /** The connected account's full address (0x + 64 hex), or null. */
  wallet: string | null;
  /** Which extension is connected. */
  provider: string | null;
  /** The extension currently being asked to connect. */
  connecting: string | null;
  /** A sentence a person can read when connecting failed. */
  error: string | null;
  hydrated: boolean;
  /** True while a remembered wallet is being picked up again, so screens can say "Reconnecting" instead of "Connect". */
  restoring: boolean;
  hydrate: () => void;
  connect: (name: string) => Promise<void>;
  disconnect: () => void;
}

export const useWalletStore = create<WalletState>((set, get) => ({
  wallet: null,
  provider: null,
  connecting: null,
  error: null,
  hydrated: false,
  restoring: false,

  // Pick up an earlier approval without opening any prompt.
  //
  // Extensions put themselves on the page a moment AFTER it loads, so one quick look finds nothing and the
  // person would have to connect again on every visit. So keep looking for a few seconds, and look again when
  // they come back to the tab. A locked or never-approved wallet is not an error: we stay disconnected and keep
  // the remembered choice, so unlocking the wallet and returning works. Disconnecting forgets it.
  hydrate: () => {
    if (get().hydrated || typeof window === "undefined") return;
    set({ hydrated: true });
    const remembered = () => {
      try {
        const name = window.localStorage.getItem(KEY);
        return name && PROVIDERS[name] ? name : null;
      } catch {
        return null;
      }
    };
    if (!remembered()) return;
    let busy = false;
    const attempt = async (patient: boolean) => {
      const name = remembered();
      if (!name || busy || get().wallet || get().connecting) return;
      busy = true;
      set({ restoring: true });
      try {
        const deadline = Date.now() + (patient ? RESTORE_WINDOW_MS : 0);
        let wallet = injected(name);
        while (!wallet && Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, RESTORE_STEP_MS));
          wallet = injected(name);
        }
        if (!wallet) return;
        const address = await requestAccounts(wallet, true);
        if (address && !get().wallet && remembered() === name) set({ wallet: normalizeAddress(address), provider: name });
      } catch {
        /* locked, or not approved for this site: stay disconnected */
      } finally {
        busy = false;
        set({ restoring: false });
      }
    };
    void attempt(true);
    const again = () => void attempt(false);
    window.addEventListener?.("focus", again);
    if (typeof document !== "undefined") document.addEventListener?.("visibilitychange", () => { if (document.visibilityState === "visible") again(); });
  },

  connect: async (name) => {
    const wallet = injected(name);
    if (!wallet) {
      set({ error: `${walletLabel(name)} was not found in this browser. Install the extension, then try again.` });
      return;
    }
    set({ connecting: name, error: null });
    try {
      const address = await requestAccounts(wallet, false);
      if (!address) {
        set({ connecting: null, error: `${walletLabel(name)} did not share an account. Unlock it and try again.` });
        return;
      }
      const id = await chainId(wallet);
      if (EXPECTED_CHAIN_IDS.length > 0 && id && !EXPECTED_CHAIN_IDS.includes(id)) {
        set({ connecting: null, error: `Switch ${walletLabel(name)} to ${NETWORK_LABEL[NETWORK]}, then connect again.` });
        return;
      }
      try {
        window.localStorage.setItem(KEY, name);
      } catch {
        /* the connection still works for this visit */
      }
      set({ wallet: normalizeAddress(address), provider: name, connecting: null, error: null });
    } catch (e) {
      const detail = describeWalletError(e);
      console.error(`[wallet] ${name} connection failed:`, e);
      set({ connecting: null, error: looksDeclined(detail) ? "The connection was declined in the wallet." : `${walletLabel(name)} could not connect: ${detail.slice(0, 160)}` });
    }
  },

  disconnect: () => {
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    set({ wallet: null, provider: null, connecting: null, error: null, restoring: false });
  },
}));
