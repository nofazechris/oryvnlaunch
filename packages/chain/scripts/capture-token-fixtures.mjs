// Capture real token Transfer events from a devnet, together with what every holder's balance is
// according to the token contract itself. The tests then check that adding up the events gives the
// same balances the chain reports.
//
//   (devnet running, with launches that have traded)
//   pnpm --filter @launchpad/chain build && node packages/chain/scripts/capture-token-fixtures.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { StarknetRpc, decodeFactoryEvent, decodeTokenEvent, eventSelector, TOKEN_EVENT_KEYS } from "../dist/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const URL = process.env.RPC_URL ?? "http://127.0.0.1:5050/rpc";
const deployment = JSON.parse(readFileSync(join(here, "../../../contracts/deployments/devnet.json"), "utf8"));
const rpc = new StarknetRpc({ url: URL });
const head = await rpc.blockNumber();

async function call(address, fn, calldata = []) {
  const response = await fetch(URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "starknet_call",
      params: {
        request: { contract_address: address, entry_point_selector: "0x" + eventSelector(fn).toString(16), calldata },
        block_id: { block_number: head },
      },
    }),
  });
  const body = await response.json();
  if (body.error) throw new Error(`${fn}: ${body.error.message}`);
  return body.result;
}

const factoryEvents = await rpc.getEvents({ address: deployment.factory.address, fromBlock: 0, toBlock: head });
const launches = factoryEvents.map((raw, i) => decodeFactoryEvent(raw, i)).filter((e) => e && e.type === "LaunchCreated");

const tokens = {};
for (const launch of launches) {
  const events = await rpc.getEvents({ address: launch.token, fromBlock: 0, toBlock: head, keys: TOKEN_EVENT_KEYS });
  const holders = new Set();
  for (const raw of events) {
    const t = decodeTokenEvent(raw, 0);
    holders.add(t.from);
    holders.add(t.to);
  }
  const balances = {};
  for (const holder of holders) {
    const [low, high] = await call(launch.token, "balance_of", [holder]);
    balances[holder] = (BigInt(low) + (BigInt(high) << 128n)).toString();
  }
  tokens[launch.token] = { curve: launch.curve, creator: launch.creator, factory: launch.factory, events, balances };
}

const out = { capturedAtBlock: head, tokens };
writeFileSync(join(here, "../fixtures/devnet-token-events.json"), JSON.stringify(out, null, 2) + "\n");
console.log(`captured ${Object.values(tokens).reduce((n, t) => n + t.events.length, 0)} Transfer events from ${launches.length} token(s) up to block ${head}`);
