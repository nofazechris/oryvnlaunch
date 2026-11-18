import { NextResponse } from "next/server";
import { aiConfigured } from "@/lib/ai/claude";

export const runtime = "nodejs";

/** Whether this server can reach a language model. Never reveals the key. */
export async function GET() {
  return NextResponse.json({ configured: aiConfigured() }, { headers: { "cache-control": "no-store" } });
}
