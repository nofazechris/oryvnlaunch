import { createHash } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { type Db, images, launches } from "@launchpad/db";
import { createTestDb, type TestDb } from "@launchpad/db/testing";
import { createApp } from "./app.js";
import { MAX_IMAGE_BYTES, UploadLimiter, sniffImage } from "./images.js";

let testDb: TestDb;
let db: Db;
let app: NestFastifyApplication;
beforeAll(async () => {
  testDb = await createTestDb();
  db = testDb.db;
  app = await createApp(db, { corsOrigins: ["https://app.example"] });
});
afterAll(async () => {
  await app.close();
  await testDb.close();
});
beforeEach(async () => {
  await db.delete(images);
  await db.delete(launches);
});

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("rest of a pretend png")]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("jpeg body")]);
const GIF = Buffer.from("GIF89a-body");
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.from([1, 2, 3, 4]), Buffer.from("WEBPVP8 ")]);

const upload = (body: Buffer | string, type = "image/png", ip = "10.0.0.1") =>
  app.inject({ method: "POST", url: "/images", headers: { "content-type": type }, payload: body, remoteAddress: ip });
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

describe("sniffImage", () => {
  it("recognises the four formats by their first bytes", () => {
    expect(sniffImage(PNG)).toBe("image/png");
    expect(sniffImage(JPG)).toBe("image/jpeg");
    expect(sniffImage(GIF)).toBe("image/gif");
    expect(sniffImage(WEBP)).toBe("image/webp");
  });
  it("refuses everything else, including SVG and HTML", () => {
    expect(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(sniffImage(Buffer.from("<html><script>alert(1)</script>"))).toBeNull();
    expect(sniffImage(Buffer.from("RIFFxxxxWAVEfmt "))).toBeNull();
    expect(sniffImage(Buffer.alloc(0))).toBeNull();
  });
});

describe("POST /images", () => {
  it("stores an image and answers with the hash of its bytes", async () => {
    const r = await upload(PNG);
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({ hash: sha(PNG), uri: `sha256:${sha(PNG)}`, path: `/images/${sha(PNG)}`, mime: "image/png", size: PNG.length });
  });

  it("stores the same picture once, however many times it is uploaded", async () => {
    await upload(PNG);
    await upload(PNG);
    expect(await db.select().from(images)).toHaveLength(1);
  });

  it("refuses a file whose bytes are not an image even if it claims to be one", async () => {
    const r = await upload(Buffer.from("<html><script>alert(1)</script></html>"), "image/png");
    expect(r.statusCode).toBe(400);
    expect(await db.select().from(images)).toHaveLength(0);
  });

  it("refuses types it does not accept, such as SVG and JSON", async () => {
    expect((await upload(Buffer.from("<svg/>"), "image/svg+xml")).statusCode).toBe(415);
    expect((await upload("{}", "application/json")).statusCode).toBe(400);
    expect(await db.select().from(images)).toHaveLength(0);
  });

  it("refuses an empty upload", async () => {
    expect((await upload(Buffer.alloc(0))).statusCode).toBe(400);
  });

  it("refuses an image over the size limit", async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(MAX_IMAGE_BYTES)]);
    const r = await upload(big);
    expect(r.statusCode).toBe(413);
    expect(await db.select().from(images)).toHaveLength(0);
  });

  it("accepts an image exactly at the limit", async () => {
    const edge = Buffer.concat([PNG, Buffer.alloc(MAX_IMAGE_BYTES - PNG.length)]);
    expect((await upload(edge)).statusCode).toBe(201);
  });

  it("limits uploads per address, and another address is unaffected", async () => {
    for (let i = 0; i < 20; i++) expect((await upload(Buffer.concat([PNG, Buffer.from(String(i))]), "image/png", "10.0.0.9")).statusCode).toBe(201);
    expect((await upload(PNG, "image/png", "10.0.0.9")).statusCode).toBe(429);
    expect((await upload(PNG, "image/png", "10.0.0.10")).statusCode).toBe(201);
  });
});

describe("GET /images/:hash", () => {
  it("serves the exact bytes with a fixed type and locked-down headers", async () => {
    const { hash } = (await upload(JPG, "image/jpeg")).json();
    const r = await app.inject({ method: "GET", url: `/images/${hash}` });
    expect(r.statusCode).toBe(200);
    expect(Buffer.compare(r.rawPayload, JPG)).toBe(0);
    expect(r.headers["content-type"]).toBe("image/jpeg");
    expect(r.headers["x-content-type-options"]).toBe("nosniff");
    expect(r.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(r.headers["cross-origin-resource-policy"]).toBe("cross-origin");
    expect(r.headers["cache-control"]).toContain("immutable");
  });

  it("404s for an unknown hash and for anything that is not a hash", async () => {
    expect((await app.inject({ method: "GET", url: `/images/${"0".repeat(64)}` })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: "/images/../etc/passwd" })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: "/images/ABC" })).statusCode).toBe(404);
  });

  it("allows the configured origin to upload cross-origin, and no other", async () => {
    const ok = await app.inject({ method: "OPTIONS", url: "/images", headers: { origin: "https://app.example", "access-control-request-method": "POST", "access-control-request-headers": "content-type" } });
    expect(ok.headers["access-control-allow-origin"]).toBe("https://app.example");
    expect(String(ok.headers["access-control-allow-methods"])).toContain("POST");
    const no = await app.inject({ method: "OPTIONS", url: "/images", headers: { origin: "https://evil.example", "access-control-request-method": "POST" } });
    expect(no.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("UploadLimiter", () => {
  it("opens a fresh allowance when the window passes", () => {
    let now = 0;
    const limiter = new UploadLimiter(2, 1000, () => now);
    expect([limiter.allow("a"), limiter.allow("a"), limiter.allow("a")]).toEqual([true, true, false]);
    now = 1000;
    expect(limiter.allow("a")).toBe(true);
  });
});
