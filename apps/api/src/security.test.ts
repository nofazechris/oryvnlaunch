import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { createTestDb, type TestDb } from "@launchpad/db/testing";
import { createApp } from "./app.js";
import { cleanText } from "./sanitize.js";
import { RateLimiter, TtlCache } from "./security.js";

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");

let testDb: TestDb;
let app: NestFastifyApplication;
let small: NestFastifyApplication;
beforeAll(async () => {
  testDb = await createTestDb();
  app = await createApp(testDb.db);
  // A tiny allowance for the rate-limit test and a tiny image store for the storage-cap test.
  small = await createApp(testDb.db, { rateLimitPerMinute: 10, maxImageStorageBytes: 40 });
});
afterAll(async () => {
  await app.close();
  await small.close();
  await testDb.close();
});

describe("response headers", () => {
  it("tell the browser an answer is data, not a page, and must not be kept", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("DENY");
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
    expect(res.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("carry the same protections on errors", async () => {
    const res = await app.inject({ method: "GET", url: "/launches/not-an-address" });
    expect(res.statusCode).toBe(400);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });
});

describe("errors", () => {
  it("do not leak internals for an unknown route or a bad parameter", async () => {
    const missing = await app.inject({ method: "GET", url: "/nope" });
    expect(missing.statusCode).toBe(404);
    expect(missing.body).not.toMatch(/stack|node_modules|postgres|select /i);
    const bad = await app.inject({ method: "GET", url: "/launches/0x1;drop table launches" });
    expect(bad.statusCode).toBe(400);
    expect(bad.body).not.toMatch(/stack|node_modules|postgres|select /i);
  });

  it("refuse a long path parameter outright", async () => {
    const res = await app.inject({ method: "GET", url: `/images/${"a".repeat(500)}` });
    expect(res.statusCode).toBe(414);
  });
});

describe("rate limit", () => {
  it("stops an address after its allowance and says when to come back", async () => {
    let last = 0;
    let retry: unknown;
    for (let i = 0; i < 12; i++) {
      const res = await small.inject({ method: "GET", url: "/health" });
      last = res.statusCode;
      retry = res.headers["retry-after"];
    }
    expect(last).toBe(429);
    expect(retry).toBe("60");
  });

  it("cannot be dodged by sending a made-up X-Forwarded-For when no proxy is trusted", async () => {
    const res = await small.inject({ method: "GET", url: "/health", headers: { "x-forwarded-for": "9.9.9.9" } });
    expect(res.statusCode).toBe(429);
  });
});

describe("image storage", () => {
  it("stops accepting images once the ceiling is reached", async () => {
    const first = await small.inject({ method: "POST", url: "/images", headers: { "content-type": "image/png" }, payload: PNG });
    // the small app is rate limited by now, so use a fresh one with the same tiny store
    const fresh = await createApp(testDb.db, { maxImageStorageBytes: 20 });
    const big = Buffer.concat([PNG, Buffer.alloc(40)]);
    const res = await fresh.inject({ method: "POST", url: "/images", headers: { "content-type": "image/png" }, payload: big });
    expect(res.statusCode).toBe(507);
    await fresh.close();
    expect([201, 429, 507]).toContain(first.statusCode);
  });
});

describe("cleanText", () => {
  it("strips direction overrides, zero-width and control characters", () => {
    expect(cleanText("USDC‮tide", 64)).toBe("USDCtide");
    expect(cleanText("S​T‍R‎K", 16)).toBe("STRK");
    expect(cleanText("a\u0000b\nc", 64)).toBe("ab c");
  });
  it("caps the length and keeps ordinary text", () => {
    expect(cleanText("x".repeat(100), 16)).toHaveLength(16);
    expect(cleanText("猫の通貨 🚀", 64)).toBe("猫の通貨 🚀");
  });
});

describe("RateLimiter", () => {
  it("allows up to the limit in a window and starts over after it", () => {
    let t = 0;
    const l = new RateLimiter(3, 1000, () => t);
    expect([l.allow("a"), l.allow("a"), l.allow("a"), l.allow("a")]).toEqual([true, true, true, false]);
    expect(l.allow("b")).toBe(true);
    t = 1000;
    expect(l.allow("a")).toBe(true);
  });
});

describe("TtlCache", () => {
  it("shares one load among callers inside the window and reloads after it", async () => {
    let t = 0;
    let loads = 0;
    const c = new TtlCache<number>(1000, 10, () => t);
    const load = async () => ++loads;
    expect([await c.get("k", load), await c.get("k", load)]).toEqual([1, 1]);
    t = 1000;
    expect(await c.get("k", load)).toBe(2);
  });
});
