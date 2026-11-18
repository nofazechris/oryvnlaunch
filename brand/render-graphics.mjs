// Render the HTML graphics in a post folder to PNG with headless Chrome (no dependencies).
//
//   node brand/render-graphics.mjs brand/posts/2026-11-12            (every src/*.html)
//   node brand/render-graphics.mjs brand/posts/2026-11-12 01-pipeline (just that one)
//
// Each src/NAME.html becomes NAME.png next to src/, 1600x900 at 2x (3200x1800), the 16:9 shape X
// shows without cropping. It waits for the web fonts and refuses to save if they did not load,
// so a graphic can never silently fall back to a system font.
import { spawn, execSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";

const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9344;
const [dirArg, ...only] = process.argv.slice(2);
if (!dirArg) {
  console.error("usage: node brand/render-graphics.mjs <post folder> [name ...]");
  process.exit(2);
}
const postDir = resolve(dirArg);
const srcDir = join(postDir, "src");
const names = readdirSync(srcDir)
  .filter((f) => f.endsWith(".html"))
  .map((f) => f.replace(/\.html$/, ""))
  .filter((n) => only.length === 0 || only.includes(n))
  .sort();
if (names.length === 0) throw new Error("no matching html files in " + srcDir);

const profile = join(tmpdir(), "oryvn-graphics-profile");
rmSync(profile, { recursive: true, force: true });
mkdirSync(profile, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(
  CHROME,
  ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", "--window-size=1600,900", "about:blank"],
  { stdio: "ignore" },
);

let ws;
let nextId = 0;
const pending = new Map();
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const id = ++nextId;
    pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });
const evalJs = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error("eval failed: " + JSON.stringify(r.exceptionDetails.exception?.description ?? r.exceptionDetails));
  return r.result.value;
};

try {
  let url;
  for (let i = 0; i < 40 && !url; i += 1) {
    try {
      const pages = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).filter((p) => p.type === "page");
      url = pages[0]?.webSocketDebuggerUrl;
    } catch {}
    if (!url) await sleep(500);
  }
  if (!url) throw new Error("Chrome did not start");
  ws = new WebSocket(url);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) {
      const p = pending.get(d.id);
      pending.delete(d.id);
      d.error ? p.rej(new Error(JSON.stringify(d.error))) : p.res(d.result);
    }
  };
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 900, deviceScaleFactor: 2, mobile: false });

  for (const name of names) {
    await send("Page.navigate", { url: pathToFileURL(join(srcDir, name + ".html")).href });
    await sleep(800);
    // Wait for the fonts, then insist they are really there.
    const fontsOk = await evalJs(`(async () => {
      await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 15000))]);
      await Promise.all([document.fonts.load('600 30px Geist'), document.fonts.load('400 20px "Geist Mono"')]);
      return document.fonts.check('600 30px Geist') && document.fonts.check('400 20px "Geist Mono"');
    })()`);
    if (!fontsOk) throw new Error(`${name}: web fonts did not load, refusing to render with a fallback font`);
    await sleep(300);
    const shot = await send("Page.captureScreenshot", { format: "png", fromSurface: true });
    writeFileSync(join(postDir, name + ".png"), Buffer.from(shot.data, "base64"));
    console.log("rendered", name + ".png");
  }
} finally {
  try { ws?.close(); } catch {}
  try { execSync(`taskkill /PID ${chrome.pid} /T /F`, { stdio: "ignore" }); } catch {}
  await sleep(1500);
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
}
