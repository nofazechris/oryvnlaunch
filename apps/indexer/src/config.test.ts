import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

const valid = {
  DATABASE_URL: "postgres://user:pass@ep-cool-123-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require",
  STARKNET_RPC_URL: "http://127.0.0.1:5050/rpc",
  FACTORY_ADDRESS: "0xABC",
};

describe("loadConfig", () => {
  it("accepts the minimum and fills in safe defaults", () => {
    const config = loadConfig(valid);
    expect(config).toMatchObject({
      databaseUrl: valid.DATABASE_URL,
      rpcUrl: valid.STARKNET_RPC_URL,
      startBlock: 0,
      pollIntervalMs: 3000,
      overlapBlocks: 10,
      maxBlockRange: 1000,
      rpcHeaders: {},
    });
  });

  it("normalises the factory address so it matches what the decoders produce", () => {
    expect(loadConfig(valid).factory).toBe("0x" + "0".repeat(61) + "abc");
  });

  it("reads numbers from strings, as environment variables are", () => {
    const config = loadConfig({ ...valid, START_BLOCK: "123456", POLL_INTERVAL_MS: "5000", MAX_BLOCK_RANGE: "50" });
    expect(config).toMatchObject({ startBlock: 123456, pollIntervalMs: 5000, maxBlockRange: 50 });
  });

  it("parses extra RPC headers", () => {
    expect(loadConfig({ ...valid, STARKNET_RPC_HEADERS: '{"x-api-key":"k"}' }).rpcHeaders).toEqual({ "x-api-key": "k" });
  });

  it("reports every problem at once, by name", () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL[\s\S]*STARKNET_RPC_URL[\s\S]*FACTORY_ADDRESS/);
    expect(() => loadConfig({})).toThrow(/DATABASE_URL is required \(your Neon connection string\)/);
    expect(() => loadConfig({})).toThrow(/FACTORY_ADDRESS is required/);
  });

  it("rejects a malformed factory address, a bad URL and a negative start block", () => {
    expect(() => loadConfig({ ...valid, FACTORY_ADDRESS: "not-an-address" })).toThrow(/FACTORY_ADDRESS/);
    expect(() => loadConfig({ ...valid, STARKNET_RPC_URL: "nope" })).toThrow(/STARKNET_RPC_URL/);
    expect(() => loadConfig({ ...valid, START_BLOCK: "-1" })).toThrow(/START_BLOCK/);
  });

  it("refuses a polling interval so short it would hammer the node", () => {
    expect(() => loadConfig({ ...valid, POLL_INTERVAL_MS: "10" })).toThrow(/POLL_INTERVAL_MS/);
  });

  it("rejects headers that are not a JSON object", () => {
    expect(() => loadConfig({ ...valid, STARKNET_RPC_HEADERS: "[1]" })).toThrow(/STARKNET_RPC_HEADERS/);
    expect(() => loadConfig({ ...valid, STARKNET_RPC_HEADERS: "{oops" })).toThrow(/STARKNET_RPC_HEADERS/);
  });

  it("does not echo the database password in its error", () => {
    try {
      loadConfig({ ...valid, FACTORY_ADDRESS: "bad" });
    } catch (error) {
      expect(String(error)).not.toContain("pass@");
    }
  });
});
