"use client";

import { create } from "zustand";

/**
 * Simulated account session. In production this is a real Google OAuth / Starknet
 * signature session (backend phase). The wallet connection is tracked separately in
 * wallet-store — a Google account can exist without a wallet until the user connects one.
 */
export type AuthMethod = "google" | "wallet";
export interface Session {
  method: AuthMethod;
  email?: string;
}

interface AuthState {
  session: Session | null;
  hydrated: boolean;
  hydrate: () => void;
  signInGoogle: (email: string) => void;
  signInWallet: () => void;
  signOut: () => void;
}

const KEY = "oryvn.session";

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  hydrated: false,
  hydrate: () => {
    if (typeof window === "undefined") return;
    let session: Session | null = null;
    try {
      const raw = window.localStorage.getItem(KEY);
      session = raw ? (JSON.parse(raw) as Session) : null;
    } catch {
      session = null;
    }
    set({ session, hydrated: true });
  },
  signInGoogle: (email) => {
    const session: Session = { method: "google", email };
    persist(session);
    set({ session });
  },
  signInWallet: () => {
    const session: Session = { method: "wallet" };
    persist(session);
    set({ session });
  },
  signOut: () => {
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    set({ session: null });
  },
}));

function persist(session: Session) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    /* ignore */
  }
}
