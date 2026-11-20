// Shared helpers for the AI routes: reading a model's JSON answer, and the guard that sits in front of every route.
// Talking to the model itself lives in ./model.ts.

export { aiConfigured, callModel } from "./model";

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

// --- guard in front of every AI route ---
//
// These routes spend real money (every call is billed by Anthropic) and are open to anyone who can reach the
// site, so each one is checked before it does any work:
//   1. it must come from this site, not another page's script or a command line  (origin check)
//   2. the body is size-capped before it is parsed                                (body cap)
//   3. each caller gets a small allowance, and the whole site gets a ceiling      (per-IP and global limits)
// The caller's address is only taken from `x-forwarded-for` when TRUST_PROXY is set, because otherwise anyone can
// send that header themselves and get a fresh allowance on every request.

const MAX_BODY_BYTES = 32_768;
const MAX_TRACKED_CALLERS = 5_000;
const BUCKETS = new Map<string, { tokens: number; ts: number }>();
const GLOBAL = { tokens: 0, ts: 0, init: false };

function take(b: { tokens: number; ts: number }, capacity: number, perMinute: number, now: number): boolean {
  b.tokens = Math.min(capacity, b.tokens + ((now - b.ts) / 60_000) * perMinute);
  b.ts = now;
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  return true;
}

export function rateLimit(key: string, capacity = 12, perMinute = 12, now = Date.now()): boolean {
  let b = BUCKETS.get(key);
  if (!b) {
    if (BUCKETS.size >= MAX_TRACKED_CALLERS) {
      // Drop the oldest entries so a flood of made-up addresses cannot grow memory without limit.
      for (const k of [...BUCKETS.keys()].slice(0, MAX_TRACKED_CALLERS / 10)) BUCKETS.delete(k);
    }
    b = { tokens: capacity, ts: now };
    BUCKETS.set(key, b);
  }
  return take(b, capacity, perMinute, now);
}

/** A ceiling on all AI calls from everyone together, so no number of callers can run up the bill. */
export function globalLimit(now = Date.now()): boolean {
  const perHour = Math.max(1, Number(process.env.AI_GLOBAL_PER_HOUR) || 600);
  if (!GLOBAL.init) {
    GLOBAL.init = true;
    GLOBAL.tokens = perHour;
    GLOBAL.ts = now;
  }
  return take(GLOBAL, perHour, perHour / 60, now);
}

export function resetLimits(): void {
  BUCKETS.clear();
  GLOBAL.init = false;
}

/** The caller's address, or a single shared key when no trusted proxy tells us a real one. */
export function clientIp(req: Request): string {
  if (process.env.TRUST_PROXY !== "1") return "direct";
  const hops = (req.headers.get("x-forwarded-for") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  // The entry our own proxy appended is the last one; anything before it was written by the caller.
  return hops[hops.length - 1] || req.headers.get("x-real-ip") || "direct";
}

/** True when the request comes from a page of this site (or an origin listed in AI_ALLOWED_ORIGINS). */
export function fromThisSite(req: Request): boolean {
  const fetchSite = req.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "same-site" && fetchSite !== "none") return false;
  const origin = req.headers.get("origin");
  if (!origin) return fetchSite === "same-origin" || fetchSite === "same-site";
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }
  const allowed = (process.env.AI_ALLOWED_ORIGINS ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  if (allowed.includes(origin)) return true;
  return host === (req.headers.get("host") ?? "");
}

const refuse = (error: string, status: number) =>
  new Response(JSON.stringify({ error }), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

/** Returns a response to send back if the request must be refused, or null if it may go on. */
export function guardAi(req: Request): Response | null {
  if (!fromThisSite(req)) return refuse("Not allowed.", 403);
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return refuse("Request too large.", 413);
  if (!rateLimit(clientIp(req))) return refuse("Too many requests. Please slow down.", 429);
  if (!globalLimit()) return refuse("The assistant is busy. Please try again later.", 429);
  return null;
}

/** Reads a JSON body, refusing anything over the size cap even when the length was not declared. */
export async function readJson(req: Request): Promise<unknown> {
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) throw new Error("body too large");
  return JSON.parse(text);
}
