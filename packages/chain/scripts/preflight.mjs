// Checks that everything needed to run on a network is in place and agrees with itself, before you
// start anything. It reads your .env and apps/web/.env.local, asks the node and the factory real
// questions, and says in plain words what to fix. It never prints a connection string or a key.
//
//   pnpm preflight                 (uses NETWORK from .env, default sepolia)
//   NETWORK=devnet pnpm preflight
//
// Exit code 0 means "ready"; 1 means at least one thing needs fixing. Warnings do not fail it.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { eventSelector, normalizeAddress } from "../dist/index.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const env = process.env;

/** KEY=value lines of a dotenv file, without overriding anything already in the environment. */
function readDotenv(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trim().startsWith("#")) out[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
  return out;
}
const web = { ...readDotenv(join(root, "apps/web/.env.local")), ...Object.fromEntries(Object.entries(env).filter(([k]) => k.startsWith("NEXT_PUBLIC_"))) };

let failures = 0;
let warnings = 0;
const ok = (msg) => console.log(`  ok    ${msg}`);
const bad = (msg, fix) => ((failures += 1), console.log(`  FIX   ${msg}${fix ? `\n          -> ${fix}` : ""}`));
const warn = (msg, fix) => ((warnings += 1), console.log(`  note  ${msg}${fix ? `\n          -> ${fix}` : ""}`));
const section = (title) => console.log(`\n${title}`);
const hostOf = (url) => {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
};

const network = env.NETWORK || "sepolia";
console.log(`Preflight for network: ${network}`);
if (network === "mainnet") {
  console.log("\nThis project is testnet-only until the contracts are independently audited. Refusing.");
  process.exit(1);
}
if (!["sepolia", "devnet"].includes(network)) {
  console.log(`\nNETWORK must be sepolia or devnet, not "${network}".`);
  process.exit(1);
}

// ---------- deployment record ----------
section("Contracts");
const deploymentPath = join(root, `contracts/deployments/${network}.json`);
let deployment = null;
if (!existsSync(deploymentPath)) {
  bad(`contracts/deployments/${network}.json does not exist`, "run contracts/scripts/deploy.sh (see docs/testnet-launch.md step 3)");
} else {
  deployment = JSON.parse(readFileSync(deploymentPath, "utf8"));
  if (!deployment.factory?.address || deployment.factory.deployBlock === undefined || !deployment.factory.classHash) {
    bad("the deployment file is missing the factory address, class hash or deploy block", "re-run scripts/deploy.sh");
    deployment = null;
  } else {
    ok(`factory ${deployment.factory.address.slice(0, 10)}… deployed in block ${deployment.factory.deployBlock}`);
  }
}

// ---------- database ----------
section("Database (Neon)");
const dbUrl = env.DATABASE_URL;
const directUrl = env.DATABASE_URL_DIRECT;
if (network === "devnet") {
  ok("devnet: the local stand-in database is fine (pnpm db:local)");
} else if (!dbUrl) {
  bad("DATABASE_URL is not set", "paste Neon's POOLED connection string into .env");
} else if (!hostOf(dbUrl) || /PASTE_/.test(dbUrl)) {
  bad("DATABASE_URL is still the placeholder or is not a valid connection string", "paste Neon's POOLED connection string into .env");
} else {
  const host = hostOf(dbUrl) ?? "";
  if (/\.neon\.tech$/.test(host) && !host.includes("-pooler")) bad("DATABASE_URL looks like Neon's direct host", "use the pooled string (host contains -pooler) for the API and indexer");
  else ok(`DATABASE_URL points at ${host}`);
  if (/neon\.tech/.test(host) && !/sslmode=require/.test(dbUrl)) bad("DATABASE_URL has no sslmode=require", "Neon needs it; copy the string again from Neon's Connect dialog");
  if (!directUrl || !hostOf(directUrl) || /PASTE_/.test(directUrl)) bad("DATABASE_URL_DIRECT is not set (or is still the placeholder)", "paste Neon's DIRECT connection string (no -pooler); migrations use it");
  else if ((hostOf(directUrl) ?? "").includes("-pooler")) bad("DATABASE_URL_DIRECT is the pooled host", "migrations need the direct string (no -pooler)");
  else ok("DATABASE_URL_DIRECT is set and direct");
  console.log("        (then run: pnpm db:check, and pnpm db:migrate)");
}

