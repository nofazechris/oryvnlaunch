// Server-only: makes a picture from a description. Never import this in client code.
//
// Two sources, chosen by settings:
//
//   Stable Horde (the default, no key): a free community network of volunteer GPUs. Jobs are queued, so the
//     server hands back a job id and the page asks for the result a few seconds later. An optional free key
//     (STABLE_HORDE_API_KEY) moves a site up the queue.
//   Cloudflare Workers AI (optional): answers at once. Needs CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN.
//
//   AI_IMAGE_PROVIDER=horde | cloudflare | off     (off turns picture making off entirely)
//
// Whatever comes back is checked before it is handed on: it must really be a PNG, JPEG or WebP, and not huge.
// The creator's words leave this server for the image service, and the page says so.

import { cleanText } from "../safe";

type Env = Record<string, string | undefined>;

export type ImageProvider = { kind: "horde"; key: string } | { kind: "cloudflare"; accountId: string; token: string };

const HORDE = "https://stablehorde.net/api/v2";
const HORDE_ANONYMOUS_KEY = "0000000000";
const CF_MODEL = "@cf/black-forest-labs/flux-1-schnell";
const MAX_BYTES = 4 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function cloudflareConfig(env: Env = process.env): { accountId: string; token: string } | null {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim() ?? "";
  const token = env.CLOUDFLARE_API_TOKEN?.trim() ?? "";
  // The account id goes into a URL, so only the exact shape Cloudflare uses is accepted.
  return /^[0-9a-f]{32}$/i.test(accountId) && token ? { accountId, token } : null;
}

/** Which picture source this server uses, or null when picture making is off. */
export function imageProvider(env: Env = process.env): ImageProvider | null {
  const choice = (env.AI_IMAGE_PROVIDER ?? "").trim().toLowerCase();
  if (choice === "off") return null;
  const cf = cloudflareConfig(env);
  const horde: ImageProvider = { kind: "horde", key: env.STABLE_HORDE_API_KEY?.trim() || HORDE_ANONYMOUS_KEY };
  if (choice === "cloudflare") return cf ? { kind: "cloudflare", ...cf } : null;
  if (choice === "horde") return horde;
  return cf ? { kind: "cloudflare", ...cf } : horde;
}

export const imageConfigured = (): boolean => imageProvider() !== null;

const STYLE = "A flat, bold, simple vector-style square icon for a community token. One centered subject, soft gradient background, no text, no letters, no watermark, no real brand logos, no real people.";

/** The creator's few words, wrapped so the result is a clean square icon: no text, no brands, no people. */
export function composePrompt(idea: string): string {
  const subject = cleanText(idea, 200) || "an abstract friendly mascot";
  return `${subject}. ${STYLE}`;
}

/** The same, for Stable Horde, which takes what to avoid after a ### marker. */
export function hordePrompt(idea: string): string {
  const subject = cleanText(idea, 200) || "an abstract friendly mascot";
  return `${subject}, flat vector icon, bold simple shapes, one centered subject, soft gradient background ### text, letters, words, watermark, signature, blurry, photo, real person, brand logo`;
}

