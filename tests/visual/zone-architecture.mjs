// Zone architecture unit test: records primitives per zone/quality and sanity-checks them (no GL needed).
import assert from "node:assert/strict";
import { buildZoneArchitecture, ARCHITECTURE_ZONES } from "../../apps/web/lib/world-architecture.ts";
const W = 120, H = 80, ZONE_IDS = ["library", "hostel_street", "food_court", "sports_ground", "event_arena", "creator_hub", "academic_block", "main_gate", "student_commons", "quiet_garden"];
assert.deepEqual([...ARCHITECTURE_ZONES].sort(), [...ZONE_IDS].sort());
const budget = { low: 1100, medium: 1700, high: 2000 };
for (const q of ["low", "medium", "high"]) {
  let total = 0;
  for (const id of ZONE_IDS) {
    let n = 0;
    const chk = (...v) => { n++; for (const x of v) if (typeof x === "number") assert.ok(Number.isFinite(x), `${id}/${q} non-finite`); };
    const inb = (x, z) => assert.ok(x >= -1 && x <= W + 1 && z >= -1 && z <= H + 6, `${id}/${q} out of world (${x},${z})`);
    assert.ok(buildZoneArchitecture(id, q, {
      box: (x, z, w, d, h, c, y = 0) => { chk(x, z, w, d, h, y); inb(x, z); inb(x + w, z + d); assert.ok(w > 0 && d > 0 && h > 0, `${id} degenerate box`); assert.match(c, /^#[0-9a-f]{6}$/i, `${id} bad colour ${c}`); },
      cyl: (x, z, w, h, c, y = 0) => { chk(x, z, w, h, y); inb(x, z); assert.ok(w > 0 && h > 0); assert.match(c, /^#[0-9a-f]{6}$/i); },
      sph: (x, y, z, w, h, d, c) => { chk(x, y, z, w, h, d); inb(x, z); assert.match(c, /^#[0-9a-f]{6}$/i); },
      rbox: (x, y, z, w, h, d, c, r) => { chk(x, y, z, w, h, d, r); inb(x, z); assert.match(c, /^#[0-9a-f]{6}$/i); },
    }));
    assert.ok(n > 25, `${id} too sparse (${n})`);
    total += n;
  }
  assert.ok(total < budget[q] * 1, `${q} primitive budget exceeded: ${total}`);
  console.log(`zone architecture ${q}: ${total} primitives across ${ZONE_IDS.length} zones`);
}
assert.equal(buildZoneArchitecture("nope", "low", {}), false);
console.log("zone architecture test passed");
// Pass I: garden + water tower record sane, in-bounds, finite primitives
import { quietGarden, waterTower } from "../../apps/web/lib/world-architecture.ts";
for (const q of ["low", "medium", "high"]) {
  let n = 0; const ok = (...v) => { n++; for (const x of v) if (typeof x === "number") assert.ok(Number.isFinite(x)); };
  const st = { box: (x, z, w, d, h) => { ok(x, z, w, d, h); assert.ok(w > 0 && d > 0 && h > 0 && x > 95 && x < 119 && z > 38 && z < 66, "garden box in east strip"); }, cyl: (x, z, w, h) => { ok(x, z, w, h); assert.ok(w > 0 && h > 0 && x > 95 && x < 119); }, sph: (x, y, z, w, h, d) => ok(x, y, z, w, h, d), rbox: (x, y, z, w, h, d) => ok(x, y, z, w, h, d), lsph: (x, y, z, w, h, d) => ok(x, y, z, w, h, d) };
  quietGarden(st, q); waterTower(st, q);
  assert.ok(n > 40 && n < 220, `garden primitives ${q}: ${n}`);
  console.log(`garden+tower ${q}: ${n} primitives`);
}
