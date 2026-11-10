import { NextResponse } from "next/server";
import { callClaude, clientIp, rateLimit } from "@/lib/ai/claude";

export const runtime = "nodejs";

const SYSTEM_PROMPT =
  "Summarise a wallet's token portfolio in 2-3 plain sentences. " +
  "Observations only: biggest position, concentration, notable moves. " +
  'No advice, no predictions, no "should".';

interface Position {
  t: string;
  valueSTRK: number;
  costSTRK: number;
  chg24h: number;
  bonding: number;
}

function fallback(portfolio: { totalSTRK?: number; idleSTRK?: number; positions?: Position[] }): string {
  const positions = (portfolio.positions ?? []).slice().sort((a, b) => b.valueSTRK - a.valueSTRK);
  if (!positions.length) return "This wallet has no token positions yet — only idle STRK.";
  const invested = positions.reduce((a, b) => a + b.valueSTRK, 0);
  const top = positions[0]!;
  const conc = invested ? Math.round((top.valueSTRK / invested) * 100) : 0;
  const mover = positions.slice().sort((a, b) => Math.abs(b.chg24h) - Math.abs(a.chg24h))[0]!;
  return (
    `This wallet holds ${positions.length} token${positions.length === 1 ? "" : "s"} worth about ${invested.toFixed(1)} STRK, plus ${(portfolio.idleSTRK ?? 0)} STRK idle. ` +
    `Its biggest position is $${top.t} at ${top.valueSTRK.toFixed(1)} STRK — roughly ${conc}% of the token value, so it's fairly concentrated. ` +
    `The largest 24h move is $${mover.t} at ${mover.chg24h > 0 ? "+" : ""}${mover.chg24h}%.`
  );
}

export async function POST(req: Request) {
  if (!rateLimit(clientIp(req))) {
    return NextResponse.json({ error: "Too many requests. Please slow down." }, { status: 429 });
  }
  let portfolio: { totalSTRK?: number; idleSTRK?: number; positions?: Position[] } = {};
  try {
    const body = (await req.json()) as { portfolio?: unknown };
    portfolio = (body.portfolio ?? {}) as typeof portfolio;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const text = await callClaude({
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: JSON.stringify(portfolio) }],
    maxTokens: 260,
  });
  return NextResponse.json({ text: (text ?? "").trim() || fallback(portfolio) }, { headers: { "cache-control": "no-store" } });
}
