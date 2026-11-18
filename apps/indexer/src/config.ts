import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { normalizeAddress } from "@launchpad/chain";
import { z } from "zod";

const Env = z.object({
  /** Neon's POOLED connection string. The indexer is a long-running writer, so it uses the pooler. */
  DATABASE_URL: z.string({ error: "DATABASE_URL is required (your Neon connection string)" }).min(1, "DATABASE_URL is required (your Neon connection string)"),
  STARKNET_RPC_URL: z.url({ error: "STARKNET_RPC_URL is required and must be a URL, e.g. http://127.0.0.1:5050/rpc for devnet" }),
  /**
   * Which deployment to index: `sepolia`, `devnet` or `mainnet`. The factory address and the block it
   * was deployed in are then read from contracts/deployments/<network>.json, which scripts/deploy.sh
   * writes, so nothing is copied by hand. Use FACTORY_ADDRESS instead to point at a factory directly.
   */
  NETWORK: z.enum(["sepolia", "devnet", "mainnet"], { error: "NETWORK must be sepolia, devnet or mainnet" }).optional(),
  /** The deployed TokenFactory. Takes precedence over NETWORK when both are set. */
  FACTORY_ADDRESS: z
    .string({ error: "FACTORY_ADDRESS must be a 0x-prefixed hex address" })
    .regex(/^0x[0-9a-fA-F]{1,64}$/, "FACTORY_ADDRESS must be a 0x-prefixed hex address")
    .transform(normalizeAddress)
    .optional(),
  /**
   * First block to read. With NETWORK it defaults to the block the factory was deployed in. With
   * FACTORY_ADDRESS alone it defaults to 0, which is slow on a live network and, if you set it AFTER
   * the factory's deploy block, silently misses launches.
   */
  START_BLOCK: z.coerce.number().int().min(0).optional(),
  POLL_INTERVAL_MS: z.coerce.number().int().min(250).default(3_000),
  /** Blocks re-read on every pass, so a shallow reorg is corrected instead of kept. */
  REORG_OVERLAP_BLOCKS: z.coerce.number().int().min(0).max(1_000).default(10),
  /** Most blocks read in one pass while catching up. */
  MAX_BLOCK_RANGE: z.coerce.number().int().min(1).max(10_000).default(1_000),
  /** Optional JSON object of extra RPC headers, for providers that want an API key header. */
  STARKNET_RPC_HEADERS: z.string().optional(),
});

export interface Config {
  databaseUrl: string;
  rpcUrl: string;
  rpcHeaders: Record<string, string>;
  factory: string;
  startBlock: number;
  pollIntervalMs: number;
  overlapBlocks: number;
  maxBlockRange: number;
}

export interface LoadOptions {
  /** Where to start looking for contracts/deployments/. Default: the current directory. */
  cwd?: string;
}

/** Walk up from `cwd` until a directory contains contracts/deployments/<network>.json. */
function findDeploymentFile(network: string, cwd: string): { path: string | undefined; searched: string } {
  const searched = join("contracts", "deployments", `${network}.json`);
  let dir = resolve(cwd);
  for (;;) {
    const candidate = join(dir, searched);
    if (existsSync(candidate)) return { path: candidate, searched };
    const parent = dirname(dir);
    if (parent === dir) return { path: undefined, searched };
    dir = parent;
  }
}

interface Deployment {
  factory: string;
  deployBlock: number | undefined;
  path: string;
}

function readDeployment(network: string, cwd: string): Deployment {
  const { path, searched } = findDeploymentFile(network, cwd);
  if (!path) {
    throw new Error(
      `Invalid indexer configuration:\n  NETWORK: no deployment record for "${network}" (looked for ${searched} in this folder and its parents). ` +
        `Deploy first with contracts/scripts/deploy.sh, or set FACTORY_ADDRESS and START_BLOCK yourself.`,
    );
  }
  let record: { factory?: { address?: unknown; deployBlock?: unknown } };
  try {
    record = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(`Invalid indexer configuration:\n  NETWORK: ${path} is not valid JSON`);
  }
  const address = record.factory?.address;
  if (typeof address !== "string" || !/^0x[0-9a-fA-F]{1,64}$/.test(address)) {
    throw new Error(`Invalid indexer configuration:\n  NETWORK: ${path} has no valid factory.address`);
  }
  const block = record.factory?.deployBlock;
  const deployBlock = typeof block === "number" && Number.isInteger(block) && block >= 0 ? block : undefined;
  return { factory: normalizeAddress(address), deployBlock, path };
}

export function loadConfig(env: Record<string, string | undefined>, options: LoadOptions = {}): Config {
  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  ${i.path.join(".") || "env"}: ${i.message}`).join("\n");
    throw new Error(`Invalid indexer configuration:\n${problems}`);
  }
  const e = parsed.data;

  let factory = e.FACTORY_ADDRESS;
  let startBlock = e.START_BLOCK;
  if (!factory) {
    if (!e.NETWORK) {
      throw new Error(
        "Invalid indexer configuration:\n  FACTORY_ADDRESS: set NETWORK (sepolia, devnet or mainnet) to read the factory from contracts/deployments/, " +
          "or set FACTORY_ADDRESS (and START_BLOCK) directly",
      );
    }
    const deployment = readDeployment(e.NETWORK, options.cwd ?? process.cwd());
    factory = deployment.factory;
    if (startBlock === undefined) {
      if (deployment.deployBlock === undefined) {
        throw new Error(
          `Invalid indexer configuration:\n  START_BLOCK: ${deployment.path} does not record the block the factory was deployed in ` +
            "(it was made by an older deploy script). Set START_BLOCK to that block, or redeploy.",
        );
      }
      startBlock = deployment.deployBlock;
    }
  }

  let rpcHeaders: Record<string, string> = {};
  if (e.STARKNET_RPC_HEADERS) {
    try {
      const value: unknown = JSON.parse(e.STARKNET_RPC_HEADERS);
      if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("not an object");
      rpcHeaders = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, String(v)]));
    } catch {
      throw new Error("Invalid indexer configuration:\n  STARKNET_RPC_HEADERS: must be a JSON object of header names to values");
    }
  }
  return {
    databaseUrl: e.DATABASE_URL,
    rpcUrl: e.STARKNET_RPC_URL,
    rpcHeaders,
    factory,
    startBlock: startBlock ?? 0,
    pollIntervalMs: e.POLL_INTERVAL_MS,
    overlapBlocks: e.REORG_OVERLAP_BLOCKS,
    maxBlockRange: e.MAX_BLOCK_RANGE,
  };
}
