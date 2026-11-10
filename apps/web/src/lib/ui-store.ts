"use client";

import { create } from "zustand";

/**
 * Which AppNav overlay/panel is open. Shared so pages (e.g. the Launch wizard's
 * "Connect wallet to deploy") can open the nav's wallet modal.
 */
export type Panel = "search" | "notif" | "ai" | "wallet" | "menu" | "confirm" | "links" | null;

interface UiState {
  panel: Panel;
  setPanel: (p: Panel) => void;
  toggle: (p: Exclude<Panel, null>) => void;
  close: () => void;
}

export const useUiStore = create<UiState>((set, get) => ({
  panel: null,
  setPanel: (panel) => set({ panel }),
  toggle: (p) => set({ panel: get().panel === p ? null : p }),
  close: () => set({ panel: null }),
}));
