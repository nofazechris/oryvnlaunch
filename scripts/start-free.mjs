// Runs the API and the indexer together in ONE process tree, for hosts that give you one free service.
//
//   node scripts/start-free.mjs
//
// Why: the indexer has to keep reading Starknet, and a free host only gives us one service. The indexer
// remembers where it stopped (a cursor in the database), so when a free service sleeps and wakes up it simply
// catches up. Nothing is lost while it sleeps; the data is just a little behind until it has.
//
// Behaviour:
//  - the API is the one the host health-checks. If it stops, everything stops and the host restarts us.
//  - if the indexer stops (a node hiccup, say), only it is restarted, after a pause that grows to a minute,
//    so one flaky RPC call never takes the website down.
//  - SIGTERM / SIGINT are passed on so both shut down cleanly.
//
// Both are started from the repository root, which is where the indexer finds contracts/deployments/<network>.json.

import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const children = new Map();
let stopping = false;

const say = (message) => console.log(JSON.stringify({ time: new Date().toISOString(), level: "info", source: "launcher", message }));

function start(name, file) {
  const child = spawn(process.execPath, [file], { cwd: root, env: process.env, stdio: "inherit" });
  children.set(name, child);
  return child;
}

function shutdown(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children.values()) child.kill("SIGTERM");
  // Give them a moment to finish, then leave whatever the exit code says.
  setTimeout(() => process.exit(code), 4000).unref();
}

// The API.
const api = start("api", "apps/api/dist/main.js");
api.on("exit", (code, signal) => {
  say(`api exited (${signal ?? code}); stopping so the host restarts the service`);
  shutdown(code ?? 1);
});

// The indexer, restarted on its own with a growing pause.
let pause = 2000;
function startIndexer() {
  const startedAt = Date.now();
  const indexer = start("indexer", "apps/indexer/dist/main.js");
  indexer.on("exit", (code, signal) => {
    if (stopping) return;
    // A run that lasted a while was healthy: start the pause over.
    if (Date.now() - startedAt > 60_000) pause = 2000;
    say(`indexer exited (${signal ?? code}); restarting in ${Math.round(pause / 1000)}s`);
    setTimeout(startIndexer, pause).unref?.();
    pause = Math.min(pause * 2, 60_000);
  });
}
startIndexer();

for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => shutdown(0));
say("started the API and the indexer");
