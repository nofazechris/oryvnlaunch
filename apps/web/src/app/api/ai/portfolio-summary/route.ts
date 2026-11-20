import { NextResponse } from "next/server";
import { callModel, guardAi, readJson } from "@/lib/ai/claude";

export const runtime = "nodejs";

const SYSTEM_PROMPT =
  "Summarise a wallet's token portfolio in 2-3 plain sentences. " +
  "Observations only: biggest position, concentration, notable moves. " +
  'No advice, no predictions, no "should".';

// What the Portfolio screen sends: positions from this wallet's own trades, each valued in its own quote
// asset (STRK and USDC are never added together).
interface Position {
  token: string;
  asset?: string;
  tokensHeld?: number;
  approxValue?: number | null;
  bondingPct?: number | null;
  change24hPct?: number | null;
}
interface PortfolioInput {
  created?: number;
  trades?: number;
  positions?: Position[];
}

function fallback(portfolio: PortfolioInput): string {
  const positions = portfolio.positions ?? [];
  const created = portfolio.created ? ` It has launched ${portfolio.created} token${portfolio.created === 1 ? "" : "s"}.` : "";
  if (!positions.length) return `This wallet has no open token positions from its trades here.${created}`;
  const byAsset = new Map<string, Position[]>();
  for (const p of positions) byAsset.set(p.asset ?? "?", [...(byAsset.get(p.asset ?? "?") ?? []), p]);
  const parts: string[] = [];
  for (const [asset, list] of byAsset) {
    const priced = list.filter((p) => typeof p.approxValue === "number");
    const total = priced.reduce((a, p) => a + (p.approxValue ?? 0), 0);
    const top = priced.slice().sort((a, b) => (b.approxValue ?? 0) - (a.approxValue ?? 0))[0];
    parts.push(
      `${list.length} token${list.length === 1 ? "" : "s"} paired with ${asset}` +
        (top && total > 0 ? `, worth about ${total.toFixed(2)} ${asset}, the biggest being $${top.token} at ${Math.round(((top.approxValue ?? 0) / total) * 100)}% of that` : ""),
    );
  }
  return `This wallet holds ${parts.join("; and ")}. Amounts in different assets are separate and are not added together.${created}`;
}

export async function POST(req: Request) {
  const blocked = guardAi(req);
  if (blocked) return blocked;
  let portfolio: PortfolioInput = {};
  try {
    const body = (await readJson(req)) as { portfolio?: unknown };
    portfolio = (body.portfolio ?? {}) as typeof portfolio;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const text = await callModel({
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: JSON.stringify(portfolio) }],
    maxTokens: 260,
  });
  return NextResponse.json({ text: (text ?? "").trim() || fallback(portfolio) }, { headers: { "cache-control": "no-store" } });
}
