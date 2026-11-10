import { NextResponse } from "next/server";
import { callClaude, clientIp, extractJson, rateLimit } from "@/lib/ai/claude";

export const runtime = "nodejs";

interface Idea {
  name: string;
  ticker: string;
  line: string;
}
interface AssistantResult {
  ideas: Idea[];
  description: string;
  branding: string[];
  post: string;
}

const SYSTEM_PROMPT =
  "You help creators prepare a token for a Starknet bonding-curve launchpad. " +
  'Reply with ONLY minified JSON: {"ideas":[{"name":"","ticker":"","line":""}],"description":"","branding":["","",""],"post":""}. ' +
  "Exactly 3 ideas; ticker 3-6 uppercase letters; line max 10 words. " +
  "description: max 45 words, factual and community-focused. " +
  "branding: 3 short visual directions (mascot, palette, tone). " +
  "post: a launch post under 220 chars, no hashtag spam. " +
  "NEVER mention price, gains, returns, moon, or future value.";

function sanitizeTicker(raw: unknown, fallback: string): string {
  const t = String(raw ?? "").toUpperCase().replace(/[^A-Z]/g, "");
  if (t.length >= 3 && t.length <= 6) return t;
  if (t.length > 6) return t.slice(0, 6);
  return fallback;
}
function clampWords(raw: unknown, max: number): string {
  return String(raw ?? "").trim().split(/\s+/).slice(0, max).join(" ");
}

function validate(parsed: unknown): AssistantResult | null {
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  if (!Array.isArray(obj.ideas)) return null;
  const ideas: Idea[] = obj.ideas.slice(0, 3).map((raw, i) => {
    const o = (raw ?? {}) as Record<string, unknown>;
    const name = String(o.name ?? "").trim().slice(0, 40) || `Idea ${i + 1}`;
    return {
      name,
      ticker: sanitizeTicker(o.ticker, name.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4) || "TKN"),
      line: clampWords(o.line, 12),
    };
  });
  if (ideas.length < 1) return null;
  while (ideas.length < 3) ideas.push({ ...ideas[ideas.length - 1]! });
  const branding = Array.isArray(obj.branding)
    ? obj.branding.slice(0, 3).map((b) => String(b).trim().slice(0, 120)).filter(Boolean)
    : [];
  return {
    ideas,
    description: clampWords(obj.description, 50),
    branding,
    post: String(obj.post ?? "").trim().slice(0, 240),
  };
}

function fallback(idea: string): AssistantResult {
  const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  const words = idea.replace(/[^a-zA-Z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2);
  const a = words[0] ? cap(words[0]) : "Starknet";
  const b = words[1] ? cap(words[1]) : "Collective";
  const c = words[2] ? cap(words[2]) : "Club";
  const tick = (s: string) => (s.toUpperCase().replace(/[^A-Z]/g, "") + "TKN").slice(0, 4);
  const theme = words.slice(0, 4).join(" ") || "building on Starknet";
  return {
    ideas: [
      { name: `${a} ${b}`, ticker: tick(a), line: "Built from the words in your idea." },
      { name: `${b} ${c}`, ticker: tick(b), line: "A community handle for the same theme." },
      { name: `${a} ${c}`, ticker: tick(c), line: "A shorter, punchier variation to try." },
    ],
    description: clampWords(
      `A community token themed around ${theme} on Starknet, made for people who want to rally around the idea together.`,
      50
    ),
    branding: [
      `Mascot: a friendly character that nods to "${a}".`,
      "Palette: one bold accent on a dark base, high contrast.",
      "Tone: warm, plain-spoken and community-first.",
    ],
    post: `Introducing ${a} ${b} — a community token on Starknet for everyone into ${theme}. Launching on a bonding curve. Come say hi and help shape it.`,
  };
}

export async function POST(req: Request) {
  if (!rateLimit(clientIp(req))) {
    return NextResponse.json({ error: "Too many requests. Please slow down." }, { status: 429 });
  }
  let idea = "";
  try {
    const body = (await req.json()) as { idea?: unknown };
    idea = String(body.idea ?? "").trim().slice(0, 400);
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!idea) {
    return NextResponse.json({ error: "Describe your token idea." }, { status: 400 });
  }

  const text = await callClaude({ system: SYSTEM_PROMPT, messages: [{ role: "user", content: idea }], maxTokens: 700 });
  const result = (text ? validate(extractJson(text)) : null) ?? fallback(idea);
  return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
}
