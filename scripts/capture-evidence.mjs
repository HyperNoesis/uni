// Captures desktop + phone screenshots of every zone and records console/page errors.
// Usage: pnpm dev (other terminal), then:  BASE_URL=http://localhost:3000 [STORAGE_STATE=state.json] node scripts/capture-evidence.mjs
// First time: `npx playwright codegen --save-storage=state.json http://localhost:3000/start`, create an avatar once, close.
// Software GL (swiftshader) is used when no GPU exists, so frames prove layout/geometry, NOT performance. Use the in-game
// "Record 60s route" button (backtick key) on a real phone for FPS/p95.
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
const BASE = process.env.BASE_URL ?? "http://localhost:3000", OUT = new URL("../evidence/", import.meta.url).pathname;
let chromium; try { ({ chromium } = await import("playwright")); } catch { console.error("Install Playwright first: pnpm dlx playwright install chromium && pnpm add -D playwright"); process.exit(1); }
const zdir = new URL("../packages/domain/src/world-data/zones/", import.meta.url);
const zones = readdirSync(zdir).filter((f) => f.endsWith(".json")).map((f) => { const z = JSON.parse(readFileSync(new URL(f, zdir), "utf8")); return { id: z.id, cx: z.rect.x + z.rect.w / 2, cy: z.rect.y + z.rect.h / 2 }; });
const views = [["desktop", 1440, 900], ["phone390", 390, 844], ["phone360", 360, 800]];
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const log = []; let fails = 0;
// Checklist 0012: every screenshot states renderer/mode, viewport, device/browser, build commit and whether rendering is software.
let commit = process.env.GIT_COMMIT ?? "unknown"; try { commit = commit === "unknown" ? execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() : commit; } catch { /* not a git checkout */ }
const browserVersion = browser.version();
async function glInfo(page) {
  return page.evaluate(() => {
    try {
      const gl = document.createElement("canvas").getContext("webgl2") || document.createElement("canvas").getContext("webgl");
      if (!gl) return { renderer: "none", software: true, webgl: false };
      const ext = gl.getExtension("WEBGL_debug_renderer_info"), r = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
      return { renderer: r, software: /swiftshader|llvmpipe|software|basic render/i.test(r), webgl: true };
    } catch { return { renderer: "error", software: true, webgl: false }; }
  });
}
for (const [name, w, h] of views) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, ...(process.env.STORAGE_STATE ? { storageState: process.env.STORAGE_STATE } : {}) });
  for (const z of zones) {
    const page = await ctx.newPage(), errs = []; let meta = null;
    page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); }); page.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
    page.on("response", (r) => { if (r.status() >= 400) errs.push(`HTTP ${r.status()} ${r.url().slice(0, 120)}`); });
    try {
      await page.goto(`${BASE}/play?view=${z.cx},${z.cy}`, { waitUntil: "networkidle", timeout: 45000 }); await page.waitForTimeout(2500);
      if (!page.url().includes("/play")) { errs.push(`redirected to ${page.url()} (need STORAGE_STATE)`); }
      await page.screenshot({ path: `${OUT}${z.id}-${name}.png` });
      meta = { viewport: `${w}x${h}`, browser: `chromium ${browserVersion}`, commit, ...(await glInfo(page)) };
    } catch (e) { errs.push(`capture failed: ${String(e).slice(0, 160)}`); }
    if (errs.length) fails++; log.push({ zone: z.id, view: name, meta, errors: errs }); await page.close();
  }
  await ctx.close();
}
await browser.close();
writeFileSync(`${OUT}INDEX.json`, JSON.stringify({ base: BASE, at: new Date().toISOString(), commit, browser: browserVersion, note: "software=true means SwiftShader/llvmpipe: layout and geometry evidence only, NOT performance.", shots: log }, null, 2));
console.log(`${log.length} captures, ${fails} with errors. See evidence/INDEX.json`); process.exitCode = fails ? 1 : 0;
