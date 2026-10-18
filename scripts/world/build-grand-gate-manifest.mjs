#!/usr/bin/env node
/* Grand Gate v2 placement manifest. Rewrites ONLY the gate-area decor (y >= 126) of gate_road.json and registers the v2 GLBs in assets.json.
 * Boulevard decor (y < 126) is preserved untouched. World IDs, spawn, NPCs and colliders are not modified. Deterministic and idempotent.
 * Run from repo root: node scripts/world/build-grand-gate-manifest.mjs   (after node scripts/models/build-grand-gate.mjs)
 * Coordinates: x, y = domain tiles (y == world z). Gate centre (60,132); FRONT/arrival side faces +y; model rot 0 = front toward +y.
 */
import fs from "node:fs";
const ZP = "packages/domain/src/world-data/zones/gate_road.json", AP = "packages/domain/src/world-data/assets.json", KP = "docs/evidence/grand-gate-kit.json";
const CX = 60, GY = 132, PI = 3.142;
const zone = JSON.parse(fs.readFileSync(ZP, "utf8")), assets = JSON.parse(fs.readFileSync(AP, "utf8")), kit = JSON.parse(fs.readFileSync(KP, "utf8")).report;
const D = [];
const add = (model, x, y, rot) => D.push(rot ? { model, x: +x.toFixed(2), y: +y.toFixed(2), rot } : { model, x: +x.toFixed(2), y: +y.toFixed(2) });
const both = (model, dx, y, rotL = PI, rotR = 0) => { add(model, CX - dx, y, rotL); add(model, CX + dx, y, rotR); };

add("gate_plaza", CX, GY + 6);                       // arrival court 80 x 24, y 126..150
both("gate_tower", 15.0, GY, 0, 0);                  // paired pylons (28 m), 20 m clear lane between inner faces
add("gate_span", CX, GY);                            // roof bridge + crest
add("gate_letters_grand", CX, GY + 4.28);            // one dominant sign, front
add("gate_letters_grand", CX, GY - 4.28, PI);        // matching sign on the campus side
both("gate_wing", 20.4, GY, PI, 0);                  // stepping screen walls
both("gate_pool", 15.6, GY + 14.5, 0, 0);            // twin reflecting pools + fountains flank the lane
both("gate_pavilion", 25, GY + 10.8, 0, 0);          // gatehouse + welcome desk, off-axis (vista stays open)
both("gate_boom", 10.2, GY + 9, 0, PI);
for (const dx of [32, 35.5, 39]) both("gate_mast", dx, GY + 9.5, PI, 0);
for (const y of [GY + 7.5, GY + 17.5, GY - 7.5]) both("gate_lamp_tall", 11.6, y, 0, 0);
both("gate_kiosk", 30, GY + 15.8, 0, 0);
both("gate_monument", 35, GY + 16.8, 0, 0);
for (const dx of [27, 35]) both("gate_garden_bed", dx, GY + 2.6, 0, 0);
for (const dx of [24, 29, 34, 39]) both("palm_royal_tall", dx, GY - 4, 0, 0); // green backdrop behind the wings
both("palm_royal_tall", 17.5, GY - 9, 0, 0); both("palm_royal_tall", 44, GY + 5, 0, 0);
both("tree_neem", 46, GY + 10, 0, 0); both("tree_neem", 43, GY + 17, 0, 0);

const keep = zone.decor.filter((d) => d.y < 126); // boulevard stays exactly as authored
zone.decor = [...keep, ...D];
fs.writeFileSync(ZP, JSON.stringify(zone, null, 2) + "\n");

const have = new Map(assets.assets.map((a) => [a.id, a])); // v1 kit entries stay registered as fallback
for (const k of kit) {
  const y = k.name === "gate_letters_grand" ? 16.18 : k.yOffset; // glyph baseline sits at 16.4 m on the navy fascia
  have.set(k.name, { id: k.name, url: `/assets/gate/${k.name}.glb`, slot: `decor:${k.name}`, zones: ["main_gate", "gate_road"], maxBytes: Math.ceil((k.bytes * 1.12) / 1000) * 1000, maxTriangles: Math.ceil((k.tris * 1.12) / 100) * 100, size: { w: k.size.w, h: k.size.h, d: k.size.d }, yOffset: y });
}
assets.assets = [...have.values()];
const tot = assets.assets.filter((a) => a.url.startsWith("/assets/gate/")).reduce((s, a) => ({ b: s.b + a.maxBytes, t: s.t + a.maxTriangles }), { b: 0, t: 0 });
assets.residentBudget = { maxBytes: Math.max(assets.residentBudget.maxBytes, 8000000), maxTriangles: Math.max(assets.residentBudget.maxTriangles, 170000) };
fs.writeFileSync(AP, JSON.stringify(assets, null, 2) + "\n");
fs.writeFileSync("docs/evidence/grand-gate-placements.json", JSON.stringify({ gateCentre: [CX, GY], newGateAreaPlacements: D, keptBoulevard: keep.length, declaredGateKitBudget: tot }, null, 1) + "\n");
console.log("decor:", keep.length, "kept +", D.length, "new =", zone.decor.length, "| declared gate-kit budget", JSON.stringify(tot));
