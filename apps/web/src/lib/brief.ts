// A plain-facts brief about a token, worked out from indexed data with no AI involved.
//
// It is shown above the AI's write-up, so a research page is rich even when the model is slow or offline, and it
// is also what the AI is given as its facts. Every signal states an observation ("3 holders"), never a verdict:
// no safety score, no prediction, no advice.

import type { ApiHolders, ApiTrade } from "./api";
import { toNumber } from "./format";
import type { Token } from "./token";

export interface Signal {
  label: string;
  detail: string;
  tone: "good" | "warn" | "neutral";
}

export interface Facts {
  buys: number;
  sells: number;
  /** Share of the sampled trades that were buys, 0 to 1, or null with no trades. */
  buyShare: number | null;
  buyVolume: number;
  sellVolume: number;
  uniqueTraders: number;
  avgTrade: number;
  largestTrade: number;
  /** Minutes since the latest trade, or null when there has been none. */
  lastTradeMinutes: number | null;
  holderWallets: number | null;
  top10SharePct: number | null;
  creatorSharePct: number | null;
  /** The biggest wallet that is not the curve or the reserved share, as a percent of supply. */
  topWalletPct: number | null;
  raised: number;
  target: number;
  remaining: number;
  feesCollected: number;
}

export interface Brief {
  facts: Facts;
  signals: Signal[];
}

const MINUTE = 60_000;

/** "5 minutes ago", "3 hours ago", "2 days ago" for a count of minutes. */
export function sinceLabel(minutes: number): string {
  if (minutes < 1) return "under a minute ago";
  if (minutes < 60) return `${Math.round(minutes)} minute${Math.round(minutes) === 1 ? "" : "s"} ago`;
  if (minutes < 60 * 48) return `${Math.round(minutes / 60)} hour${Math.round(minutes / 60) === 1 ? "" : "s"} ago`;
  return `${Math.round(minutes / 1440)} days ago`;
}

export function buildBrief(token: Token, trades: ApiTrade[], holders: ApiHolders | null, nowMs = Date.now()): Brief {
  const dec = token.quote.decimals;
  const amounts = trades.map((x) => ({ side: x.side, trader: x.trader, amount: toNumber(x.traderAmount, dec), time: new Date(x.blockTime).getTime() }));
  const buys = amounts.filter((x) => x.side === "buy");
  const sells = amounts.filter((x) => x.side === "sell");
  const sum = (list: { amount: number }[]) => list.reduce((a, x) => a + x.amount, 0);
  const latest = amounts.reduce((m, x) => Math.max(m, x.time), 0);
  const target = toNumber(token.launch.graduationRaise, dec);
  const raised = (target * token.launch.market.progressBps) / 10_000;
  const wallets = holders ? holders.items.filter((h) => h.role !== "curve" && h.role !== "reserve") : [];

  const facts: Facts = {
    buys: buys.length,
    sells: sells.length,
    buyShare: amounts.length ? buys.length / amounts.length : null,
    buyVolume: sum(buys),
    sellVolume: sum(sells),
    uniqueTraders: new Set(amounts.map((x) => x.trader)).size,
    avgTrade: amounts.length ? sum(amounts) / amounts.length : 0,
    largestTrade: amounts.reduce((m, x) => Math.max(m, x.amount), 0),
    lastTradeMinutes: latest ? Math.max(0, (nowMs - latest) / MINUTE) : null,
    holderWallets: holders ? holders.wallets : null,
    top10SharePct: holders ? holders.top10ShareBps / 100 : null,
    creatorSharePct: holders ? holders.creatorShareBps / 100 : null,
    topWalletPct: wallets.length ? Math.max(...wallets.map((h) => h.shareBps)) / 100 : null,
    raised,
    target,
    remaining: Math.max(0, target - raised),
    feesCollected: toNumber(token.launch.tradeFee.totalCollected, dec),
  };

  const signals: Signal[] = [];
  const unit = token.quote.symbol;

  // Activity
  if (facts.lastTradeMinutes === null) {
    signals.push({ label: "No trades yet", detail: "The chart and price start with the first trade.", tone: "neutral" });
  } else if (facts.lastTradeMinutes < 60) {
    signals.push({ label: "Active", detail: `Last trade ${sinceLabel(facts.lastTradeMinutes)}.`, tone: "good" });
  } else if (facts.lastTradeMinutes < 60 * 24) {
    signals.push({ label: "Quiet", detail: `Last trade ${sinceLabel(facts.lastTradeMinutes)}.`, tone: "neutral" });
  } else {
    signals.push({ label: "Dormant", detail: `No trade for ${sinceLabel(facts.lastTradeMinutes).replace(" ago", "")}.`, tone: "warn" });
  }

  // Buying versus selling, only with enough trades to mean something
  if (facts.buyShare !== null && trades.length >= 3) {
    const pct = Math.round(facts.buyShare * 100);
    if (facts.buyShare >= 0.7) signals.push({ label: "Mostly buys", detail: `${pct}% of the last ${trades.length} trades were buys.`, tone: "good" });
    else if (facts.buyShare <= 0.3) signals.push({ label: "Mostly sells", detail: `${100 - pct}% of the last ${trades.length} trades were sells.`, tone: "warn" });
    else signals.push({ label: "Balanced trading", detail: `${facts.buys} buys and ${facts.sells} sells in the last ${trades.length} trades.`, tone: "neutral" });
  }

  // Who holds it
  if (facts.holderWallets !== null) {
    const n = facts.holderWallets;
    if (n < 5) signals.push({ label: `${n} holder${n === 1 ? "" : "s"}`, detail: "Very few wallets hold this token so far.", tone: "warn" });
    else if (n >= 25) signals.push({ label: `${n} holders`, detail: "Held across a good number of wallets.", tone: "good" });
    else signals.push({ label: `${n} holders`, detail: "A small but growing holder base.", tone: "neutral" });
  }
  if (facts.creatorSharePct !== null && facts.creatorSharePct > 10) {
    signals.push({ label: `Creator holds ${facts.creatorSharePct}%`, detail: "A large share of the supply sits with the creator wallet.", tone: "warn" });
  } else if (facts.creatorSharePct !== null) {
    signals.push({ label: `Creator holds ${facts.creatorSharePct}%`, detail: "A modest creator share.", tone: "neutral" });
  }
  if (facts.top10SharePct !== null && facts.top10SharePct > 50) {
    signals.push({ label: "Concentrated", detail: `The ten biggest wallets hold ${facts.top10SharePct}% of the supply.`, tone: "warn" });
  }

  // Where it is on the curve
  if (token.graduated) {
    signals.push({ label: "Graduated", detail: "The raise target was reached. Trading on the curve continues.", tone: "good" });
  } else {
    const stage = token.bond < 10 ? "Early stage" : token.bond < 60 ? "Mid curve" : "Near graduation";
    signals.push({ label: stage, detail: `${token.bond}% of the raise is in, ${facts.remaining.toFixed(2)} ${unit} to go.`, tone: "neutral" });
  }

  return { facts, signals };
}
