import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clientIp, fromThisSite, guardAi, rateLimit, readJson, resetLimits } from "./claude";

const req = (headers: Record<string, string> = {}, body = "{}") =>
  new Request("http://localhost:3000/api/ai/assistant", { method: "POST", headers: { host: "localhost:3000", ...headers }, body });

beforeEach(() => resetLimits());
afterEach(() => vi.unstubAllEnvs());

describe("fromThisSite", () => {
  it("accepts a request from a page of this site", () => {
    expect(fromThisSite(req({ origin: "http://localhost:3000", "sec-fetch-site": "same-origin" }))).toBe(true);
    expect(fromThisSite(req({ origin: "http://localhost:3000" }))).toBe(true);
  });
  it("refuses another site's page, a made-up origin and a request that says nothing about where it came from", () => {
    expect(fromThisSite(req({ origin: "https://evil.example", "sec-fetch-site": "cross-site" }))).toBe(false);
    expect(fromThisSite(req({ origin: "https://evil.example" }))).toBe(false);
    expect(fromThisSite(req({ origin: "null" }))).toBe(false);
    expect(fromThisSite(req({}))).toBe(false);
  });
  it("lets through origins the owner listed", () => {
    vi.stubEnv("AI_ALLOWED_ORIGINS", "https://app.example.com");
    expect(fromThisSite(req({ origin: "https://app.example.com" }))).toBe(true);
  });
});

describe("clientIp", () => {
  it("ignores x-forwarded-for unless a proxy is trusted, so the header cannot be used to dodge the limit", () => {
    expect(clientIp(req({ "x-forwarded-for": "1.2.3.4" }))).toBe("direct");
    vi.stubEnv("TRUST_PROXY", "1");
    // the proxy appends the real address last; whatever the caller wrote before it is not believed
    expect(clientIp(req({ "x-forwarded-for": "6.6.6.6, 1.2.3.4" }))).toBe("1.2.3.4");
  });
});

describe("rateLimit", () => {
  it("allows a burst, then refuses, then recovers over time", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 12; i++) expect(rateLimit("a", 12, 12, t0)).toBe(true);
    expect(rateLimit("a", 12, 12, t0)).toBe(false);
    expect(rateLimit("b", 12, 12, t0)).toBe(true); // another caller is unaffected
    expect(rateLimit("a", 12, 12, t0 + 6_000)).toBe(true); // 12 a minute refills one every 5 seconds
  });
});

describe("guardAi", () => {
  const ok = { origin: "http://localhost:3000", "sec-fetch-site": "same-origin" };

  it("lets a normal request through", () => {
    expect(guardAi(req(ok))).toBeNull();
  });
  it("refuses a request from elsewhere with 403", () => {
    expect(guardAi(req({ origin: "https://evil.example" }))?.status).toBe(403);
  });
  it("refuses a declared oversized body with 413", () => {
    expect(guardAi(req({ ...ok, "content-length": "999999" }))?.status).toBe(413);
  });
  it("stops one caller after their allowance with 429", () => {
    for (let i = 0; i < 12; i++) expect(guardAi(req(ok))).toBeNull();
    expect(guardAi(req(ok))?.status).toBe(429);
  });
  it("stops everyone together once the site-wide ceiling is reached", () => {
    vi.stubEnv("AI_GLOBAL_PER_HOUR", "3");
    vi.stubEnv("TRUST_PROXY", "1");
    const from = (ip: string) => req({ ...ok, "x-forwarded-for": ip });
    expect(guardAi(from("1.1.1.1"))).toBeNull();
    expect(guardAi(from("2.2.2.2"))).toBeNull();
    expect(guardAi(from("3.3.3.3"))).toBeNull();
    expect(guardAi(from("4.4.4.4"))?.status).toBe(429);
  });
});

describe("readJson", () => {
  it("parses a normal body and refuses an oversized one even if no length was declared", async () => {
    expect(await readJson(req({}, '{"a":1}'))).toEqual({ a: 1 });
    await expect(readJson(req({}, JSON.stringify({ x: "y".repeat(40_000) })))).rejects.toThrow();
  });
});
