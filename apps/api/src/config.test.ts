import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

const url = "postgres://user:secret@ep-cool-123-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require";

describe("loadConfig", () => {
  it("needs only the database, and defaults to no CORS", () => {
    expect(loadConfig({ DATABASE_URL: url })).toEqual({
      databaseUrl: url,
      port: 4000,
      host: "127.0.0.1",
      trustProxyHops: 0,
      rateLimitPerMinute: 300,
      maxImageStorageBytes: 200 * 1024 * 1024,
      corsOrigins: [],
    });
  });

  it("reads the port and splits a list of allowed origins", () => {
    const config = loadConfig({ DATABASE_URL: url, PORT: "8080", CORS_ORIGIN: "https://a.com, https://b.com ,," });
    expect(config).toMatchObject({ port: 8080, corsOrigins: ["https://a.com", "https://b.com"] });
  });

  it("explains what is missing", () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL is required/);
  });

  it("rejects a port that cannot be a port", () => {
    expect(() => loadConfig({ DATABASE_URL: url, PORT: "0" })).toThrow(/PORT/);
    expect(() => loadConfig({ DATABASE_URL: url, PORT: "70000" })).toThrow(/PORT/);
  });
});
