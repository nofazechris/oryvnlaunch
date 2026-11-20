import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
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
    expect(() => loadConfig({})).toThrow(/DATABASE_URL[\s\S]*STARKNET_RPC_URL/);
    expect(() => loadConfig({})).toThrow(/DATABASE_URL is required \(your Neon connection string\)/);
    expect(() => loadConfig({})).toThrow(/STARKNET_RPC_URL is required/);
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

describe("reading the factory from the deployment record", () => {
  const roots: string[] = [];
  afterAll(() => roots.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

  /** A fake repo with contracts/deployments/<network>.json, and a nested folder to run from. */
  function repoWith(network: string, record: unknown | string): { root: string; runFrom: string } {
    const root = mkdtempSync(join(tmpdir(), "oryvn-config-"));
    roots.push(root);
    mkdirSync(join(root, "contracts", "deployments"), { recursive: true });
    writeFileSync(join(root, "contracts", "deployments", `${network}.json`), typeof record === "string" ? record : JSON.stringify(record));
    const runFrom = join(root, "apps", "indexer");
    mkdirSync(runFrom, { recursive: true });
    return { root, runFrom };
  }
  const base = { DATABASE_URL: valid.DATABASE_URL, STARKNET_RPC_URL: valid.STARKNET_RPC_URL };
  const record = { factory: { address: "0xDEF", deployBlock: 4242 } };

  it("takes the address and the start block from the deployment file, found from a nested folder", () => {
    const { runFrom } = repoWith("sepolia", record);
    const config = loadConfig({ ...base, NETWORK: "sepolia" }, { cwd: runFrom });
    expect(config.factory).toBe("0x" + "0".repeat(61) + "def");
    expect(config.startBlock).toBe(4242);
  });

  it("lets START_BLOCK override the recorded block", () => {
    const { runFrom } = repoWith("sepolia", record);
    expect(loadConfig({ ...base, NETWORK: "sepolia", START_BLOCK: "5000" }, { cwd: runFrom }).startBlock).toBe(5000);
  });

  it("lets FACTORY_ADDRESS win over the file, and then does not need one", () => {
    const config = loadConfig({ ...base, NETWORK: "sepolia", FACTORY_ADDRESS: "0x1" }, { cwd: tmpdir() });
    expect(config.factory).toBe("0x" + "0".repeat(63) + "1");
    expect(config.startBlock).toBe(0);
  });

  it("explains how to fix it when the deployment file does not exist", () => {
    const { runFrom } = repoWith("devnet", record);
    expect(() => loadConfig({ ...base, NETWORK: "sepolia" }, { cwd: runFrom })).toThrow(/no deployment record for "sepolia"[\s\S]*deploy\.sh/);
  });

  it("refuses a record from an older deploy script that did not save the block, instead of starting at 0", () => {
    const { runFrom } = repoWith("sepolia", { factory: { address: "0xDEF" } });
    expect(() => loadConfig({ ...base, NETWORK: "sepolia" }, { cwd: runFrom })).toThrow(/does not record the block[\s\S]*START_BLOCK/);
  });

  it("still works for such a record when START_BLOCK is given", () => {
    const { runFrom } = repoWith("sepolia", { factory: { address: "0xDEF" } });
    expect(loadConfig({ ...base, NETWORK: "sepolia", START_BLOCK: "10" }, { cwd: runFrom }).startBlock).toBe(10);
  });

  it("ignores nothing unless told to", () => {
    expect(loadConfig(valid).ignoredTokens).toEqual([]);
    const { runFrom } = repoWith("sepolia", record);
    expect(loadConfig({ ...base, NETWORK: "sepolia" }, { cwd: runFrom }).ignoredTokens).toEqual([]);
  });

  it("reads the tokens to leave out from IGNORE_TOKENS, normalised and without repeats", () => {
    const config = loadConfig({ ...valid, IGNORE_TOKENS: " 0xAB , 0xab,0xCD ,, " });
    expect(config.ignoredTokens).toEqual(["0x" + "0".repeat(62) + "ab", "0x" + "0".repeat(62) + "cd"]);
  });

  it("merges the tokens listed in the deployment record with IGNORE_TOKENS", () => {
    const { runFrom } = repoWith("sepolia", { ...record, ignoredTokens: ["0x11", "0xAB"] });
    const config = loadConfig({ ...base, NETWORK: "sepolia", IGNORE_TOKENS: "0xab,0x22" }, { cwd: runFrom });
    expect(config.ignoredTokens.sort()).toEqual(["0x" + "0".repeat(62) + "11", "0x" + "0".repeat(62) + "22", "0x" + "0".repeat(62) + "ab"].sort());
  });

  it("refuses a list entry that is not an address, instead of quietly skipping it", () => {
    expect(() => loadConfig({ ...valid, IGNORE_TOKENS: "0x1,not-an-address" })).toThrow(/IGNORE_TOKENS[\s\S]*not an address|not a 0x-prefixed token address/);
    const { runFrom } = repoWith("sepolia", { ...record, ignoredTokens: ["nope"] });
    expect(() => loadConfig({ ...base, NETWORK: "sepolia" }, { cwd: runFrom })).toThrow(/ignoredTokens[\s\S]*not a 0x-prefixed token address/);
    const { runFrom: r2 } = repoWith("sepolia", { ...record, ignoredTokens: "0x1" });
    expect(() => loadConfig({ ...base, NETWORK: "sepolia" }, { cwd: r2 })).toThrow(/ignoredTokens must be a list/);
  });

  it("rejects a deployment file with no usable address or with broken JSON", () => {
    const noAddress = repoWith("sepolia", { factory: { deployBlock: 1 } });
    expect(() => loadConfig({ ...base, NETWORK: "sepolia" }, { cwd: noAddress.runFrom })).toThrow(/no valid factory\.address/);
    const broken = repoWith("sepolia", "{not json");
    expect(() => loadConfig({ ...base, NETWORK: "sepolia" }, { cwd: broken.runFrom })).toThrow(/not valid JSON/);
  });

  it("asks for NETWORK or FACTORY_ADDRESS when neither is set", () => {
    expect(() => loadConfig(base)).toThrow(/set NETWORK[\s\S]*or set FACTORY_ADDRESS/);
  });

  it("rejects an unknown network name", () => {
    expect(() => loadConfig({ ...base, NETWORK: "goerli" })).toThrow(/NETWORK must be sepolia, devnet or mainnet/);
  });
});
