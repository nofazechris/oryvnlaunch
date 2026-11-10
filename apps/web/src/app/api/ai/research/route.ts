import { NextResponse } from "next/server";
import { callClaude, clientIp, extractJson, rateLimit } from "@/lib/ai/claude";

export const runtime = "nodejs";

const SYSTEM_PROMPT =
  "You are a token research analyst on a Starknet launchpad. Use ONLY the JSON data provided. " +
  'Reply ONLY minified JSON: {"overview":"","contract":"","tokenomics":"","holders":"","activity":"","risks":[""],"missing":[""],"coverage":{"overview":3,"contract":3,"tokenomics":3,"holders":3,"activity":2,"risks":2,"missing":3}}. ' +
  "Each text field 1-3 sentences with concrete numbers, focused on the user question; if comparing, compare. " +
  "risks: 2-4 neutral factual observations (e.g. concentration, early stage), not predictions. " +
  "missing: what the data cannot tell. coverage 0-3 = how well data covers it. " +
  "Never predict price, never advise buying/selling, never give a safety score.";

interface Report {
  overview: string;
  contract: string;
  tokenomics: string;
  holders: string;
  activity: string;
  risks: string[];
  missing: string[];
  coverage: Record<string, number>;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function fallback(data: any): Report {
  const p = data?.primary ?? {};
  const b = p.bonding ?? {};
  const tr = p.last30Trades ?? {};
  const top = Array.isArray(p.topHolders) ? p.topHolders : [];
  const top10 = top.slice(1).reduce((a: number, x: any) => a + (x.pct || 0), 0);
  const creatorPct = p.supply?.creatorPct ?? 0;
  const cmp = Array.isArray(data?.compare) && data.compare[0] ? data.compare[0] : null;
  const price = p.priceSTRK != null ? p.priceSTRK.toFixed(7) : "?";
  return {
    overview:
      `${p.name} ($${p.ticker}) is a bonding-curve token on Starknet, launched ${p.age} ago. It sits at ${b.progressPct}% of graduation with ${(p.holders ?? 0).toLocaleString()} holders and ${(p.trades ?? 0).toLocaleString()} trades, priced at ${price} STRK (${p.change24hPct >= 0 ? "+" : ""}${p.change24hPct}% over 24h).` +
      (cmp ? ` Compared with ${cmp.name} ($${cmp.ticker}) at ${cmp.bonding?.progressPct}% bonded and ${(cmp.holders ?? 0).toLocaleString()} holders, $${p.ticker} is ${(p.volume24hSTRK ?? 0) >= (cmp.volume24hSTRK ?? 0) ? "trading more" : "trading less"} by 24h volume.` : ""),
    contract: `The contract is ${p.contract?.verified ? "verified" : "unverified"} (${p.contract?.template}), ownership is ${p.contract?.ownerRenounced ? "renounced" : "retained"}, it is ${p.contract?.upgradable ? "upgradable" : "not upgradable"}, and it exposes no mint function.`,
    tokenomics: `Total supply is 1,000,000,000, fixed at deploy with no mint. The creator holds ${creatorPct}%. Tokens are sold through a ${b.template} bonding curve; graduation triggers at ${(b.graduationSTRK ?? 0).toLocaleString()} STRK reserve, with roughly ${(b.reserveSTRK ?? 0).toLocaleString()} STRK accumulated so far.`,
    holders: `Excluding the bonding-curve contract, the top wallets hold about ${top10.toFixed(1)}% of supply, and the creator allocation is ${creatorPct}%. There are ${(p.holders ?? 0).toLocaleString()} holders in total.`,
    activity: `Across the last 30 trades (~${tr.spanMinutes} minutes) there were ${tr.buys} buys totalling ${tr.buySTRK} STRK and ${tr.sells} sells totalling ${tr.sellSTRK} STRK, a ${tr.buySTRK >= tr.sellSTRK ? "net buy" : "net sell"} skew.`,
    risks: [
      `Holder concentration: the top wallets (excl. curve) hold ${top10.toFixed(1)}% of supply.`,
      `Early stage: the token is ${b.progressPct}% through its bonding curve, so price can move sharply on single trades.`,
      `Creator wallet holds ${creatorPct}% of supply, visible on-chain.`,
    ],
    missing: Array.isArray(p.unavailable) ? p.unavailable : ["off-chain team identity", "social follower data", "DEX liquidity (not graduated)"],
    coverage: { overview: 3, contract: 3, tokenomics: 3, holders: 3, activity: 2, risks: 2, missing: 3 },
  };
}

function validate(parsed: any, data: any): Report {
  if (!parsed || typeof parsed !== "object") return fallback(data);
  const fb = fallback(data);
  const str = (v: unknown, d: string) => (typeof v === "string" && v.trim() ? v.trim() : d);
  const arr = (v: unknown, d: string[]) => (Array.isArray(v) && v.length ? v.map((x) => String(x)) : d);
  return {
    overview: str(parsed.overview, fb.overview),
    contract: str(parsed.contract, fb.contract),
    tokenomics: str(parsed.tokenomics, fb.tokenomics),
    holders: str(parsed.holders, fb.holders),
    activity: str(parsed.activity, fb.activity),
    risks: arr(parsed.risks, fb.risks),
    missing: arr(parsed.missing, fb.missing),
    coverage: parsed.coverage && typeof parsed.coverage === "object" ? parsed.coverage : fb.coverage,
  };
}

export async function POST(req: Request) {
  if (!rateLimit(clientIp(req))) {
    return NextResponse.json({ error: "Too many requests. Please slow down." }, { status: 429 });
  }
  let question = "";
  let data: any = {};
  try {
    const body = (await req.json()) as { question?: unknown; data?: unknown };
    question = String(body.question ?? "").trim().slice(0, 400);
    data = body.data ?? {};
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const text = await callClaude({
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: `Question: ${question}\nData: ${JSON.stringify(data)}` }],
    maxTokens: 1400,
  });
  const report = text ? validate(extractJson(text), data) : fallback(data);
  return NextResponse.json(report, { headers: { "cache-control": "no-store" } });
}
