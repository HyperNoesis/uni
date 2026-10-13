#!/usr/bin/env node
// Registers the curated Kenney (CC0) decor listed in scripts/models/kenney-campus.json: bakes each model (import-kenney.py, scaled to metres),
// adds `decor:<id>` manifest entries and appends the placements to the owning zone files. IDEMPOTENT: removes earlier kn_* entries first.
// Does NOT run generate-props.mjs (that generator is stale against the current zone data - see docs/HANDOFF_NEXT_AI.md).
//   node scripts/models/register-kenney-campus.mjs
import { readFileSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const outDir = join(root, "apps/web/public/assets/props"), zonesDir = join(root, "packages/domain/src/world-data/zones"), manifestPath = join(root, "packages/domain/src/world-data/assets.json");
const cfg = JSON.parse(readFileSync(join(root, "scripts/models/kenney-campus.json"), "utf8")), world = JSON.parse(readFileSync(join(root, "packages/domain/src/world-data/world.json"), "utf8"));
const zones = Object.fromEntries(readdirSync(zonesDir).filter((f) => f.endsWith(".json")).map((f) => { const z = JSON.parse(readFileSync(join(zonesDir, f), "utf8")); return [z.id, z]; }));
const before = Object.fromEntries(Object.values(zones).map((z) => [z.id, JSON.stringify(z)]));
for (const z of Object.values(zones)) z.decor = (z.decor ?? []).filter((d) => !String(d.model).startsWith("kn_"));
const manifest = JSON.parse(readFileSync(manifestPath, "utf8")); manifest.assets = manifest.assets.filter((a) => !a.id.startsWith("kn_"));
const blds = Object.values(zones).flatMap((z) => z.buildings), props = Object.values(zones).flatMap((z) => z.props);
const blocked = (x, y, pad) => blds.some((b) => x > b.x - pad && x < b.x + b.w + pad && y > b.y - pad && y < b.y + b.h + pad) || props.some((p) => x > p.x - pad && x < p.x + p.w + pad && y > p.y - pad && y < p.y + p.h + pad);
const owner = (x, y) => Object.values(zones).find((z) => x >= z.rect.x && x <= z.rect.x + z.rect.w && y >= z.rect.y && y <= z.rect.y + z.rect.h)?.id;
const used = {}; let dropped = 0;
for (const pl of cfg.placements) {
  const own = owner(pl.x, pl.y);
  if (!own || pl.x < .5 || pl.y < .5 || pl.x > world.width - .5 || pl.y > world.height - .5 || blocked(pl.x, pl.y, pl.pad ?? .9)) { dropped++; console.warn(`dropped ${pl.model} @ ${pl.x},${pl.y} (blocked/out of world)`); continue; }
  const d = { model: pl.model, x: pl.x, y: pl.y }; if (pl.rot) d.rot = pl.rot; if (pl.scale && pl.scale !== 1) d.scale = pl.scale;
  zones[own].decor.push(d); (used[pl.model] ??= new Set()).add(own);
}
for (const it of cfg.items) {
  const dest = join(outDir, `${it.id}.glb`);
  if (!used[it.id]) { rmSync(dest, { force: true }); console.warn(`skip ${it.id}: no placement kept`); continue; }
  const out = execFileSync("python3", [join(root, "scripts/models/import-kenney.py"), "--src", join(root, "assets-library/kenney", it.kit, `${it.model}.glb`), "--out", dest, "--scale", String(it.scale), ...(it.tint ? ["--tint", it.tint] : [])], { encoding: "utf8" });
  const info = JSON.parse(out.trim().split("\n").pop()), bytes = readFileSync(dest).length, r = (n) => Math.round(n * 100) / 100;
  manifest.assets.push({ id: it.id, url: `/assets/props/${it.id}.glb`, slot: `decor:${it.id}`, zones: [...used[it.id]].sort(), maxBytes: Math.ceil(bytes * 1.25 / 1000) * 1000, maxTriangles: Math.ceil(info.tris * 1.25 / 100) * 100, size: { w: r(info.size.w), h: r(info.size.h), d: r(info.size.d) }, yOffset: 0 });
  console.log(`${it.id.padEnd(18)} ${String(info.tris).padStart(5)} tris ${String(bytes).padStart(7)} bytes  Kenney ${it.kit}/${it.model}  zones=${[...used[it.id]].join(",")}`);
}
for (const z of Object.values(zones)) if (JSON.stringify(z) !== before[z.id]) writeFileSync(join(zonesDir, `${z.id}.json`), JSON.stringify(z, null, 2) + "\n"); // only touch zones whose content changed
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(`placements kept ${cfg.placements.length - dropped}, dropped ${dropped}`);
