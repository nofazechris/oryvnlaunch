// What a screen needs to draw a token, built from a real launch. This replaces the old invented
// `Token`/`view()` demo model: every value here comes from the API.
//
// The numbers (`price`, `mcap`, `vol`) are display-only approximations. Everything is measured in the
// token's OWN quote asset (STRK or USDC), which is why `quote` rides along: never add or rank the
// numbers of tokens with different quote assets against each other.

import type { ApiLaunch } from "./api";
import { API_URL } from "./config";
import { paletteFor } from "./art";
import { age, ageMinutes, compact, fmtSmall, pctFromBps, priceNumber, shortAddr, toNumber } from "./format";
import { cleanText } from "./safe";

export interface Token {
  /** The token's address: its identity everywhere. Symbols are not unique. */
  addr: string;
  curve: string;
  name: string;
  sym: string;
  creator: string;
  creatorShort: string;
  quote: { symbol: string; decimals: number };
  /** The launch as the API returned it, for anything not covered below. */
  launch: ApiLaunch;

  // colours, from the address
  g: [string, string];
  ink: string;
  bg: string;
  g0: string;
  g1: string;
  barBg: string;

  // market, display-only numbers in the quote asset
  price: number;
  mcap: number;
  vol: number;
  /** 24h change in percent, or null when unknown. */
  chg: number | null;
  /** Progress to graduation, 0 to 100. */
  bond: number;
  trades: number;
  graduated: boolean;

  priceStr: string;
  mcapStr: string;
  volStr: string;
  chgStr: string;
  chgColor: string;
  addrShort: string;
  age: string;
  ageMins: number;
  href: string;
  /** Unix ms of the last trade, or 0. */
  lastTradeMs: number;
  createdMs: number;
  /** The creator's text and links, as checked by the API. */
  description: string;
  links: ApiLaunch["metadata"]["links"];
  /** Absolute URL of the creator's image, or null for the generated avatar. */
  imageUrl: string | null;
}

export function toToken(launch: ApiLaunch): Token {
  const [primary, light, ink] = paletteFor(launch.token);
  const quote = { symbol: launch.quote.symbol ?? "?", decimals: launch.quote.decimals ?? 18 };
  const price = priceNumber(launch.market.price, launch.quote);
  const mcap = toNumber(launch.market.marketCap, quote.decimals);
  const vol = toNumber(launch.market.volumeQuote, quote.decimals);
  const chg = launch.market.change24hBps === null ? null : launch.market.change24hBps / 100;
  return {
    addr: launch.token,
    curve: launch.curve,
    name: cleanText(launch.name, 64),
    sym: cleanText(launch.symbol, 16),
    creator: launch.creator,
    creatorShort: shortAddr(launch.creator),
    quote,
    launch,
    g: [primary, light],
    ink,
    bg: `linear-gradient(150deg, ${light}, ${primary})`,
    g0: primary,
    g1: light,
    barBg: `linear-gradient(90deg, ${primary}, ${light})`,
    price,
    mcap,
    vol,
    chg,
    bond: Math.round(launch.market.progressBps / 100),
    trades: launch.market.tradeCount,
    graduated: launch.graduated,
    priceStr: fmtSmall(price),
    mcapStr: compact(mcap),
    volStr: compact(vol),
    chgStr: pctFromBps(launch.market.change24hBps),
    chgColor: chg === null || chg === 0 ? "#8a8a8a" : chg > 0 ? "#55D69A" : "#FF6868",
    addrShort: shortAddr(launch.token),
    age: age(launch.createdAt),
    ageMins: ageMinutes(launch.createdAt),
    href: `/token?t=${launch.token}`,
    lastTradeMs: launch.market.lastTradeAt ? new Date(launch.market.lastTradeAt).getTime() : 0,
    createdMs: new Date(launch.createdAt).getTime(),
    description: launch.metadata.description,
    links: launch.metadata.links,
    imageUrl: launch.metadata.image ? API_URL + launch.metadata.image : null,
  };
}
