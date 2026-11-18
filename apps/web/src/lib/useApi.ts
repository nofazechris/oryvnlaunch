"use client";

// Hooks that load data from the API and keep it fresh by polling.
//
// Each hook returns `{ data, error, loading }` and never throws. `error` is a plain sentence a person
// can read ("Cannot reach the oryvnlaunch API. Is it running?"); screens show it instead of silently
// showing nothing. While a request is in flight after the first one, the previous `data` stays, so a
// refresh never makes a screen flicker empty.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  api,
  type ApiActivity,
  type ApiCandle,
  type ApiFeeAsset,
  type ApiPrices,
  type ApiHolders,
  type ApiLaunch,
  type ApiQuoteToken,
  type ApiStats,
  type ApiTrade,
  type CandleInterval,
  type LaunchSort,
} from "./api";
import { toToken, type Token } from "./token";

export interface Polled<T> {
  data: T | undefined;
  error: string | undefined;
  /** True only until the first answer (or failure) arrives. */
  loading: boolean;
  reload: () => void;
}

/**
 * Run `load` now and then every `intervalMs`. Pass `null` as `key` to stay idle (for example while a
 * value you need is not known yet). A new `key` starts over with a clean slate.
 */
export function usePolled<T>(load: (signal: AbortSignal) => Promise<T>, key: string | null, intervalMs = 5_000): Polled<T> {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: key !== null });
  const loadRef = useRef(load);
  loadRef.current = load;
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (key === null) {
      setState({ loading: false });
      return;
    }
    setState({ loading: true });
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = async () => {
      try {
        const data = await loadRef.current(controller.signal);
        if (controller.signal.aborted) return;
        setState({ data, loading: false });
      } catch (error) {
        if (controller.signal.aborted) return;
        // keep the last good data on screen, and say what went wrong
        setState((s) => ({ data: s.data, error: error instanceof Error ? error.message : "Something went wrong", loading: false }));
      }
      if (!controller.signal.aborted) timer = setTimeout(run, intervalMs);
    };
    void run();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [key, intervalMs, tick]);

  return { data: state.data, error: state.error, loading: state.loading, reload };
}

export interface LaunchesParams {
  sort?: LaunchSort;
  quote?: string;
  creator?: string;
  graduated?: boolean;
  limit?: number;
}

/** Launches, newest first by default, as ready-to-draw tokens. */
export function useLaunches(params: LaunchesParams = {}, intervalMs = 5_000): Polled<{ tokens: Token[]; total: number }> {
  const key = JSON.stringify(params);
  return usePolled(
    async (signal) => {
      const result = await api.launches({ limit: 100, ...params }, signal);
      return { tokens: result.items.map(toToken), total: result.total };
    },
    key,
    intervalMs,
  );
}

/** One token by address. `null` (not found) when the API says 404; `undefined` while loading. */
export function useToken(address: string | null, intervalMs = 4_000): Polled<Token | null> {
  return usePolled(
    async (signal) => {
      try {
        return toToken(await api.launch(address as string, signal));
      } catch (error) {
        if (error instanceof Error && "status" in error && (error as { status?: number }).status === 404) return null;
        throw error;
      }
    },
    address,
    intervalMs,
  );
}

export function useTrades(address: string | null, limit = 30, intervalMs = 4_000): Polled<{ items: ApiTrade[]; total: number }> {
  return usePolled((signal) => api.trades(address as string, { limit }, signal), address ? `${address}:${limit}` : null, intervalMs);
}

export function useCandles(address: string | null, interval: CandleInterval, limit = 120, intervalMs = 5_000): Polled<ApiCandle[]> {
  return usePolled(async (signal) => (await api.candles(address as string, interval, limit, signal)).items, address ? `${address}:${interval}:${limit}` : null, intervalMs);
}

export function useActivity(params: { wallet?: string; token?: string; limit?: number } = {}, enabled = true, intervalMs = 5_000): Polled<ApiActivity[]> {
  return usePolled(async (signal) => (await api.activity({ limit: 30, ...params }, signal)).items, enabled ? JSON.stringify(params) : null, intervalMs);
}

/**
 * The board: launches ranked by market cap within one quote asset (STRK when it is enabled, else the
 * first enabled one). Market caps in different assets are different units, so they are never ranked
 * against each other.
 */
export function useTopLaunches(limit = 3, intervalMs = 10_000): Polled<{ tokens: Token[]; asset: string | null }> {
  return usePolled(
    async (signal) => {
      const { items } = await api.quoteTokens(signal);
      const enabled = items.filter((q) => q.enabled);
      const quote = enabled.find((q) => q.symbol === "STRK") ?? enabled[0];
      if (!quote) return { tokens: [], asset: null };
      const result = await api.launches({ sort: "marketcap", quote: quote.address, limit }, signal);
      return { tokens: result.items.map(toToken), asset: quote.symbol };
    },
    `top:${limit}`,
    intervalMs,
  );
}

/** The assets a creator can pay the deploy fee in, each with its fee. */
export function useFeeAssets(intervalMs = 30_000): Polled<ApiFeeAsset[]> {
  return usePolled(async (signal) => (await api.feeAssets(signal)).items, "fee-assets", intervalMs);
}

/** Dollar values for display. The server caches them, so polling often is cheap. */
export function usePrices(intervalMs = 60_000): Polled<ApiPrices> {
  return usePolled((signal) => api.prices(signal), "prices", intervalMs);
}

/** STRK in dollars, or null while loading or when no trustworthy quote exists. */
export function useStrkUsd(): number | null {
  return usePrices().data?.STRK?.usd ?? null;
}

/** Who holds the token, biggest first, with the totals the page needs. */
export function useHolders(address: string | null, limit = 20, intervalMs = 10_000): Polled<ApiHolders> {
  return usePolled((signal) => api.holders(address as string, limit, signal), address ? `${address}:${limit}` : null, intervalMs);
}

/** The assets a creator can pair a token with, with each one's deploy fee and graduation raise. */
export function useQuoteTokens(intervalMs = 30_000): Polled<ApiQuoteToken[]> {
  return usePolled(async (signal) => (await api.quoteTokens(signal)).items, "quote-tokens", intervalMs);
}

export function useStats(intervalMs = 15_000): Polled<ApiStats> {
  return usePolled((signal) => api.stats(signal), "stats", intervalMs);
}

export type { Token };
