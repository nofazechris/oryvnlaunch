// Capture real events from a devnet that has run the smoke scenario, so the decoder tests run
// against what the contracts actually emit rather than against hand-written examples.
//
//   (devnet running, scripts/deploy.sh and scripts/smoke.sh already run)
//   pnpm --filter @launchpad/chain build && node packages/chain/scripts/capture-fixtures.mjs
//
// It also records what the contracts themselves report at the chain head (get_state and
// spot_price), so the tests can check our derived numbers against the contract's.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { StarknetRpc, decodeFactoryEvent, eventSelector } from "../dist/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const URL = process.env.RPC_URL ?? "http://127.0.0.1:5050/rpc";
const deployment = JSON.parse(readFileSync(join(here, "../../../contracts/deployments/devnet.json"), "utf8"));
const factory = deployment.factory.address;

const rpc = new StarknetRpc({ url: URL });
const head = await rpc.blockNumber();

async function call(address, fn) {
  const response = await fetch(URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "starknet_call",
      params: {
        request: { contract_address: address, entry_point_selector: "0x" + eventSelector(fn).toString(16), calldata: [] },
        block_id: { block_number: head },
      },
    }),
  });
  const body = await response.json();
  if (body.error) throw new Error(`${fn}: ${body.error.message}`);
  return body.result;
}

const factoryEvents = await rpc.getEvents({ address: factory, fromBlock: 0, toBlock: head });
const curves = factoryEvents
  .map((raw, i) => decodeFactoryEvent(raw, i))
  .filter((e) => e && e.type === "LaunchCreated")
  .map((e) => e.curve);

const curveEvents = {};
const expected = {};
for (const curve of curves) {
  curveEvents[curve] = await rpc.getEvents({ address: curve, fromBlock: 0, toBlock: head });
  expected[curve] = { spotPrice: await call(curve, "spot_price"), state: await call(curve, "get_state") };
}

// Timestamps by block number, looked up through each event's block hash.
const timestamps = {};
for (const e of [...factoryEvents, ...Object.values(curveEvents).flat()]) {
  timestamps[e.block_number] ??= await rpc.blockTimestamp(e.block_hash);
}

const out = { capturedAtBlock: head, factory, factoryEvents, curveEvents, expected, timestamps };
const path = join(here, "../fixtures/devnet-events.json");
writeFileSync(path, JSON.stringify(out, null, 2) + "\n");
console.log(`captured ${factoryEvents.length} factory events and ${Object.values(curveEvents).flat().length} curve events from ${curves.length} curve(s) up to block ${head}`);
