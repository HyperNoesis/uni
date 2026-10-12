// Landmark test (plain node): roof crowns, gateways, lawns and gate-road extras are finite, in-bounds, budgeted and
// consistent with the zone data (lawn solids must equal lawnLayout so visuals and collision cannot drift).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { roofCrown, zoneGateway, southLawn, lawnLayout, lawnRegion, gateRoadExtras, spineGap, LANDMARK_ZONES, LAWN_ZONES, hash01 } from "../../apps/web/lib/world-landmarks.ts";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../packages/domain/src/world-data/zones");
const zones = fs.readdirSync(root).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(fs.readFileSync(path.join(root, f), "utf8")));
const HEX = /^#[0-9a-f]{6}$/i;
function stub(bounds, tally) {
  const ok = (...v) => { tally.n++; for (const x of v) if (typeof x === "number") assert.ok(Number.isFinite(x), "non-finite"); };
  const inb = (x, z) => assert.ok(x >= bounds.x0 && x <= bounds.x1 && z >= bounds.z0 && z <= bounds.z1, `prim out of bounds (${x.toFixed(1)},${z.toFixed(1)}) vs ${JSON.stringify(bounds)}`);
  const st = {
    box: (x, z, w, d, h, c, y = 0) => { ok(x, z, w, d, h, y); inb(x, z); inb(x + w, z + d); assert.ok(w > 0 && d > 0 && h > 0, "degenerate box"); assert.match(c, HEX); assert.ok(y >= -1.2, "box below ground"); },
    cyl: (x, z, w, h, c, y = 0) => { ok(x, z, w, h, y); inb(x, z); assert.ok(w > 0 && h > 0); assert.match(c, HEX); },
    sph: (x, y, z, w, h, d, c) => { ok(x, y, z, w, h, d); inb(x, z); assert.ok(w > 0 && h > 0 && d > 0); assert.match(c, HEX); },
    rbox: (x, y, z, w, h, d, c, r) => { ok(x, y, z, w, h, d, r); inb(x, z); assert.match(c, HEX); },
  };
  st.lbox = st.box; st.lsph = st.sph; return st;
}
// 1. roof crowns: every building, every quality
const budget = { low: 2200, medium: 4200, high: 4800 };
for (const q of ["low", "medium", "high"]) {
  let crowned = 0, total = 0; const t = { n: 0 };
  for (const z of zones) for (const b of z.buildings) {
    const before = t.n;
    const drew = roofCrown({ id: b.id, x: b.x, y: b.y, w: b.w, h: b.h, height: b.height, kind: b.kind }, q, stub({ x0: b.x - 1.2, x1: b.x + b.w + 1.2, z0: b.y - .6, z1: b.y + b.h + .6 }, t), b.height + .42);
    assert.equal(drew, t.n > before, `${b.id}: return value must match drawing`);
    if (drew) { crowned++; assert.ok(t.n - before >= 2 && t.n - before <= 60, `${b.id} crown size ${t.n - before}`); }
  }
  total = t.n; assert.ok(crowned >= 70, `${q}: only ${crowned} buildings crowned`); assert.ok(total <= budget[q], `${q} crown primitives ${total} > ${budget[q]}`);
  console.log(`roof crowns ${q}: ${crowned} buildings, ${total} primitives`);
}
assert.equal(roofCrown({ id: "library_hall", x: 0, y: 0, w: 10, h: 10, height: 3, kind: "hall" }, "low", {}, 3), false, "bespoke buildings are left alone");
assert.equal(hash01("a"), hash01("a"));
// 2. gateways sit in the spine gap and never overlap a building
for (const id of LANDMARK_ZONES) {
  const z = zones.find((o) => o.id === id); assert.ok(z, id + " missing");
  const g = spineGap({ id, rect: z.rect, buildings: z.buildings }); assert.ok(g.x1 - g.x0 >= 3, `${id} spine gap too small`);
  for (const q of ["low", "medium", "high"]) {
    const t = { n: 0 };
    assert.ok(zoneGateway({ id, rect: z.rect, buildings: z.buildings }, q, stub({ x0: g.x0 - 1, x1: g.x1 + 1, z0: z.rect.y - 1, z1: z.rect.y + z.rect.h + 1 }, t)));
    assert.ok(t.n >= 10 && t.n <= 40, `${id}/${q} gateway ${t.n}`);
  }
}
assert.equal(zoneGateway({ id: "library", rect: { x: 0, y: 0, w: 1, h: 1 }, buildings: [] }, "low", {}), false);
// 3. lawns: solids in data == layout; features in bounds; gate road extras
for (const id of LAWN_ZONES) {
  const z = zones.find((o) => o.id === id), maxB = Math.max(...z.buildings.map((b) => b.y + b.h)), L = lawnRegion(z.rect, maxB);
  assert.ok(L && L.h >= 11, id + " lawn region");
  assert.deepEqual(z.props, lawnLayout(id, z.rect, maxB), `${id}: zone props drifted from lawnLayout (run scripts/world/generate-landmark-solids.mjs)`);
  for (const s of z.props) assert.ok(s.x >= L.x - .1 && s.y >= L.y - .1 && s.x + s.w <= L.x + L.w + .1 && s.y + s.h <= L.y + L.h + .1, `${id} solid outside lawn`);
  for (const q of ["low", "medium", "high"]) { const t = { n: 0 }; assert.ok(southLawn(id, z.rect, maxB, q, stub({ x0: z.rect.x, x1: z.rect.x + z.rect.w, z0: L.y - 1, z1: z.rect.y + z.rect.h }, t))); assert.ok(t.n >= 30 && t.n <= 330, `${id}/${q} lawn ${t.n}`); }
}
assert.equal(southLawn("library", { x: 0, y: 0, w: 40, h: 70 }, 10, "low", {}), false);
const gr = zones.find((z) => z.id === "gate_road");
for (const q of ["low", "medium", "high"]) { const t = { n: 0 }; gateRoadExtras(gr.rect, q, stub({ x0: gr.rect.x, x1: gr.rect.x + gr.rect.w, z0: gr.rect.y, z1: gr.rect.y + gr.rect.h }, t)); assert.ok(t.n >= 30 && t.n <= 160, `gate road ${q} ${t.n}`); }
console.log("landmarks test passed");
