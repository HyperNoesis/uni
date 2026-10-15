// Triangle budget per quality level, measured with the REAL renderer in headless Chromium (software GL: triangle counts are exact, timings are not).
// Usage: CHROMIUM_PATH=... PLAYWRIGHT_PKG=... ESBUILD=... NODE_PATH=... node tests/visual/tri-budget.mjs   (pnpm check:budget)
import { execFileSync } from "node:child_process";
import path from "node:path";
const root = path.resolve(new URL("../..", import.meta.url).pathname);
const BUDGET = { low: 60000, medium: 120000, high: 200000 }; // the renderer governor aims lower (52k/105k/175k) so these have headroom          // max triangles in any checked view (phone viewport, character + LOD avatars)
const VIEWS = { commons: { x: 60, y: 62, heading: Math.PI }, gate: { x: 60, y: 74, heading: 0 }, boulevard: { x: 60, y: 128, heading: Math.PI }, alley: { x: 120, y: 100, heading: Math.PI } };
let fail = 0;
for (const q of Object.keys(BUDGET)) for (const [name, me] of Object.entries(VIEWS)) {
  const cfg = { width: 390, height: 844, quality: q, character: true, lod: true, assets: "manifest", frames: 24, dt: 0.1, me, extras: [1, 2, 3, 4].map((i) => ({ x: me.x + i * 1.2 - 3, y: me.y + 3, vx: 0, vy: 0.4, preset: i })) };
  const out = execFileSync("node", [path.join(root, "tests/visual/harness/run.mjs"), "", JSON.stringify(cfg), `/tmp/tri-budget-${q}-${name}`], { encoding: "utf8", timeout: 280000 });
  const tris = Number(/"tris": (\d+)/.exec(out)?.[1]);
  const ok = tris <= BUDGET[q]; if (!ok) fail++;
  console.log(`${ok ? "ok  " : "OVER"} ${q.padEnd(6)} ${name.padEnd(10)} ${String(tris).padStart(7)} / ${BUDGET[q]}`);
}
process.exit(fail ? 1 : 0);
