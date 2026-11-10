import { NextResponse } from "next/server";
import { callClaude, clientIp, rateLimit } from "@/lib/ai/claude";

export const runtime = "nodejs";

const SYSTEM_PROMPT =
  "You explain token launch settings to a first-time creator on a Starknet launchpad. " +
  "Plain text, no markdown, max 90 words, concrete and neutral. Never predict price or returns.";

function fallback(prompt: string): string {
  const p = prompt.toLowerCase();
  if (p.includes("bonding curve") || p.includes("graduation at") || p.includes("starting price")) {
    return (
      "On a bonding curve the price is set by a formula, not an order book. Each buy moves the price up along the curve; each sell moves it back down, so early buyers pay less than later ones. A 1% fee is taken on every trade (0.5% to the platform, 0.5% to you). When the curve's reserve reaches the graduation threshold, trading on the curve closes and liquidity moves to a DEX. The contract enforces all of this on-chain."
    );
  }
  return (
    "Total supply is fixed at deploy — the token has no mint function, so no more can ever be created. Most of the supply is sold through the bonding curve, a portion is reserved to seed DEX liquidity at graduation, and your creator allocation is a small slice shown publicly on the token page. Larger creator allocations are visible in holder concentration and tend to make buyers more cautious."
  );
}

export async function POST(req: Request) {
  if (!rateLimit(clientIp(req))) {
    return NextResponse.json({ error: "Too many requests. Please slow down." }, { status: 429 });
  }
  let prompt = "";
  try {
    const body = (await req.json()) as { prompt?: unknown };
    prompt = String(body.prompt ?? "").trim().slice(0, 1200);
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!prompt) return NextResponse.json({ error: "Nothing to explain." }, { status: 400 });

  const text = await callClaude({ system: SYSTEM_PROMPT, messages: [{ role: "user", content: prompt }], maxTokens: 300 });
  return NextResponse.json({ text: (text ?? "").trim() || fallback(prompt) }, { headers: { "cache-control": "no-store" } });
}
