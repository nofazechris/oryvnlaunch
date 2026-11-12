import { normalizeAddress } from "@launchpad/chain";
import { z } from "zod";

const Env = z.object({
  /** Neon's POOLED connection string. The indexer is a long-running writer, so it uses the pooler. */
  DATABASE_URL: z.string({ error: "DATABASE_URL is required (your Neon connection string)" }).min(1, "DATABASE_URL is required (your Neon connection string)"),
  STARKNET_RPC_URL: z.url({ error: "STARKNET_RPC_URL is required and must be a URL, e.g. http://127.0.0.1:5050/rpc for devnet" }),
  /** The deployed TokenFactory (see contracts/deployments/<network>.json). */
  FACTORY_ADDRESS: z
    .string({ error: "FACTORY_ADDRESS is required (the deployed TokenFactory address)" })
    .regex(/^0x[0-9a-fA-F]{1,64}$/, "FACTORY_ADDRESS must be a 0x-prefixed hex address")
    .transform(normalizeAddress),
  /** First block to read. Set it to the block the factory was deployed in; reading from 0 on a live network is slow. */
  START_BLOCK: z.coerce.number().int().min(0).default(0),
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

export function loadConfig(env: Record<string, string | undefined>): Config {
  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  ${i.path.join(".") || "env"}: ${i.message}`).join("\n");
    throw new Error(`Invalid indexer configuration:\n${problems}`);
  }
  const e = parsed.data;
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
    factory: e.FACTORY_ADDRESS,
    startBlock: e.START_BLOCK,
    pollIntervalMs: e.POLL_INTERVAL_MS,
    overlapBlocks: e.REORG_OVERLAP_BLOCKS,
    maxBlockRange: e.MAX_BLOCK_RANGE,
  };
}
