import { NextResponse } from "next/server";
import { callModel, guardAi, readJson } from "@/lib/ai/claude";

export const runtime = "nodejs";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

function buildSystem(context: unknown): string {
  return (
    "You are the in-app assistant for a Starknet token launchpad. " +
    "Answer only from this indexed data and platform rules: " +
    JSON.stringify(context ?? {}) +
    ". If data is missing say so. You cannot trade or move funds. " +
    "Never predict prices or give buy/sell advice. Plain text, max 90 words."
  );
}

function fallback(context: unknown, question: string): string {
  const ctx = (context ?? {}) as {
    token?: { name?: string; ticker?: string; bondingPct?: number; quoteAsset?: string };
    bonding?: { progressPct?: number; graduated?: boolean };
    platform?: { tradeFee?: string; deployFee?: string; creatorCap?: string };
  };
  const q = question.toLowerCase();
  if (ctx.token) {
    const t = ctx.token;
    const pct = ctx.bonding?.progressPct ?? t.bondingPct;
    const state = ctx.bonding?.graduated ? "it has graduated" : `its curve is ${pct ?? "?"}% of the way to graduation`;
    return `Here's what the indexed data shows for ${t.name ?? "this token"} ($${t.ticker ?? "?"}): ${state}${t.quoteAsset ? `, and it trades against ${t.quoteAsset}` : ""}. I answer from on-chain and platform data only. I can't predict price or give buy/sell advice, and I can't trade or move funds.`;
  }
  const pf = ctx.platform;
  if (q.includes("fee")) {
    return `Fees: deploying a token costs ${pf?.deployFee ?? "a small fee"}, and each bonding-curve trade has a ${pf?.tradeFee ?? "1%"} fee. The creator allocation is capped at ${pf?.creatorCap ?? "5%"}. I answer from platform data only and can't trade or move funds.`;
  }
  if (q.includes("graduat")) {
    return "Graduation: when a token's curve raises its graduation amount, the token is marked graduated. It is a milestone, not a lock: buying and selling on the curve continue afterwards, and there is no DEX pool yet. I can't predict when any specific token graduates.";
  }
  return "I answer from indexed platform and on-chain data. I can't trade, sign, move funds, or predict prices. Ask me about trending tokens, how fees or graduation work, or a token's bonding progress and holders.";
}

export async function POST(req: Request) {
  const blocked = guardAi(req);
  if (blocked) return blocked;
  let messages: ChatMessage[] = [];
  let context: unknown = {};
  try {
    const body = (await readJson(req)) as { messages?: unknown; context?: unknown };
    context = body.context ?? {};
    messages = (Array.isArray(body.messages) ? body.messages : [])
      .slice(-10)
      .map((m) => {
        const o = (m ?? {}) as Record<string, unknown>;
        const role = o.role === "assistant" ? "assistant" : "user";
        return { role, content: String(o.content ?? "").slice(0, 1000) } as ChatMessage;
      })
      .filter((m) => m.content);
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!messages.length) return NextResponse.json({ error: "Ask a question." }, { status: 400 });

  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const text = await callModel({ system: buildSystem(context), messages, maxTokens: 350 });
  return NextResponse.json({ text: (text ?? "").trim() || fallback(context, lastUser) }, { headers: { "cache-control": "no-store" } });
}
