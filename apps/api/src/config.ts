import { z } from "zod";

const Env = z.object({
  /** Neon's POOLED connection string. */
  DATABASE_URL: z.string({ error: "DATABASE_URL is required (your Neon connection string)" }).min(1, "DATABASE_URL is required (your Neon connection string)"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  HOST: z.string().default("0.0.0.0"),
  /** Comma-separated list of browser origins allowed to call the API, e.g. https://oryvnlaunch.com. Empty: no CORS. */
  CORS_ORIGIN: z.string().default(""),
});

export interface Config {
  databaseUrl: string;
  port: number;
  host: string;
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
    corsOrigins: e.CORS_ORIGIN.split(",").map((s) => s.trim()).filter(Boolean),
  };
}