// ---------- chain ----------
section("Starknet node");
const rpcUrl = env.STARKNET_RPC_URL;
async function rpc(method, params) {
  let headers = { "content-type": "application/json" };
  if (env.STARKNET_RPC_HEADERS) headers = { ...headers, ...JSON.parse(env.STARKNET_RPC_HEADERS) };
  const response = await fetch(rpcUrl, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const body = await response.json();
  if (body.error) throw new Error(body.error.message);
  return body.result;
}
const felt = (hex) => BigInt(hex);
const asText = (hex) => Buffer.from(felt(hex).toString(16).padStart(2, "0").replace(/^(.)$/, "0$1"), "hex").toString("utf8");

if (!rpcUrl || /PASTE_/.test(rpcUrl)) {
  bad("STARKNET_RPC_URL is not set", network === "sepolia" ? "use a Sepolia RPC URL from your provider's dashboard" : "http://127.0.0.1:5050/rpc");
} else {
  try {
    const chainId = asText(await rpc("starknet_chainId", []));
    const expected = network === "sepolia" ? "SN_SEPOLIA" : null;
    if (expected && chainId !== expected) bad(`the node is on ${chainId}, not ${expected}`, "use a Sepolia endpoint");
    else ok(`node reachable, chain ${chainId}`);
    const head = await rpc("starknet_blockNumber", []);
    ok(`head is block ${head}`);
    if (deployment) {
      if (head < deployment.factory.deployBlock) bad("the node is behind the factory's deploy block", "wait for it to sync, or use another endpoint");
      const classHash = await rpc("starknet_getClassHashAt", { block_id: "latest", contract_address: deployment.factory.address });
      if (felt(classHash) !== felt(deployment.factory.classHash)) bad("the contract at the factory address is not the class that was deployed", "check you are pointed at the right network, and that deploy.sh finished");
      else ok("the factory is there and is the class we deployed");
      const call = async (fn, calldata = []) =>
        (await rpc("starknet_call", { request: { contract_address: deployment.factory.address, entry_point_selector: "0x" + eventSelector(fn).toString(16), calldata }, block_id: "latest" })).map(felt);
      const [count] = await call("launch_count");
      ok(`the factory answers: ${count} launch(es) so far`);
      const strk = deployment.quoteTokens?.STRK?.address;
      if (strk) {
        const [enabled] = await call("quote_config", [strk]);
        if (enabled === 1n) ok("STRK launches are enabled");
        else bad("STRK is not enabled on the factory", "the factory owner must call set_quote_token for STRK");
      }
      const [low] = await call("trade_fee");
      ok(`trading fee on the factory is ${Number(low) / 100}%`);
    }
  } catch (error) {
    bad(`cannot talk to the node: ${error.message}`, "check STARKNET_RPC_URL (and STARKNET_RPC_HEADERS if your provider needs a key)");
  }
}

// ---------- API and web settings ----------
section("API and web app settings");
if (!env.CORS_ORIGIN) warn("CORS_ORIGIN is empty, so no browser site may call the API", network === "devnet" ? "http://localhost:3000 for local work" : "set it to your web app's address");
else ok(`API will accept browsers from ${env.CORS_ORIGIN}`);

const webPath = join(root, "apps/web/.env.local");
if (!existsSync(webPath) && Object.keys(web).length === 0) {
  warn("apps/web/.env.local does not exist and no NEXT_PUBLIC_ variables are set", "copy apps/web/.env.example to apps/web/.env.local and fill it in");
} else {
  if ((web.NEXT_PUBLIC_NETWORK ?? "devnet") !== network) bad(`the web app is set to "${web.NEXT_PUBLIC_NETWORK ?? "devnet (default)"}" but this run is ${network}`, `set NEXT_PUBLIC_NETWORK=${network}`);
  else ok(`web app network is ${network}`);
  if (!web.NEXT_PUBLIC_FACTORY_ADDRESS) bad("NEXT_PUBLIC_FACTORY_ADDRESS is not set", "without it nobody can launch from the app");
  else if (deployment) {
    try {
      if (normalizeAddress(web.NEXT_PUBLIC_FACTORY_ADDRESS) !== normalizeAddress(deployment.factory.address)) bad("NEXT_PUBLIC_FACTORY_ADDRESS is not the deployed factory", `use ${deployment.factory.address}`);
      else ok("the web app points at the deployed factory");
    } catch {
      bad("NEXT_PUBLIC_FACTORY_ADDRESS is not a valid address");
    }
  }
  if (network !== "devnet" && !web.NEXT_PUBLIC_RPC_URL) bad("NEXT_PUBLIC_RPC_URL is not set", "the app needs it for balances and trade previews; it is public, so use a key-less or domain-restricted URL");
  else if (web.NEXT_PUBLIC_RPC_URL) ok("the web app has an RPC URL");
  const apiUrl = web.NEXT_PUBLIC_API_URL || "http://localhost:4000";
  if (network !== "devnet" && /localhost|127\.0\.0\.1/.test(apiUrl)) warn(`NEXT_PUBLIC_API_URL is ${apiUrl}`, "fine for trying it yourself; testers need your API's public address");
  try {
    const response = await fetch(apiUrl.replace(/\/$/, "") + "/health", { signal: AbortSignal.timeout(4000) });
    const health = await response.json();
    if (health.status === "ok") ok(`the API at ${apiUrl} is up${health.indexer ? `, indexer at block ${health.indexer.block}, last wrote ${health.indexer.ageSeconds}s ago` : ""}`);
    else warn(`the API at ${apiUrl} says ${health.status}`, "check its database connection and that the indexer is running");
  } catch {
    warn(`the API at ${apiUrl} is not answering`, "start it (pnpm --filter @launchpad/api start), then run this again");
  }
}

console.log(`\n${failures === 0 ? "Ready." : `${failures} thing(s) to fix.`}${warnings ? ` ${warnings} note(s).` : ""}`);
process.exit(failures === 0 ? 0 : 1);
