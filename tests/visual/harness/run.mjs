// Headless-Chromium screenshot runner for the real renderer. Test-only; software GL (SwiftShader), so FPS numbers are RELATIVE, not device truth.
// Usage: node tests/visual/harness/run.mjs <out.png> '<json cfg>' [workdir]
import { createRequire } from "node:module";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PKG ?? "/home/claude/.npm-global/lib/node_modules/playwright");
const root = path.resolve(new URL("../../..", import.meta.url).pathname);
const [out, cfgJson, workArg] = process.argv.slice(2);
const cfg = JSON.parse(cfgJson ?? "{}"), work = workArg ?? fs.mkdtempSync("/tmp/campus-harness-");
fs.mkdirSync(work, { recursive: true });
const esbuild = process.env.ESBUILD ?? "/opt/npm-tools/node_modules/esbuild/bin/esbuild";
execFileSync(esbuild, [path.join(root, "tests/visual/harness/entry.ts"), "--bundle", "--format=iife", `--outfile=${work}/bundle.js`, `--alias:@campus/domain=${root}/packages/domain/src/index.ts`, "--log-level=warning"], { env: { ...process.env, NODE_PATH: ["/opt/npm-tools/node_modules", process.env.NODE_PATH].filter(Boolean).join(":") }, stdio: "inherit" });
fs.copyFileSync(path.join(root, "tests/visual/harness/index.html"), path.join(work, "index.html"));
const pub = path.join(root, "apps/web/public"), types = { ".html": "text/html", ".js": "text/javascript", ".glb": "model/gltf-binary", ".png": "image/png" };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent((req.url ?? "/").split("?")[0]), f = u === "/" ? path.join(work, "index.html") : fs.existsSync(path.join(work, u)) ? path.join(work, u) : path.join(pub, u);
  if (!f.startsWith(work) && !f.startsWith(pub) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": types[path.extname(f)] ?? "application/octet-stream" }); fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--use-angle=swiftshader", "--use-gl=angle", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"] });
const page = await browser.newPage({ viewport: { width: cfg.width ?? 1280, height: cfg.height ?? 720 } });
const logs = []; page.on("console", (m) => logs.push(`${m.type()}: ${m.text()}`)); page.on("pageerror", (e) => logs.push("pageerror: " + e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/`);
if (cfg.spawnOnly) { console.log(JSON.stringify(await page.evaluate(() => window.__spawn))); await browser.close(); server.close(); process.exit(0); }
let result; try { result = await page.evaluate((c) => window.__run(c), cfg); } catch (e) { logs.push("run failed: " + e.message); }
if (out) await page.screenshot({ path: out, timeout: 150000 });
console.log(JSON.stringify({ result, logs: logs.slice(0, 12) }, null, 1));
await browser.close(); server.close();
