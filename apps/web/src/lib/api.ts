// A typed client for the read API. The shapes mirror apps/api/src/serialize.ts.
//
// Every amount, price and market cap arrives as a decimal STRING in the quote asset's smallest unit,
// because values go up to 2^256 and a JavaScript number would silently round them. Keep them as strings
// or bigint; convert to a number only at the last moment, for display (see format.ts).

import { API_URL } from "./config";

export interface ApiAsset {
  address: string;
  /** Null for an asset we do not recognise. */
  symbol: string | null;
  decimals: number | null;
}

export interface ApiLaunch {
  token: string;
  curve: string;
  creator: string;
  quote: ApiAsset;
  name: string;
  symbol: string;
  metadataUri: string;
  /** What the launch said about itself, checked by the API. Always present; empty when there is nothing readable. */
  metadata: { description: string; links: Partial<Record<"web" | "x" | "tg" | "dc", string>>; image: string | null };
  preset: { id: number; name: string | null };
  creatorBps: number;
  graduationRaise: string;
  deployFee: string;
  /** The asset the deploy fee was paid in (STRK or USDC). The token itself trades in `quote`. */
  feeAsset: ApiAsset;
  tradeFee: { bps: number; creatorShareBps: number; totalCollected: string };
  createdAt: string;
  createdBlock: number;
  createdTx: string;
  graduated: boolean;
  graduatedAt: string | null;
  market: {
    quoteReserve: string;
    tokenReserve: string;
    /** Smallest quote units per whole token, scaled by 1e18. */
    price: string;
    marketCap: string;
    volumeQuote: string;
    tradeCount: number;
    lastTradeAt: string | null;
    /** Basis points (100 = 1%) over 24 hours, or since launch if younger. Null if unknown. */
    change24hBps: number | null;
    /** 0 to 10000. */
    progressBps: number;
  };
}

export interface ApiTrade {
  id: string;
  side: "buy" | "sell";
  trader: string;
  /** The curve-side amount. */
  quoteAmount: string;
  fee: string;
  /** What the trader paid (buy) or received (sell), fee included. */
  traderAmount: string;
  tokenAmount: string;
  price: string;
  quoteReserve: string;
  tokenReserve: string;
  txHash: string;
  blockNumber: number;
  blockTime: string;
}

export interface ApiCandle {
  /** Unix seconds at the start of the bucket. */
  time: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  trades: number;
}

export type CandleInterval = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

export interface ApiActivity {
  kind: "launch" | "buy" | "sell" | "graduation";
  time: string;
  token: string;
  symbol: string;
  name: string;
  quote: ApiAsset;
  wallet: string | null;
  amount: string | null;
  tokenAmount: string | null;
  txHash: string | null;
  blockNumber: number | null;
}

export interface ApiHolder {
  address: string;
  role: "curve" | "reserve" | "creator" | "holder";
  /** Exact, in the token's smallest unit. */
  balance: string;
  shareBps: number;
}

export interface ApiHolders {
  /** Everyone with a balance, including the curve and the reserve. */
  count: number;
  /** Wallets only: not counting the curve or the reserve. */
  wallets: number;
  supply: string;
  top10ShareBps: number;
  creatorShareBps: number;
  items: ApiHolder[];
}

export interface ApiStats {
  launches: number;
  graduated: number;
  trades: number;
  wallets: number;
  byAsset: (ApiAsset & { launches: number; volume: string; fees: string })[];
}

export interface ApiQuoteToken extends ApiAsset {
  enabled: boolean;
  deployFee: string;
  graduationRaise: string;
  sinceBlock: number;
}

/** An asset a creator can pay the deploy fee in. It is only how they pay: every token trades in STRK. */
export interface ApiFeeAsset extends ApiAsset {
  enabled: boolean;
  /** In the asset's smallest unit. */
  deployFee: string;
  sinceBlock: number;
}

export interface ApiPrices {
  /** STRK in dollars from an outside quote. Null when there is no trustworthy quote right now. */
  STRK: { usd: number; fetchedAt: string; stale: boolean } | null;
  /** Treated as one dollar. */
  USDC: { usd: number; pegged: boolean };
}

export interface ApiHealth {
  status: string;
  database: string;
  indexer: { block: number; updatedAt: string; ageSeconds: number } | null;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(API_URL + path, { signal, headers: { accept: "application/json" } });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError("Cannot reach the oryvnlaunch API. Is it running?");
  }
  if (!response.ok) {
    let message = `The API answered ${response.status}`;
    try {
      const body = (await response.json()) as { message?: unknown };
      if (typeof body.message === "string") message = body.message;
    } catch {
      /* keep the status message */
    }
    throw new ApiError(message, response.status);
  }
  return (await response.json()) as T;
}

const qs = (params: Record<string, string | number | boolean | undefined>) => {
  const q = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  return q ? `?${q}` : "";
};

export type LaunchSort = "newest" | "progress" | "marketcap" | "volume";

export const api = {
  launches: (params: { sort?: LaunchSort; quote?: string; creator?: string; graduated?: boolean; limit?: number; offset?: number } = {}, signal?: AbortSignal) =>
    request<{ items: ApiLaunch[]; total: number }>(`/launches${qs(params)}`, signal),
  launch: (token: string, signal?: AbortSignal) => request<ApiLaunch>(`/launches/${token}`, signal),
  trades: (token: string, params: { limit?: number; offset?: number } = {}, signal?: AbortSignal) =>
    request<{ items: ApiTrade[]; total: number }>(`/launches/${token}/trades${qs(params)}`, signal),
  holders: (token: string, limit = 20, signal?: AbortSignal) => request<ApiHolders>(`/launches/${token}/holders${qs({ limit })}`, signal),
  candles: (token: string, interval: CandleInterval, limit = 120, signal?: AbortSignal) =>
    request<{ interval: CandleInterval; items: ApiCandle[] }>(`/launches/${token}/candles${qs({ interval, limit })}`, signal),
  activity: (params: { limit?: number; wallet?: string; token?: string } = {}, signal?: AbortSignal) =>
    request<{ items: ApiActivity[] }>(`/activity${qs(params)}`, signal),
  stats: (signal?: AbortSignal) => request<ApiStats>("/stats", signal),
  feeAssets: (signal?: AbortSignal) => request<{ items: ApiFeeAsset[] }>("/fee-assets", signal),
  prices: (signal?: AbortSignal) => request<ApiPrices>("/prices", signal),
  quoteTokens: (signal?: AbortSignal) => request<{ items: ApiQuoteToken[] }>("/quote-tokens", signal),
  health: (signal?: AbortSignal) => request<ApiHealth>("/health", signal),
};

/** Upload a token image. Resolves with the reference to put in the launch's metadata. */
export async function uploadImage(file: Blob): Promise<{ hash: string; uri: string; path: string }> {
  let response: Response;
  try {
    response = await fetch(API_URL + "/images", { method: "POST", headers: { "content-type": file.type }, body: file });
  } catch {
    throw new ApiError("Cannot reach the oryvnlaunch API. Is it running?");
  }
  if (!response.ok) {
    let message = `The upload failed (${response.status})`;
    try {
      const body = (await response.json()) as { message?: unknown };
      if (typeof body.message === "string") message = body.message;
    } catch {
      /* keep the status message */
    }
    throw new ApiError(message, response.status);
  }
  return (await response.json()) as { hash: string; uri: string; path: string };
}
