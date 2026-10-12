// District building-kind detail: finite, in-bounds-ish, deterministic, quality-monotonic, and every kind is distinct.
import assert from "node:assert/strict";
import { buildKindDetail } from "../../apps/web/lib/world-district-kinds.ts";
const KINDS = ["dorm", "lab", "workshop", "classroom", "office", "clinic", "shop", "canteen", "studio", "gym", "lounge", "hall"];
const rec = () => { const r = { n: 0, sig: [] }; const f = (name) => (...v) => { r.n++; for (const x of v) if (typeof x === "number") assert.ok(Number.isFinite(x), name + " non-finite"); else assert.match(x, /^#[0-9a-f]{6}$/i); r.sig.push(name + v.filter((x) => typeof x === "number").map((x) => x.toFixed(2)).join(",")); }; return { r, p: { box: f("b"), cyl: f("c"), sph: f("s"), rbox: f("r"), lbox: f("l"), lsph: f("ls") } }; };
const sigs = new Map();
for (const kind of KINDS) for (const [x, y] of [[161.5, 2], [170.5, 8.5], [123, 14]]) {
  const b = { x, y, w: 7, h: 6.5, height: 3, door: { x: x + 2, w: 3 }, kind };
  const per = {};
  for (const q of ["low", "medium", "high"]) { const a = rec(), c = rec(); buildKindDetail(b, q, a.p); buildKindDetail(b, q, c.p); assert.equal(a.r.n, c.r.n, `${kind} nondeterministic`); assert.ok(a.r.n >= 2, `${kind}/${q} too sparse`); per[q] = a; }
  assert.ok(per.high.r.n >= per.low.r.n, `${kind} high < low`);
  if (x === 161.5) sigs.set(kind, per.high.r.sig.join("|").replace(/\d+\.\d+/g, ""));
}
assert.equal(new Set(sigs.values()).size, KINDS.length, "every kind must have its own silhouette");
console.log("district kinds test passed:", KINDS.length, "kinds");
