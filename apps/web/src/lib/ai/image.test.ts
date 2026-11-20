import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cloudflareConfig, composePrompt, generateImage, hordeCheck, hordePrompt, hordeSubmit, imageProvider, isJobId, sniffImage } from "./image";

const ACCOUNT = "a".repeat(32);
const CF = { CLOUDFLARE_ACCOUNT_ID: ACCOUNT, CLOUDFLARE_API_TOKEN: "tok-secret" };
const JOB = "84e45d03-d064-4753-88fc-23c9e6d8f621";
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const WEBP = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 1, 2]);
const b64 = (b: Uint8Array) => Buffer.from(b).toString("base64");
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
const status = (code: number) => new Response("{}", { status: code });

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => undefined));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("which picture source is used", () => {
  it("uses the free community network when nothing is set, with the anonymous key", () => {
    expect(imageProvider({})).toEqual({ kind: "horde", key: "0000000000" });
  });
  it("uses a Stable Horde key when one is given", () => {
    expect(imageProvider({ STABLE_HORDE_API_KEY: "my-key" })).toEqual({ kind: "horde", key: "my-key" });
  });
  it("prefers Cloudflare when it is fully set up", () => {
    expect(imageProvider(CF)).toEqual({ kind: "cloudflare", accountId: ACCOUNT, token: "tok-secret" });
  });
  it("can be turned off, or pinned to one source", () => {
    expect(imageProvider({ ...CF, AI_IMAGE_PROVIDER: "off" })).toBeNull();
    expect(imageProvider({ ...CF, AI_IMAGE_PROVIDER: "horde" })).toMatchObject({ kind: "horde" });
    expect(imageProvider({ AI_IMAGE_PROVIDER: "cloudflare" })).toBeNull(); // asked for it, but it is not set up
  });
  it("only accepts a Cloudflare account id in the exact shape Cloudflare uses, because it goes into a URL", () => {
    for (const bad of ["../evil", "a".repeat(31), `${ACCOUNT}/x`]) expect(cloudflareConfig({ ...CF, CLOUDFLARE_ACCOUNT_ID: bad })).toBeNull();
    // a bad Cloudflare setting falls back to the free network instead of breaking pictures
    expect(imageProvider({ ...CF, CLOUDFLARE_ACCOUNT_ID: "nope" })).toMatchObject({ kind: "horde" });
  });
});

describe("prompts", () => {
  it("asks for a clean icon with no text, brands or people, and keeps the creator's words", () => {
    const p = composePrompt("a sleepy cat in a space helmet");
    expect(p).toContain("a sleepy cat in a space helmet");
    for (const must of ["no text", "no watermark", "no real brand logos", "no real people", "icon"]) expect(p).toContain(must);
  });
  it("puts what to avoid after the ### marker for the community network", () => {
    const p = hordePrompt("a sleepy cat in a space helmet");
    const [want, avoid] = p.split(" ### ");
    expect(want).toContain("a sleepy cat in a space helmet");
    expect(want).toContain("flat vector icon");
    for (const word of ["text", "watermark", "real person", "brand logo"]) expect(avoid).toContain(word);
  });
  it("cleans and shortens what it is given, and has a default", () => {
    expect(composePrompt("x".repeat(500)).length).toBeLessThan(500);
    expect(hordePrompt("")).toContain("abstract friendly mascot");
  });
});

describe("sniffImage and isJobId", () => {
  it("knows pictures by how they start, and nothing else", () => {
    expect(sniffImage(PNG)).toBe("image/png");
    expect(sniffImage(JPEG)).toBe("image/jpeg");
    expect(sniffImage(WEBP)).toBe("image/webp");
    expect(sniffImage(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
    expect(sniffImage(new TextEncoder().encode("<html>"))).toBeNull();
  });
  it("accepts only a real job id, since it goes into a URL", () => {
    expect(isJobId(JOB)).toBe(true);
    for (const bad of ["", "abc", `${JOB}/../x`, `${JOB}?a=b`, "../../etc", 5, null, undefined]) expect(isJobId(bad), String(bad)).toBe(false);
  });
});

describe("hordeSubmit", () => {
  it("queues a clean, picture-sized job and returns its id", async () => {
    const f = vi.fn().mockResolvedValue(ok({ id: JOB, kudos: 6 }));
    vi.stubGlobal("fetch", f);
    expect(await hordeSubmit("a friendly fox", {})).toEqual({ ok: true, id: JOB });
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://stablehorde.net/api/v2/generate/async");
    expect((init.headers as Record<string, string>).apikey).toBe("0000000000");
    expect((init.headers as Record<string, string>)["client-agent"]).toContain("oryvnlaunch");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ nsfw: false, censor_nsfw: true, r2: false, params: { width: 512, height: 512, n: 1 } });
    expect(body.prompt).toContain("a friendly fox");
  });
  it("refuses to run when the source is not the community network", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    expect(await hordeSubmit("fox", { AI_IMAGE_PROVIDER: "off" })).toMatchObject({ ok: false, status: 503 });
    expect(await hordeSubmit("fox", CF)).toMatchObject({ ok: false });
    expect(f).not.toHaveBeenCalled();
  });
  it("explains refusals, a busy network and a timeout in plain words", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(status(400)));
    expect(await hordeSubmit("fox", {})).toMatchObject({ ok: false, status: 400, error: expect.stringContaining("different words") });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(status(429)));
    expect(await hordeSubmit("fox", {})).toMatchObject({ ok: false, status: 429 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(status(401)));
    expect(await hordeSubmit("fox", {})).toMatchObject({ ok: false, error: expect.stringContaining("rejected") });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    expect(await hordeSubmit("fox", {})).toMatchObject({ ok: false, status: 502 });
  });
  it("rejects an answer with no usable job id", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok({ id: "../../evil" })));
    expect(await hordeSubmit("fox", {})).toMatchObject({ ok: false });
  });
});

