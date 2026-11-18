import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { createTestDb, type TestDb } from "@launchpad/db/testing";
import { createApp } from "./app.js";
import { type FetchLike, PriceService } from "./prices.js";

const ok = (usd: unknown): FetchLike => async () => ({ ok: true, json: async () => ({ starknet: { usd } }) });
const FRESH = 60_000;
const MAX = 15 * 60_000;

function service(fetchImpl: FetchLike, clock: { t: number }) {
  return new PriceService(fetchImpl, () => clock.t, FRESH, MAX, "http://price.test");
}

describe("PriceService", () => {
  it("returns the quote and caches it, asking the source once per minute at most", async () => {
    let calls = 0;
    const clock = { t: 1_000_000 };
    const s = service(async () => (calls++, { ok: true, json: async () => ({ starknet: { usd: 0.0343 } }) }), clock);
    expect(await s.strk()).toMatchObject({ usd: 0.0343, stale: false });
    clock.t += 30_000;
    await s.strk();
    expect(calls).toBe(1);
    clock.t += 31_000;
    await s.strk();
    expect(calls).toBe(2);
  });

  it("shares one request between callers that arrive together", async () => {
    let calls = 0;
    const s = service(async () => (calls++, { ok: true, json: async () => ({ starknet: { usd: 0.05 } }) }), { t: 5 });
    await Promise.all([s.strk(), s.strk(), s.strk(), s.strk()]);
    expect(calls).toBe(1);
  });

  it("keeps serving the last good quote, marked stale, when the source goes down", async () => {
    const clock = { t: 1_000_000 };
    let up = true;
    const s = service(async () => {
      if (!up) throw new Error("down");
      return { ok: true, json: async () => ({ starknet: { usd: 0.04 } }) };
    }, clock);
    await s.strk();
    up = false;
    clock.t += FRESH + 1;
    expect(await s.strk()).toMatchObject({ usd: 0.04, stale: true });
  });

  it("says it does not know once the last good quote is too old, instead of serving an old number", async () => {
    const clock = { t: 1_000_000 };
    let up = true;
    const s = service(async () => {
      if (!up) throw new Error("down");
      return { ok: true, json: async () => ({ starknet: { usd: 0.04 } }) };
    }, clock);
    await s.strk();
    up = false;
    clock.t += MAX + 1;
    expect(await s.strk()).toBeNull();
  });

  it("is null when the source never answered", async () => {
    expect(await service(async () => { throw new Error("down"); }, { t: 1 }).strk()).toBeNull();
    expect(await service(async () => ({ ok: false, json: async () => ({}) }), { t: 1 }).strk()).toBeNull();
  });

  it("refuses answers that are not a believable price", async () => {
    for (const bad of [0, -1, Number.NaN, Infinity, 5_000, "0.03", null, undefined, {}]) {
      expect(await service(ok(bad), { t: 1 }).strk(), String(bad)).toBeNull();
    }
    expect(await service(async () => ({ ok: true, json: async () => ({}) }), { t: 1 }).strk()).toBeNull();
  });

  it("does not let a bad answer replace a good quote", async () => {
    const clock = { t: 1_000_000 };
    let answer: unknown = 0.04;
    const s = service(async () => ({ ok: true, json: async () => ({ starknet: { usd: answer } }) }), clock);
    await s.strk();
    answer = -5;
    clock.t += FRESH + 1;
    expect(await s.strk()).toMatchObject({ usd: 0.04, stale: true });
  });
});

describe("GET /prices", () => {
  let testDb: TestDb;
  let app: NestFastifyApplication;
  beforeAll(async () => {
    testDb = await createTestDb();
    app = await createApp(testDb.db, { priceFetch: ok(0.0343) });
  });
  afterAll(async () => {
    await app.close();
    await testDb.close();
  });

  it("gives STRK in dollars and treats USDC as a dollar", async () => {
    const r = await app.inject({ method: "GET", url: "/prices" });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.STRK).toMatchObject({ usd: 0.0343, stale: false });
    expect(body.USDC).toEqual({ usd: 1, pegged: true });
  });
});

describe("GET /prices when the source is down", () => {
  it("answers with STRK null rather than failing", async () => {
    const testDb = await createTestDb();
    const app = await createApp(testDb.db, { priceFetch: async () => { throw new Error("down"); } });
    const r = await app.inject({ method: "GET", url: "/prices" });
    expect(r.statusCode).toBe(200);
    expect(r.json().STRK).toBeNull();
    await app.close();
    await testDb.close();
  });
});
