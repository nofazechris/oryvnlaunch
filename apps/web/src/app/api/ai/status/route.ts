import { NextResponse } from "next/server";
import { aiConfigured } from "@/lib/ai/claude";
import { imageProvider } from "@/lib/ai/image";

export const runtime = "nodejs";

/** Whether this server can reach a language model, and whether it can also make pictures. Never reveals a key. */
export async function GET() {
  const image = imageProvider();
  return NextResponse.json({ configured: aiConfigured(), image: image !== null, imageSource: image?.kind ?? null }, { headers: { "cache-control": "no-store" } });
}