describe("hordeCheck", () => {
  const queue = (over: Record<string, unknown>) => ok({ done: false, faulted: false, is_possible: true, processing: 0, queue_position: 3, wait_time: 12, ...over });

  it("reports the queue position and wait while the picture is not ready", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(queue({})));
    expect(await hordeCheck(JOB, {})).toEqual({ state: "queued", position: 3, waitSeconds: 12 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(queue({ processing: 1, queue_position: 0 })));
    expect(await hordeCheck(JOB, {})).toMatchObject({ state: "working" });
  });

  it("returns the finished picture, checked", async () => {
    const f = vi.fn().mockResolvedValueOnce(queue({ done: true })).mockResolvedValueOnce(ok({ generations: [{ img: b64(WEBP), censored: false }] }));
    vi.stubGlobal("fetch", f);
    expect(await hordeCheck(JOB, {})).toEqual({ state: "done", mime: "image/webp", base64: b64(WEBP) });
    expect((f.mock.calls[1] as [string])[0]).toBe(`https://stablehorde.net/api/v2/generate/status/${JOB}`);
  });

  it("fails clearly for a censored picture, a faulted job, or an impossible one", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(queue({ done: true })).mockResolvedValueOnce(ok({ generations: [{ img: b64(WEBP), censored: true }] })));
    expect(await hordeCheck(JOB, {})).toMatchObject({ state: "failed", error: expect.stringContaining("blocked") });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(queue({ faulted: true })));
    expect(await hordeCheck(JOB, {})).toMatchObject({ state: "failed" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(queue({ is_possible: false })));
    expect(await hordeCheck(JOB, {})).toMatchObject({ state: "failed" });
  });

  it("refuses a result that is not a picture, such as an SVG", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(queue({ done: true })).mockResolvedValueOnce(ok({ generations: [{ img: b64(new TextEncoder().encode("<svg onload=alert(1)></svg>")) }] })));
    expect(await hordeCheck(JOB, {})).toMatchObject({ state: "failed", error: expect.stringContaining("not a usable picture") });
  });

  it("calls nothing for an invalid job id", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    expect(await hordeCheck("../../x", {})).toMatchObject({ state: "failed" });
    expect(f).not.toHaveBeenCalled();
  });

  it("treats a hiccup while checking as 'still waiting', not as a failed picture", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    expect(await hordeCheck(JOB, {})).toMatchObject({ state: "queued" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(status(502)));
    expect(await hordeCheck(JOB, {})).toMatchObject({ state: "queued" });
  });

  it("says an unknown or expired job is gone", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(status(404)));
    expect(await hordeCheck(JOB, {})).toMatchObject({ state: "failed", error: expect.stringContaining("expired") });
  });
});

describe("generateImage (Cloudflare)", () => {
  const cfJson = (b: Uint8Array) => ok({ result: { image: b64(b) }, success: true });

  it("says it is not set up without Cloudflare settings, and calls nothing", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    expect(await generateImage("cat", {})).toMatchObject({ ok: false, status: 503 });
    expect(f).not.toHaveBeenCalled();
  });

  it("asks FLUX with the key and returns a checked picture", async () => {
    const f = vi.fn().mockResolvedValue(cfJson(PNG));
    vi.stubGlobal("fetch", f);
    expect(await generateImage("a friendly fox", CF)).toEqual({ ok: true, mime: "image/png", base64: b64(PNG) });
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/ai/run/@cf/black-forest-labs/flux-1-schnell`);
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer tok-secret");
  });

  it("accepts a model that answers with the picture itself, and refuses things that are not pictures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JPEG, { status: 200, headers: { "content-type": "image/jpeg" } })));
    expect(await generateImage("cat", CF)).toMatchObject({ ok: true, mime: "image/jpeg" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(cfJson(new TextEncoder().encode("<svg onload=alert(1)></svg>"))));
    expect(await generateImage("cat", CF)).toMatchObject({ ok: false, status: 502 });
  });

  it("never puts the token or account id in an error or a log", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ errors: [{ message: `token tok-secret for ${ACCOUNT}` }] }), { status: 500 })));
    const r = await generateImage("cat", CF);
    const seen = JSON.stringify([r, (console.error as ReturnType<typeof vi.fn>).mock.calls]);
    expect(seen).not.toContain("tok-secret");
    expect(seen).not.toContain(ACCOUNT);
  });
});
