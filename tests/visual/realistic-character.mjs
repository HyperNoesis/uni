// Realistic textured bodies (campus_m / campus_f): parse, budgets, shared rig and clips, atlas + mask present, LOD smaller.
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseSkinnedGlb } from "../../apps/web/lib/skinned-glb.ts";
import { CHARACTER_LIMITS } from "../../apps/web/lib/skinned-character.ts"; // the exact limits the game loads with
const dir = new URL("../../apps/web/public/assets/characters/", import.meta.url);
const load = (f) => { const b = fs.readFileSync(new URL(f, dir)); assert.ok(b.byteLength <= CHARACTER_LIMITS.maxBytes, `${f} within byte budget (${b.byteLength})`); return parseSkinnedGlb(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), CHARACTER_LIMITS); };
const M = {};
for (const k of ["m", "f"]) {
  const full = load(`campus_${k}.glb`), lod = load(`campus_${k}_lod.glb`);
  M[k] = full;
  assert.ok(full.uvs && full.uvs.length === full.vertexCount * 2, `${k}: UVs`);
  assert.ok(full.atlas, `${k}: atlas info`);
  for (const f of [full.atlas.albedo, full.atlas.mask]) assert.ok(fs.existsSync(new URL(f.split("/").pop(), dir)), `${k}: ${f} exists`);
  assert.ok(lod.vertexCount < full.vertexCount, `${k}: LOD lighter than full`);
  assert.equal(lod.jointCount, full.jointCount, `${k}: LOD shares skeleton`);
  assert.ok(full.bodyHeight === 0 || (full.bodyHeight > 1.4 && full.bodyHeight < 2.1), `${k}: sane body height`);
  for (const c of ["Idle", "Walk", "Jog", "Sprint"]) assert.ok(Object.keys(full.clips).some((x) => x.toLowerCase().includes(c.toLowerCase())), `${k}: clip ${c}`);
  assert.ok(Object.values(full.clips).every((c) => c.duration > 0 && c.tracks.every((t) => t.values.every(Number.isFinite))), `${k}: clips finite`);
}
assert.equal(M.m.jointCount, M.f.jointCount, "m/f share one rig so clips are interchangeable");
console.log("realistic-character ok");
