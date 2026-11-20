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

/** One place to ask for the price: where, with what headers, and how to read its answer. */
export interface PriceSource {
  name: string;
  url: string;
  headers?: Record<string, string>;
  /** The dollar price in the answer, or anything else (which is treated as "no price"). */
  parse(body: unknown): unknown;
}

const asNumber = (v: unknown) => (typeof v === "string" ? Number(v) : v);

/**
 * Where to look, in order. CoinGecko first (a free key in COINGECKO_API_KEY keeps it from being rate limited on a
 * shared host), then two exchanges' public price endpoints, used only when the one before it failed.
 */
export function defaultSources(env: Record<string, string | undefined> = process.env): PriceSource[] {
  const key = env.COINGECKO_API_KEY?.trim();
  return [
    { name: "coingecko", url: PRICE_URL, headers: key ? { "x-cg-demo-api-key": key } : undefined, parse: (b) => (b as { starknet?: { usd?: unknown } })?.starknet?.usd },
    { name: "coinbase", url: "https://api.coinbase.com/v2/prices/STRK-USD/spot", parse: (b) => asNumber((b as { data?: { amount?: unknown } })?.data?.amount) },
    {
      name: "kraken",
      url: "https://api.kraken.com/0/public/Ticker?pair=STRKUSD",
      // The last trade price is the first entry of "c" for the one pair Kraken answers with.
      parse: (b) => asNumber((Object.values((b as { result?: Record<string, { c?: unknown[] }> })?.result ?? {})[0] as { c?: unknown[] } | undefined)?.c?.[0]),
    },
  ];
}

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
    /** Backups tried in order if the main url fails. */
    private readonly fallbacks: PriceSource[] = defaultSources().slice(1),
    private readonly log: (message: string) => void = (m) => console.error(m),
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

  /** Ask each source in turn and keep the first sensible answer. A failure is logged, never fatal. */
  private async refresh(): Promise<void> {
    const main: PriceSource = this.url === PRICE_URL ? defaultSources()[0]! : { name: "main", url: this.url, parse: (b) => (b as { starknet?: { usd?: unknown } })?.starknet?.usd };
    for (const source of [main, ...this.fallbacks]) {
      try {
        const response = await this.fetchImpl(source.url, { signal: AbortSignal.timeout(5_000), headers: { accept: "application/json", ...source.headers } });
        if (!response.ok) {
          this.log(`[prices] ${source.name} answered not-ok`);
          continue;
        }
        const usd = source.parse(await response.json());
        // A zero, negative, absurd or non-numeric answer is a broken source, not a price.
        if (typeof usd !== "number" || !Number.isFinite(usd) || usd <= 0 || usd > 1_000) {
          this.log(`[prices] ${source.name} gave an unusable answer`);
          continue;
        }
        this.quote = { usd, at: this.now() };
        return;
      } catch (error) {
        this.log(`[prices] ${source.name} could not be reached (${error instanceof Error ? error.name : "error"})`);
      }
    }
    /* every source failed: keep whatever we had */
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
