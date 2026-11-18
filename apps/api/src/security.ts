// What every response and every caller is subject to, whatever the route.
//
// The API only serves JSON and token images, so the browser is told never to treat any answer as a page
// (nosniff, no framing, no scripts), and each address gets a fixed allowance of requests per minute so one
// caller cannot starve the rest or hammer the database.

import type { FastifyInstance } from "fastify";

/** A fixed-window request counter per key. In memory: it resets on restart, which is fine for an abuse brake. */
export class RateLimiter {
  private readonly hits = new Map<string, { windowStart: number; count: number }>();
  constructor(
    private readonly max: number,
    private readonly windowMs = 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  /** Counts a request from `key`. False when it is over its allowance for this window. */
  allow(key: string): boolean {
    const t = this.now();
    const entry = this.hits.get(key);
    if (!entry || t - entry.windowStart >= this.windowMs) {
      if (this.hits.size >= 20_000) for (const [k, v] of this.hits) if (t - v.windowStart >= this.windowMs) this.hits.delete(k);
      this.hits.set(key, { windowStart: t, count: 1 });
      return true;
    }
    if (entry.count >= this.max) return false;
    entry.count += 1;
    return true;
  }
}

/** A value kept for a short time, so a costly read is done once for many callers. */
export class TtlCache<V> {
  private readonly store = new Map<string, { at: number; value: V }>();
  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 500,
    private readonly now: () => number = Date.now,
  ) {}

  async get(key: string, load: () => Promise<V>): Promise<V> {
    const hit = this.store.get(key);
    const t = this.now();
    if (hit && t - hit.at < this.ttlMs) return hit.value;
    const value = await load();
    if (this.store.size >= this.maxEntries) this.store.delete(this.store.keys().next().value as string);
    this.store.set(key, { at: t, value });
    return value;
  }
}

export interface SecurityOptions {
  /** Requests each address may make per minute across the whole API. */
  rateLimitPerMinute: number;
}

export function applySecurity(fastify: FastifyInstance, options: SecurityOptions): void {
  const limiter = new RateLimiter(options.rateLimitPerMinute);

  fastify.addHook("onRequest", async (req, reply) => {
    reply
      .header("x-content-type-options", "nosniff")
      .header("x-frame-options", "DENY")
      .header("referrer-policy", "no-referrer")
      .header("cross-origin-resource-policy", "cross-origin")
      .header("permissions-policy", "camera=(), microphone=(), geolocation=()");
    // `req.ip` is the real caller only when TRUST_PROXY_HOPS says how many proxies sit in front of the API.
    // Otherwise it is the connection's own address, which no caller can forge.
    if (req.method !== "OPTIONS" && !limiter.allow(req.ip)) {
      reply.header("retry-after", "60").code(429).send({ statusCode: 429, error: "Too Many Requests", message: "Slow down and try again in a minute." });
      return reply;
    }
    return undefined;
  });

  // Answers are JSON from a database that changes block by block: never let an intermediary keep one for long.
  // Token images set their own long cache, because an image is named by the hash of its bytes and never changes.
  fastify.addHook("onSend", async (_req, reply, payload) => {
    if (!reply.hasHeader("cache-control")) reply.header("cache-control", "no-store");
    // A JSON answer must never run as a page, even if something fooled a browser into opening it as one.
    if (!reply.hasHeader("content-security-policy")) reply.header("content-security-policy", "default-src 'none'; frame-ancestors 'none'");
    return payload;
  });
}
