// Painted-character contract: every avatar option maps to a palette + existing geometry groups; no option is silently invisible.
import assert from "node:assert/strict";
import fs from "node:fs";
import { AVATAR_OPTIONS, AVATAR_PRESETS } from "../../packages/domain/src/avatar.ts";
import { parseSkinnedGlb } from "../../apps/web/lib/skinned-glb.ts";
import { paletteFor, groupsFor, paintVertexColors, MAT, MAT_COUNT, hairIsPainted } from "../../apps/web/lib/avatar-paint.ts";

// Wardrobe v2 styles exist only on the realistic bodies (campus_m/f); the painted body is the legacy fallback.
const V2_HAIR = new Set(["ponytail", "puffs"]);
const V2_GROUPS = new Set(["hair_ponytail", "hair_puffs", "acc_round_glasses", "acc_earrings"]);
const LIM = { maxTriangles: 8000, maxJoints: 64 };
for (const f of ["campus_body.glb", "campus_body_lod.glb"]) {
  const b = fs.readFileSync(new URL(`../../apps/web/public/assets/characters/${f}`, import.meta.url));
  const m = parseSkinnedGlb(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), LIM);
  assert.ok(m.paint && m.paint.length === m.vertexCount * 4, `${f} has _PAINT`);
  for (let v = 0; v < m.vertexCount; v++) assert.ok(m.paint[v * 4] < MAT_COUNT, "material id in range");
  const full = f === "campus_body.glb";
  // every hair style / face / accessory / pack the customiser offers must have its geometry in the full body
  for (const h of AVATAR_OPTIONS.hair) if (!V2_HAIR.has(h) && !hairIsPainted(h)) assert.ok(m.groups["hair_" + h], `${f} hair_${h}`);
  if (full) {
    for (const x of AVATAR_OPTIONS.face) assert.ok(m.groups["face_" + x], `face_${x}`);
    for (const x of ["glasses", "sunglasses", "headphones"]) assert.ok(m.groups["acc_" + x], `acc_${x}`);
  }
  for (const g of ["hood", "skirt", "backpack", "satchel", "chain"]) assert.ok(m.groups[g], `${f} ${g}`);
  for (const p of AVATAR_PRESETS) {
    const a = p.avatar, pal = paletteFor(a), col = paintVertexColors(m.paint, m.vertexCount, a);
    assert.equal(pal.length, MAT_COUNT); assert.ok(col.every((x) => x >= 0 && x <= 1.0001 && Number.isFinite(x)), "colours in range");
    for (const g of groupsFor(a)) if (!V2_GROUPS.has(g) && (full || !/^(face|acc)_/.test(g))) assert.ok(m.groups[g], `${p.id}: group ${g} exists`);
  }
}
// outfit styles really differ
const base = { ...AVATAR_PRESETS[0].avatar }, p = (top) => paletteFor({ ...base, top });
assert.notDeepEqual(p("hoodie")[MAT.FOREARM], p("tee")[MAT.FOREARM], "hoodie has long sleeves, tee shows skin");
assert.deepEqual(groupsFor({ ...base, top: "kaftan" }).includes("skirt"), true);
assert.deepEqual(groupsFor({ ...base, top: "hoodie" }).includes("hood"), true);
console.log("avatar-paint ok");
