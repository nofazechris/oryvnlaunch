// Server-only helper for calling the Anthropic Messages API. Never import in client code.
// Returns the concatenated text, or null when no key is configured or the call fails —
// callers fall back to deterministic local output so the UI always works.

interface ClaudeMessage {
  role: "user" | "assistant";
  content: string;
}

export async function callClaude(opts: {
  system: string;
  messages: ClaudeMessage[];
  maxTokens?: number;
}): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const model = process.env.ANTHROPIC_MODEL || "claude-haiku-5-5";
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: opts.maxTokens ?? 500,
        system: opts.system,
        messages: opts.messages,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    return data.content?.map((c) => c.text ?? "").join("") ?? "";
  } catch {
    return null;
  }
}

/** Extract the first {...} JSON object from a model response. */
export function extractJson(text: string): unknown | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

// --- best-effort in-memory per-IP rate limiting (token bucket) ---
const BUCKETS = new Map<string, { tokens: number; ts: number }>();

export function rateLimit(ip: string, capacity = 12, perMinute = 12): boolean {
  const now = Date.now();
  const refillPerSec = perMinute / 60;
  const b = BUCKETS.get(ip) ?? { tokens: capacity, ts: now };
  b.tokens = Math.min(capacity, b.tokens + ((now - b.ts) / 1000) * refillPerSec);
  b.ts = now;
  if (b.tokens < 1) {
    BUCKETS.set(ip, b);
    return false;
  }
  b.tokens -= 1;
  BUCKETS.set(ip, b);
  return true;
}

export function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "local"
  );
}
