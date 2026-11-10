"use client";

import { create } from "zustand";
import { ME } from "./oryvn-data";

const KEY = "oryvn.wallet";

/**
 * Preview wallet state. In production this is replaced by a real Starknet wallet
 * connector (Argent X / Braavos via starknetkit) with nonce + signature auth.
 * The connection here is SIMULATED — no keys are ever requested, and every real
 * transaction will require wallet authorisation.
 */
interface WalletState {
  wallet: string | null;
  connecting: string | null;
  hydrated: boolean;
  hydrate: () => void;
  connect: (name: string) => void;
  disconnect: () => void;
}

export const useWalletStore = create<WalletState>((set) => ({
  wallet: null,
  connecting: null,
  hydrated: false,
  hydrate: () => {
    if (typeof window === "undefined") return;
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(KEY);
    } catch {
      stored = null;
    }
    set({ wallet: stored, hydrated: true });
  },
  connect: (name: string) => {
    set({ connecting: name });
    window.setTimeout(() => {
      try {
        window.localStorage.setItem(KEY, ME.addr);
      } catch {
        /* ignore */
      }
      set({ wallet: ME.addr, connecting: null });
    }, 1300);
  },
  disconnect: () => {
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    set({ wallet: null, connecting: null });
  },
}));