/** The kind of image these bytes are, judged by how they start, or null if they are not a picture we accept. */
export function sniffImage(bytes: Uint8Array): "image/png" | "image/jpeg" | "image/webp" | null {
  const at = (...b: number[]) => b.every((v, i) => bytes[i] === v);
  if (at(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (at(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (at(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "image/webp";
  return null;
}

/** Bytes (or base64 of them) turned into a checked picture, or null. */
function checked(bytes: Uint8Array): { mime: string; base64: string } | null {
  const mime = sniffImage(bytes);
  if (!mime || bytes.length === 0 || bytes.length > MAX_BYTES) return null;
  return { mime, base64: Buffer.from(bytes).toString("base64") };
}

export type ImageResult = { ok: true; mime: string; base64: string } | { ok: false; status: number; error: string };

// ---------------------------------------------------------------- Cloudflare (answers at once)

export async function generateImage(idea: string, env: Env = process.env): Promise<ImageResult> {
  const p = cloudflareConfig(env);
  if (!p) return { ok: false, status: 503, error: "Image generation is not set up on this server." };
  let res: Response;
  try {
    res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${p.accountId}/ai/run/${CF_MODEL}`, {
      method: "POST",
      signal: AbortSignal.timeout(Math.max(5_000, Number(env.AI_IMAGE_TIMEOUT_MS) || 45_000)),
      headers: { authorization: `Bearer ${p.token}`, "content-type": "application/json" },
      body: JSON.stringify({ prompt: composePrompt(idea), steps: 4 }),
    });
  } catch {
    return { ok: false, status: 502, error: "The image service did not answer in time. Try again." };
  }
  if (!res.ok) {
    // Say what a person can act on, and nothing from the response that could include account details.
    console.error(`[ai] image service answered HTTP ${res.status}`);
    if (res.status === 401 || res.status === 403) return { ok: false, status: 502, error: "The image service rejected this server's key." };
    if (res.status === 429) return { ok: false, status: 429, error: "The image service is busy or out of free allowance. Try again later." };
    return { ok: false, status: 502, error: "The image service could not make a picture just now." };
  }
  try {
    let bytes: Uint8Array;
    if ((res.headers.get("content-type") ?? "").startsWith("image/")) {
      bytes = new Uint8Array(await res.arrayBuffer());
    } else {
      const body = (await res.json()) as { result?: { image?: unknown }; image?: unknown };
      const b64 = body.result?.image ?? body.image;
      if (typeof b64 !== "string" || b64.length > MAX_BYTES * 2) throw new Error("no image");
      bytes = new Uint8Array(Buffer.from(b64, "base64"));
    }
    const pic = checked(bytes);
    if (!pic) throw new Error("not a usable image");
    return { ok: true, ...pic };
  } catch {
    return { ok: false, status: 502, error: "The image service sent something that is not a usable picture." };
  }
}

// ---------------------------------------------------------------- Stable Horde (queued: submit, then check)

const hordeHeaders = (key: string) => ({ apikey: key, "content-type": "application/json", "client-agent": "oryvnlaunch:0.1:anonymous" });
const hordeTimeout = (env: Env) => AbortSignal.timeout(Math.max(3_000, Number(env.AI_IMAGE_TIMEOUT_MS) || 20_000));

export type HordeSubmit = { ok: true; id: string } | { ok: false; status: number; error: string };

/** Put a picture in the queue. Returns the job to ask about, not the picture. */
export async function hordeSubmit(idea: string, env: Env = process.env): Promise<HordeSubmit> {
  const p = imageProvider(env);
  if (!p || p.kind !== "horde") return { ok: false, status: 503, error: "Image generation is not set up on this server." };
  let res: Response;
  try {
    res = await fetch(`${HORDE}/generate/async`, {
      method: "POST",
      signal: hordeTimeout(env),
      headers: hordeHeaders(p.key),
      body: JSON.stringify({
        prompt: hordePrompt(idea),
        params: { width: 512, height: 512, steps: 20, n: 1 },
        // Keep it clean, and ask for the picture itself back rather than a download link.
        nsfw: false,
        censor_nsfw: true,
        r2: false,
      }),
    });
  } catch {
    return { ok: false, status: 502, error: "The picture network did not answer. Try again in a moment." };
  }
  if (!res.ok) {
    console.error(`[ai] picture network answered HTTP ${res.status} to a new job`);
    if (res.status === 401 || res.status === 403) return { ok: false, status: 502, error: "The picture network rejected this server's key." };
    if (res.status === 429) return { ok: false, status: 429, error: "The picture network is busy. Try again in a minute." };
    if (res.status === 400) return { ok: false, status: 400, error: "The picture network would not take that description. Try different words." };
    return { ok: false, status: 502, error: "The picture network could not take the request just now." };
  }
  try {
    const body = (await res.json()) as { id?: unknown };
    if (typeof body.id !== "string" || !UUID.test(body.id)) throw new Error("no job");
    return { ok: true, id: body.id };
  } catch {
    return { ok: false, status: 502, error: "The picture network sent an answer we could not read." };
  }
}

export type HordeStep =
  | { state: "queued" | "working"; position: number | null; waitSeconds: number | null }
  | { state: "done"; mime: string; base64: string }
  | { state: "failed"; error: string };

export const isJobId = (id: unknown): id is string => typeof id === "string" && UUID.test(id);

/** Where a queued picture is: still waiting, being made, finished, or failed. */
export async function hordeCheck(id: string, env: Env = process.env): Promise<HordeStep> {
  const p = imageProvider(env);
  if (!p || p.kind !== "horde") return { state: "failed", error: "Image generation is not set up on this server." };
  if (!isJobId(id)) return { state: "failed", error: "That picture request is not valid." };
  try {
    const res = await fetch(`${HORDE}/generate/check/${id}`, { signal: hordeTimeout(env), headers: hordeHeaders(p.key) });
    if (res.status === 404) return { state: "failed", error: "That picture request expired. Make it again." };
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const s = (await res.json()) as { done?: boolean; faulted?: boolean; is_possible?: boolean; processing?: number; queue_position?: number; wait_time?: number };
    if (s.faulted) return { state: "failed", error: "The picture network could not finish that picture. Try again." };
    if (s.is_possible === false) return { state: "failed", error: "No picture worker can take this right now. Try again later." };
    if (!s.done) {
      return {
        state: (s.processing ?? 0) > 0 ? "working" : "queued",
        position: typeof s.queue_position === "number" ? s.queue_position : null,
        waitSeconds: typeof s.wait_time === "number" ? s.wait_time : null,
      };
    }
    const res2 = await fetch(`${HORDE}/generate/status/${id}`, { signal: hordeTimeout(env), headers: hordeHeaders(p.key) });
    if (!res2.ok) throw new Error(`HTTP ${res2.status}`);
    const done = (await res2.json()) as { generations?: { img?: unknown; censored?: boolean }[] };
    const g = done.generations?.[0];
    if (!g || g.censored || typeof g.img !== "string" || g.img.length > MAX_BYTES * 2) {
      return { state: "failed", error: "The picture network blocked that picture. Try different words." };
    }
    const pic = checked(new Uint8Array(Buffer.from(g.img, "base64")));
    if (!pic) return { state: "failed", error: "The picture network sent something that is not a usable picture." };
    return { state: "done", ...pic };
  } catch (e) {
    console.error("[ai] picture network check failed:", e instanceof Error ? e.name : "error");
    // A hiccup while checking is not a failed picture: ask again.
    return { state: "queued", position: null, waitSeconds: null };
  }
}
