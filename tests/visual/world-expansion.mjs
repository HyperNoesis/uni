// World expansion check (plain node, no zod/vitest needed): layout invariants, walkability and render-stub budgets.
// Mirrors packages/domain collision rules (WALL=0.8, PLAYER_RADIUS=0.45) so it can run without installing dependencies.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildDistrict } from "../../apps/web/lib/world-districts.ts";
import { buildInterior } from "../../apps/web/lib/world-architecture.ts";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../packages/domain/src/world-data");
const world = JSON.parse(fs.readFileSync(path.join(root, "world.json"), "utf8"));
const zones = fs.readdirSync(path.join(root, "zones")).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(fs.readFileSync(path.join(root, "zones", f), "utf8")));
const WALL = 0.8, R = 0.45;
const inside = (r, o) => r.x >= o.x && r.y >= o.y && r.x + r.w <= o.x + o.w && r.y + r.h <= o.y + o.h;
const overlap = (a, b, pad = 0) => a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;

// ---- layout invariants
const ids = new Set(); const buildings = []; const solids = [];
for (const z of zones) {
  assert.ok(inside(z.rect, { x: 0, y: 0, w: world.width, h: world.height }), `${z.id} outside world`);
  for (const o of zones) if (o !== z) assert.ok(!overlap(z.rect, o.rect), `zones ${z.id} and ${o.id} overlap`);
  for (const b of z.buildings) {
    assert.ok(!ids.has(b.id), `dup building ${b.id}`); ids.add(b.id);
    assert.ok(inside(b, z.rect), `${b.id} outside zone`);
    assert.match(b.id, /^[a-z][a-z0-9_]{1,40}$/); assert.ok(b.name.length <= 40);
    if (b.door) assert.ok(b.door.x >= b.x && b.door.x + b.door.w <= b.x + b.w, `${b.id} door outside walls`);
    buildings.push({ ...b, zone: z.id });
    const s = [{ x: b.x, y: b.y, w: b.w, h: WALL }, { x: b.x, y: b.y, w: WALL, h: b.h }, { x: b.x + b.w - WALL, y: b.y, w: WALL, h: b.h }];
    const sy = b.y + b.h - WALL;
    if (!b.door) s.push({ x: b.x, y: sy, w: b.w, h: WALL }); else { s.push({ x: b.x, y: sy, w: b.door.x - b.x, h: WALL }); s.push({ x: b.door.x + b.door.w, y: sy, w: b.x + b.w - b.door.x - b.door.w, h: WALL }); }
    solids.push(...s);
  }
  for (const p of z.props) solids.push(p);
}
for (let i = 0; i < buildings.length; i++) for (let j = i + 1; j < buildings.length; j++) assert.ok(!overlap(buildings[i], buildings[j]), `buildings ${buildings[i].id} / ${buildings[j].id} overlap`);
const rooms = buildings.filter((b) => b.door);
assert.ok(rooms.length >= 100, `need >= 100 enterable rooms, have ${rooms.length}`);
const blocked = (x, y) => { for (const s of solids) { const cx = Math.min(s.x + s.w, Math.max(s.x, x)), cy = Math.min(s.y + s.h, Math.max(s.y, y)); if ((x - cx) ** 2 + (y - cy) ** 2 < R * R) return true; } return false; };
const defaults = zones.flatMap((z) => z.spawnPoints.filter((s) => s.default)); assert.equal(defaults.length, 1);
// ---- NPC waypoints walkable and legs unobstructed
for (const z of zones) for (const n of z.npcs) {
  const pts = n.path; for (const p of pts) assert.ok(!blocked(p.x, p.y), `${n.id} waypoint blocked`);
  for (let i = 0; i < pts.length - 1; i++) for (let t = 0; t <= 1; t += .05) assert.ok(!blocked(pts[i].x + (pts[i + 1].x - pts[i].x) * t, pts[i].y + (pts[i + 1].y - pts[i].y) * t), `${n.id} leg blocked`);
}
// ---- reachability: BFS on a 0.5 grid from the default spawn must reach the inside of every room
const S = 0.5, GW = Math.ceil(world.width / S), GH = Math.ceil(world.height / S);
const seen = new Uint8Array(GW * GH), q = [Math.round(defaults[0].x / S) + Math.round(defaults[0].y / S) * GW]; seen[q[0]] = 1;
for (let qi = 0; qi < q.length; qi++) { const c = q[qi], cx = c % GW, cy = (c / GW) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue; const k = nx + ny * GW; if (seen[k] || blocked(nx * S, ny * S)) continue; seen[k] = 1; q.push(k); } }
let unreachable = [];
for (const b of rooms) { const px = Math.round((b.x + b.w / 2) / S), py = Math.round((b.y + b.h - WALL - 1) / S); if (!seen[px + py * GW]) unreachable.push(b.id); }
assert.deepEqual(unreachable, [], `rooms unreachable from spawn: ${unreachable.slice(0, 5).join(", ")} (+${Math.max(0, unreachable.length - 5)})`);
// ---- render stubs: finite, in-bounds, within budgets
const budget = { low: 700, medium: 1500, high: 2200 };
for (const qual of ["low", "medium", "high"]) {
  let worst = 0, worstId = "";
  for (const z of zones) {
    if (!["engineering_quarter", "science_complex", "medical_college", "arts_row", "business_law", "hostel_estate_east", "hostel_village", "gate_road", "market_town", "admin_quarter", "research_park", "innovation_village"].includes(z.id)) continue;
    let n = 0; const ok = (...v) => { n++; for (const x of v) if (typeof x === "number") assert.ok(Number.isFinite(x), `${z.id} non-finite`); };
    const inb = (x, zz) => assert.ok(x >= z.rect.x - 4.2 && x <= z.rect.x + z.rect.w + 4.5 && zz >= z.rect.y - 1 && zz <= z.rect.y + z.rect.h + 1, `${z.id}/${qual} prim out of zone (${x},${zz})`);
    const st = { box: (x, zz, w, d, h) => { ok(x, zz, w, d, h); inb(x, zz); assert.ok(w > 0 && d > 0 && h > 0); }, cyl: (x, zz, w, h) => { ok(x, zz, w, h); inb(x, zz); assert.ok(w > 0 && h > 0); }, sph: (x, y, zz, w, h, d) => { ok(x, y, zz, w, h, d); inb(x, zz); }, rbox: (...a) => ok(...a) };
    st.lbox = st.box; st.lsph = st.sph;
    buildDistrict({ id: z.id, rect: z.rect, buildings: z.buildings }, qual, st);
    assert.ok(n > 15, `${z.id} too sparse`); if (n > worst) { worst = n; worstId = z.id; }
    assert.ok(n < budget[qual], `${z.id}/${qual} ${n} prims over ${budget[qual]}`);
  }
  console.log(`districts ${qual}: worst zone ${worstId} = ${worst} primitives`);
}
// interiors: every room kind dresses, stays inside the room, leaves the doorway strip clear
let dressed = 0;
for (const b of rooms.filter((r) => r.kind)) for (const qual of ["low", "high"]) {
  const bad = (x, zz, w, d) => { assert.ok(x >= b.x + WALL - .35 && zz >= b.y + WALL - .35 && x + w <= b.x + b.w - WALL + .35 && zz + d <= b.y + b.h - WALL + .35, `${b.id} interior item out of room (${x},${zz},${w},${d})`); assert.ok(zz + d <= b.y + b.h - 1.4 + .01, `${b.id} interior item blocks doorway strip`); };
  const st = { box: (x, zz, w, d, h) => { assert.ok(w > 0 && d > 0 && h > 0); bad(x, zz, w, d); }, cyl: (x, zz, w) => bad(x - w / 2, zz - w / 2, w, w), sph: (x, y, zz, w, h, d) => bad(x - w / 2, zz - d / 2, w, d), rbox: () => {} };
  st.lbox = st.box; st.lsph = st.sph;
  assert.ok(buildInterior({ id: b.id, x: b.x, y: b.y, w: b.w, h: b.h, height: b.height, kind: b.kind }, st, qual), `${b.id} (${b.kind}) not dressed`); dressed++;
}
console.log(`world ${world.width}x${world.height}: ${zones.length} zones, ${buildings.length} buildings, ${rooms.length} enterable rooms, all reachable from spawn; ${dressed} interior dressings OK`);
