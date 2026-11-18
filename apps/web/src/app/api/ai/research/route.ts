import { NextResponse } from "next/server";
import { callClaude, extractJson, guardAi, readJson } from "@/lib/ai/claude";

export const runtime = "nodejs";

const SYSTEM_PROMPT =
  "You are a token research analyst on a Starknet launchpad. Use ONLY the JSON data provided. " +
  'Reply ONLY minified JSON: {"overview":"","contract":"","tokenomics":"","holders":"","activity":"","risks":[""],"missing":[""],"coverage":{"overview":3,"contract":2,"tokenomics":3,"holders":0,"activity":2,"risks":2,"missing":3}}. ' +
  "Each text field 1-3 sentences with concrete numbers, focused on the user question; if comparing, compare. " +
  "risks: 2-4 neutral factual observations (e.g. early stage, creator allocation), not predictions. " +
  "Amounts in different quote assets (STRK, USDC) are different units: never add or compare them. " +
  "If holder data is absent, say it is not available. " +
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

const num = (v: unknown, digits = 4) => (typeof v === "number" && Number.isFinite(v) ? +v.toFixed(digits) : "?");

function fallback(data: any): Report {
  const p = data?.primary ?? {};
  const b = p.bonding ?? {};
  const tr = p.last30Trades ?? {};
  const asset = p.quoteAsset ?? "";
  const cmp = Array.isArray(data?.compare) && data.compare[0] ? data.compare[0] : null;
  const change = typeof p.change24hPct === "number" ? `${p.change24hPct >= 0 ? "+" : ""}${p.change24hPct.toFixed(1)}% over 24h` : "24h change unknown";
  const comparable = cmp && cmp.quoteAsset === p.quoteAsset;
  return {
    overview:
      `${p.name} ($${p.ticker}) is a bonding-curve token on Starknet, launched ${p.age} ago. It is ${b.graduated ? "graduated" : `${b.progressPct}% of the way to graduation`} with ${(p.trades ?? 0).toLocaleString()} trades, priced at ${num(p.price, 8)} ${asset} (${change}).` +
      (cmp
        ? ` Compared with ${cmp.name} ($${cmp.ticker}) at ${cmp.bonding?.progressPct}% bonded, ${comparable ? `$${p.ticker} has ${(p.volume ?? 0) >= (cmp.volume ?? 0) ? "more" : "less"} volume` : "the two use different quote assets, so their amounts cannot be compared directly"}.`
        : ""),
    contract: "The token has a fixed supply and no mint function, and the curve contract holds the liquidity. The contracts are tested but not yet independently audited.",
    tokenomics: `Total supply is 1,000,000,000, fixed at deploy. The creator set aside ${p.supply?.creatorPct ?? "?"}%. Tokens are sold through a ${b.preset ?? "bonding"} curve in ${asset}; graduation is a milestone at a raise of ${num(b.graduationRaise, 2)} ${asset}, not a lock. The trade fee is ${p.fees?.tradeFeePct ?? "?"}%.`,
    holders: p.holders
      ? `${(p.holders.wallets ?? 0).toLocaleString()} wallets hold the token. The ten biggest hold ${p.holders.top10SharePct}% of the supply and the creator holds ${p.holders.creatorSharePct}%. The bonding curve and the reserved share are not counted as holders.`
      : "Holder distribution is not available for this token.",
    activity: `Across the last ${(tr.buys ?? 0) + (tr.sells ?? 0)} trades there were ${tr.buys ?? 0} buys totalling ${num(tr.buyVolume, 2)} ${asset} and ${tr.sells ?? 0} sells totalling ${num(tr.sellVolume, 2)} ${asset}.`,
    risks: [
      `Early stage: the token is ${b.progressPct ?? "?"}% through its bonding curve, so single trades can move the price sharply.`,
      `Creator allocation is ${p.supply?.creatorPct ?? "?"}% of supply, visible on-chain.`,
      "The contracts have no independent audit yet. Treat this as testnet software.",
    ],
    missing: Array.isArray(p.unavailable) ? p.unavailable : ["holder distribution", "off-chain team identity", "social data", "DEX liquidity (no pool exists)"],
    coverage: { overview: 3, contract: 2, tokenomics: 3, holders: p.holders ? 3 : 0, activity: 2, risks: 2, missing: 3 },
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
  const blocked = guardAi(req);
  if (blocked) return blocked;
  let question = "";
  let data: any = {};
  try {
    const body = (await readJson(req)) as { question?: unknown; data?: unknown };
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
