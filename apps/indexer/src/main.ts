import { StarknetRpc } from "@launchpad/chain";
import { connect } from "@launchpad/db";
import { loadConfig } from "./config.js";
import { Indexer, type Logger } from "./indexer.js";

const log: Logger = (level, message, fields) =>
  console[level === "error" ? "error" : "log"](JSON.stringify({ time: new Date().toISOString(), level, message, ...fields }, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));

let config;
try {
  config = loadConfig(process.env);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const { db, close } = connect(config.databaseUrl);
const rpc = new StarknetRpc({ url: config.rpcUrl, headers: config.rpcHeaders });
const indexer = new Indexer(
  rpc,
  db,
  {
    factory: config.factory,
    startBlock: config.startBlock,
    overlapBlocks: config.overlapBlocks,
    maxBlockRange: config.maxBlockRange,
    ignoredTokens: config.ignoredTokens,
  },
  log,
);

const stop = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    log("info", `received ${signal}, stopping after the current pass`);
    stop.abort();
  });
}

log("info", "indexer starting", { factory: config.factory, startBlock: config.startBlock, rpc: new URL(config.rpcUrl).origin });
await indexer.run(stop.signal, config.pollIntervalMs);
await close();
log("info", "indexer stopped");
