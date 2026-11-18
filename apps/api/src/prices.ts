// What a STRK is worth in dollars, so a market cap or a fee can be shown in a number people understand.
//
// The platform's own numbers (reserves, fees, market cap) are exact amounts of STRK on-chain. The dollar
// figure is a convenience on top: an outside quote, fetched by the server, cached, and always shown as
// approximate. It is never used for any decision that moves money.
//
// Failure is handled in the open: when the source is down we keep serving the last good quote for a while,
// marked as old, and after that we say we do not know. We never invent a price.

import { Controller, Get, Global, Inject, Injectable, Module, type DynamicModule } from "@nestjs/common";

/** The source. CoinGecko's public endpoint needs no key; its rate limit is why we cache. */
export const PRICE_URL = "https://api.coingecko.com/api/v3/simple/price?ids=starknet&vs_currencies=usd";

export interface UsdQuote {
  usd: number;
  /** When we fetched it, ISO. */
  fetchedAt: string;
  /** True when the source failed recently and this is the last good value. */
  stale: boolean;
}

export type FetchLike = (url: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

@Injectable()
export class PriceService {
  private quote: { usd: number; at: number } | null = null;
  private inflight: Promise<void> | null = null;

  constructor(
    private readonly fetchImpl: FetchLike = fetch as unknown as FetchLike,
    private readonly now: () => number = Date.now,
    /** Serve a cached quote without asking again for this long. */
    private readonly freshMs = 60_000,
    /** After this long without a successful fetch, say we do not know instead of serving an old number. */
    private readonly maxAgeMs = 15 * 60_000,
    private readonly url = PRICE_URL,
  ) {}

  /** STRK in US dollars, or null when there is no trustworthy quote. */
  async strk(): Promise<UsdQuote | null> {
    const age = this.quote ? this.now() - this.quote.at : Infinity;
    if (age >= this.freshMs) {
      // One request at a time, however many callers arrive together.
      this.inflight ??= this.refresh().finally(() => {
        this.inflight = null;
      });
      await this.inflight;
    }
    if (!this.quote) return null;
    const since = this.now() - this.quote.at;
    if (since > this.maxAgeMs) return null;
    return { usd: this.quote.usd, fetchedAt: new Date(this.quote.at).toISOString(), stale: since >= this.freshMs };
  }

  private async refresh(): Promise<void> {
    try {
      const response = await this.fetchImpl(this.url, { signal: AbortSignal.timeout(5_000), headers: { accept: "application/json" } });
      if (!response.ok) return;
      const body = (await response.json()) as { starknet?: { usd?: unknown } };
      const usd = body?.starknet?.usd;
      // A zero, negative, absurd or non-numeric answer is a broken source, not a price.
      if (typeof usd !== "number" || !Number.isFinite(usd) || usd <= 0 || usd > 1_000) return;
      this.quote = { usd, at: this.now() };
    } catch {
      /* keep whatever we had */
    }
  }
}

/** Makes one price service available to every module, the same way the database is. */
@Global()
@Module({})
export class PriceModule {
  static forService(service: PriceService): DynamicModule {
    return { module: PriceModule, providers: [{ provide: PriceService, useValue: service }], exports: [PriceService] };
  }
}

@Controller("prices")
export class PricesController {
  constructor(@Inject(PriceService) private readonly prices: PriceService) {}

  /**
   * Dollar values for display. STRK comes from an outside quote and is null when unavailable. USDC is
   * treated as one dollar, which is what it is built to be; that is a display convenience, not a guarantee.
   */
  @Get()
  async get() {
    const strk = await this.prices.strk();
    return {
      STRK: strk,
      USDC: { usd: 1, pegged: true },
    };
  }
}
