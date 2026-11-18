import { z } from "zod";

const Env = z.object({
  /** Neon's POOLED connection string. */
  DATABASE_URL: z.string({ error: "DATABASE_URL is required (your Neon connection string)" }).min(1, "DATABASE_URL is required (your Neon connection string)"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  /** Which address to listen on. Loopback by default, so the API is not reachable from the network unless you say so (a container or a host behind a proxy sets 0.0.0.0). */
  HOST: z.string().default("127.0.0.1"),
  /** How many proxies sit in front of the API (0 = none). Only then is a caller's address read from X-Forwarded-For; otherwise anyone could forge it to dodge the rate limits. */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  /** Requests each address may make per minute. */
  RATE_LIMIT_PER_MIN: z.coerce.number().int().min(10).max(100_000).default(300),
  /** Most bytes of token images kept in the database in total. */
  MAX_IMAGE_STORAGE_MB: z.coerce.number().int().min(1).max(100_000).default(200),
  /** Comma-separated list of browser origins allowed to call the API, e.g. https://oryvnlaunch.com. Empty: no CORS. */
  CORS_ORIGIN: z.string().default(""),
});

export interface Config {
  databaseUrl: string;
  port: number;
  host: string;
  trustProxyHops: number;
  rateLimitPerMinute: number;
  maxImageStorageBytes: number;
  corsOrigins: string[];
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  ${i.path.join(".") || "env"}: ${i.message}`).join("\n");
    throw new Error(`Invalid API configuration:\n${problems}`);
  }
  const e = parsed.data;
  return {
    databaseUrl: e.DATABASE_URL,
    port: e.PORT,
    host: e.HOST,
    trustProxyHops: e.TRUST_PROXY_HOPS,
    rateLimitPerMinute: e.RATE_LIMIT_PER_MIN,
    maxImageStorageBytes: e.MAX_IMAGE_STORAGE_MB * 1024 * 1024,
    corsOrigins: e.CORS_ORIGIN.split(",").map((s) => s.trim()).filter(Boolean),
  };
}
