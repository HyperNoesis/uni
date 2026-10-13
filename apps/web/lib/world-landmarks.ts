/* CAMPUS district landmarks (static, decorative, visual only; collision lives in domain data).
 *
 * Three layers that give every generated district its own silhouette and identity:
 *   1. roofCrown()      - signature rooftop landmarks per room kind + district (observatory dome, clock tower, cross
 *                         pylon, tower crane, solar field, water tank, billboard...). Baked INTO each building mesh, so
 *                         the crown lifts off with the roof when the player walks in (never floats over an open room).
 *   2. zoneGateway()    - a portal arch across each district's spine with its own emblem and colour band (the sign
 *                         family: colour + silhouette, no baked text).
 *   3. southLawn()      - bespoke features for the three tall districts' spare southern land, with a matching
 *                         parkLayout() solid list that scripts/world/generate-landmark-solids.mjs writes into zone data.
 *   + gateRoadExtras()  - bus shelters, zebra crossings and a wayfinding totem for the building-free Gate Road.
 * Pure + dependency-free: unit-testable with a recording stub. Coordinates: x,z are world tile coords (z == domain "y").
 */
import type { P, Quality } from "./world-architecture";
import { palmTree } from "./world-flora";

const K = {
  white: "#f4f1ea", stone: "#e4d4b9", stoneDk: "#aaa496", navy: "#1f3a6e", blue: "#3675e7", red: "#e8644a", yellow: "#ffd166",
  teal: "#31c4d0", green: "#3f8844", leaf: "#74b050", steel: "#8d98aa", steelDk: "#4a5468", wood: "#916239", woodDk: "#6d4a2e",
  glass: "#8fd3ec", black: "#222831", pink: "#ff8fb3", purple: "#8b6fd6", warm: "#ffe2a0", lamp: "#fff1c4", solar: "#1d3f8a",
  clay: "#c9724a", tank: "#7aa7d9", lawn: "#4aa563", pave: "#cdbf9d", orange: "#e8a24a", gold: "#d9a93c",
};
const FLAGS = [K.blue, K.yellow, K.green, K.red, K.teal, K.purple];
const lit = (p: P, x: number, z: number, w: number, d: number, h: number, c: string, y0 = 0) => (p.lbox ?? p.box).call(p, x, z, w, d, h, c, y0);
const litSph = (p: P, cx: number, cy: number, cz: number, w: number, h: number, d: number, c: string) => (p.lsph ?? p.sph).call(p, cx, cy, cz, w, h, d, c);
/** Deterministic 0..1 hash of a string (FNV-1a). */
export const hash01 = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0) / 4294967295; };
const rnd = (a: number, b: number) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

/* ======================================================================================== roof crowns */
export interface CrownBld { id: string; x: number; y: number; w: number; h: number; height: number; kind?: string | undefined }

function dome(p: P, cx: number, cz: number, y0: number, r: number, band: string, q: Quality) {
  p.cyl(cx, cz, r * 2, .6, K.white, y0); p.cyl(cx, cz, r * 2 + .3, .14, band, y0 + .6);
  p.sph(cx, y0 + .74, cz, r * 2, r * 1.9, r * 2, K.white);
  const n = q === "low" ? 2 : 5;
  for (let i = 0; i < n; i++) { const dy = .35 + i * (r * 1.5 / n), rr = Math.sqrt(Math.max(.05, (r * .96) ** 2 - dy * dy)); p.box(cx - .22, cz + rr - .05, .44, .14, r * 1.5 / n + .02, K.black, y0 + .74 + dy - .1); }
  if (q !== "low") p.cyl(cx, cz, .14, .7, K.steel, y0 + .74 + r * .95);
}
function clockTower(p: P, cx: number, cz: number, y0: number, q: Quality, s = 1) {
  const a = 1.2 * s;
  p.box(cx - a, cz - a, a * 2, a * 2, .9, K.stone, y0);
  p.box(cx - a * .78, cz - a * .78, a * 1.56, a * 1.56, 3.2 * s, K.white, y0 + .9);
  p.box(cx - a * .9, cz - a * .9, a * 1.8, a * 1.8, .22, K.navy, y0 + 4.1 * s);
  const f = a * .5, fy = y0 + 2.5 * s, e = a * .78;
  lit(p, cx - f, cz + e, f * 2, .1, f * 2, K.warm, fy); lit(p, cx - f, cz - e - .1, f * 2, .1, f * 2, K.warm, fy);
  lit(p, cx + e, cz - f, .1, f * 2, f * 2, K.warm, fy); lit(p, cx - e - .1, cz - f, .1, f * 2, f * 2, K.warm, fy);
  p.box(cx - .04, cz + e + .1, .08, .06, f, K.black, fy + f); p.box(cx, cz + e + .1, f * .8, .06, .08, K.black, fy + f);
  p.box(cx - a * .95, cz - a * .95, a * 1.9, a * 1.9, .26, K.navy, y0 + 4.32 * s);
  p.box(cx - a * .7, cz - a * .7, a * 1.4, a * 1.4, .5, K.red, y0 + 4.58 * s);
  if (q === "low") return;
  p.box(cx - a * .4, cz - a * .4, a * .8, a * .8, .5, K.red, y0 + 5.08 * s); p.cyl(cx, cz, .12, 1.2 * s, K.steel, y0 + 5.58 * s); p.sph(cx, y0 + 6.85 * s, cz, .3, .3, .3, K.gold);
}
function crossPylon(p: P, cx: number, cz: number, y0: number, q: Quality) {
  p.box(cx - .25, cz - .25, .5, .5, 2.2, K.white, y0 - .3);
  p.box(cx - 1.15, cz - .22, 2.3, .44, 2.5, K.white, y0 + 1.9);
  lit(p, cx - .3, cz + .22, .6, .1, 2.0, K.red, y0 + 2.15); lit(p, cx - .9, cz + .22, 1.8, .1, .6, K.red, y0 + 2.85);
  lit(p, cx - .3, cz - .32, .6, .1, 2.0, K.red, y0 + 2.15); lit(p, cx - .9, cz - .32, 1.8, .1, .6, K.red, y0 + 2.85);
  if (q !== "low") { p.cyl(cx, cz, .1, 1.0, K.steel, y0 + 4.4); }
}
function waterTank(p: P, cx: number, cz: number, y0: number) {
  for (const [dx, dz] of [[-.6, -.6], [.5, -.6], [-.6, .5], [.5, .5]] as const) p.box(cx + dx, cz + dz, .12, .12, 2.0, K.steelDk, y0 - .9);
  p.box(cx - .8, cz - .8, 1.6, 1.6, .12, K.steelDk, y0 + 1.1);
  p.cyl(cx, cz, 1.5, 1.4, K.tank, y0 + 1.22); p.cyl(cx, cz, 1.6, .1, K.steel, y0 + 1.7); p.sph(cx, y0 + 2.65, cz, 1.3, .35, 1.3, K.steel);
}
function dish(p: P, cx: number, cz: number, y0: number, d = 1.0) { p.cyl(cx, cz, .14, .9, K.steel, y0); p.sph(cx, y0 + 1.0, cz, d, d * .28, d, K.white); p.box(cx - .03, cz - .03, .06, .06, .35, K.steelDk, y0 + 1.0); }
function mast(p: P, cx: number, cz: number, y0: number, h: number, flag?: string) {
  p.cyl(cx, cz, .12, h, K.steel, y0); if (flag) p.box(cx + .06, cz - .03, 1.1, .06, .65, flag, y0 + h - .75); litSph(p, cx, y0 + h + .08, cz, .22, .22, .22, K.red);
}
function sawtooth(p: P, x: number, z: number, w: number, d: number, y0: number, color: string, n = 3) {
  for (let i = 0; i < n; i++) { const sw = w / n; p.box(x + i * sw, z, sw * .62, d, .9 + .35, color, y0); p.box(x + i * sw + sw * .62, z, sw * .38, d, .45, K.glass, y0); }
}
function stack(p: P, cx: number, cz: number, y0: number, h: number, r: number) {
  p.cyl(cx, cz, r, h, K.white, y0); for (let i = 0; i < 3; i++) if (i % 2 === 0) p.cyl(cx, cz, r + .04, h / 5, K.red, y0 + h * .2 + i * h * .3);
  p.cyl(cx, cz, r * 1.2, .14, K.steelDk, y0 + h);
}
function crane(p: P, cx: number, cz: number, y0: number, q: Quality) {
  p.box(cx - .22, cz - .22, .44, .44, 8.2, K.yellow, y0); for (let i = 0; i < 6; i++) p.box(cx - .28, cz - .28, .56, .56, .1, K.steelDk, y0 + .8 + i * 1.3);
  p.box(cx - 2.7, cz - .12, 5.8, .24, .42, K.yellow, y0 + 8.2); p.box(cx - .9, cz - .5, 1.8, 1.0, 1.0, K.steelDk, y0 + 8.62);
  p.box(cx - 2.9, cz - .22, .9, .44, .8, K.steelDk, y0 + 7.9); p.box(cx + 2.2, cz - .03, .05, .06, 2.6, K.black, y0 + 5.6);
  if (q !== "low") { p.box(cx + 2.0, cz - .2, .45, .4, .4, K.red, y0 + 5.2); lit(p, cx - .1, cz - .1, .2, .2, .2, K.red, y0 + 9.65); p.box(cx - .08, cz - .08, .16, .16, 1.0, K.steel, y0 + 8.62 + 1.0); }
}
function solarRow(p: P, x: number, z: number, n: number, y0: number, q: Quality) {
  for (let i = 0; i < n; i++) { p.box(x + i * 1.9, z, 1.7, 1.1, .1, K.solar, y0 + .45); p.box(x + i * 1.9 + .1, z + .1, 1.5, .08, .05, K.glass, y0 + .55); if (q !== "low") p.box(x + i * 1.9 + .8, z + .5, .1, .1, .45, K.steelDk, y0); }
}
function sailMasts(p: P, x: number, z: number, w: number, y0: number, q: Quality) {
  const n = q === "low" ? 2 : 3;
  for (let i = 0; i < n; i++) { const mx = x + (i + .5) * w / n; p.cyl(mx, z, .12, 3.4 + (i % 2) * .7, K.steelDk, y0); p.box(mx + .06, z - .03, 1.3, .06, 1.6, [K.pink, K.yellow, K.teal][i % 3]!, y0 + 1.6 + (i % 2) * .5); }
}
function billboard(p: P, cx: number, cz: number, w: number, y0: number, color: string) {
  p.box(cx - w / 2 + .3, cz - .1, .16, .2, 1.9, K.steelDk, y0); p.box(cx + w / 2 - .46, cz - .1, .16, .2, 1.9, K.steelDk, y0);
  p.box(cx - w / 2, cz - .18, w, .26, 1.3, K.black, y0 + 1.6); lit(p, cx - w / 2 + .12, cz + .08, w - .24, .1, 1.06, color, y0 + 1.72);
}
function tankCluster(p: P, cx: number, cz: number, y0: number) { for (let i = 0; i < 3; i++) { p.cyl(cx - 1.1 + i * 1.1, cz, .9, 1.7, i === 1 ? K.green : K.white, y0); p.sph(cx - 1.1 + i * 1.1, y0 + 1.75, cz, .9, .4, .9, K.steel); } p.box(cx - 1.6, cz - .6, 3.4, .14, .14, K.steelDk, y0 + 1.1); }
function acUnits(p: P, x: number, z: number, n: number, y0: number) { for (let i = 0; i < n; i++) { p.box(x + i * 1.1, z, .9, .7, .7, K.steel, y0); p.box(x + i * 1.1 + .1, z + .68, .7, .05, .5, K.steelDk, y0 + .1); } }
function signboard(p: P, cx: number, cz: number, w: number, y0: number, color: string) {
  p.box(cx - w / 2 + .2, cz - .1, .12, .2, 1.0, K.steelDk, y0 - .2); p.box(cx + w / 2 - .32, cz - .1, .12, .2, 1.0, K.steelDk, y0 - .2);
  p.box(cx - w / 2, cz - .14, w, .28, .95, color, y0 + .7); lit(p, cx - w / 2 + .1, cz + .14, w - .2, .08, .22, K.lamp, y0 + 1.1);
}
function greenRoof(p: P, x: number, z: number, w: number, d: number, y0: number, q: Quality) {
  p.box(x, z, w, d, .3, K.woodDk, y0); p.box(x + .1, z + .1, w - .2, d - .2, .18, K.lawn, y0 + .3);
  if (q !== "low") for (let i = 0; i < 3; i++) p.sph(x + .8 + i * (w - 1.6) / 2, y0 + .9, z + d / 2, .9, .9, .9, K.leaf);
}
function pergola(p: P, x: number, z: number, w: number, d: number, y0: number, color: string) {
  for (const [dx, dz] of [[0, 0], [w - .15, 0], [0, d - .15], [w - .15, d - .15]] as const) p.box(x + dx, z + dz, .15, .15, 1.9, K.wood, y0);
  for (let i = 0; i < 5; i++) p.box(x, z + i * (d - .12) / 4, w, .12, .1, color, y0 + 1.9);
  lit(p, x + .2, z + d / 2 - .05, w - .4, .1, .1, K.lamp, y0 + 1.75);
}

/** Signature rooftop landmark. `top` = height of the surface to build on (flat deck top, or pitched ridge). Returns true if drawn. */
export function roofCrown(b: CrownBld, q: Quality, p: P, top: number): boolean {
  const zone = b.id.split("_")[0] ?? "", kind = b.kind ?? "office", h = hash01(b.id);
  if (!["engineering", "science", "medical", "arts", "business", "hostel", "market", "admin", "research", "innovation"].includes(zone)) return false;
  const cx = b.x + b.w / 2, cz = b.y + b.h / 2, always = kind === "hall" || kind === "clinic" || kind === "lab";
  if (!always && h < .42) return false;
  const lowQ = q === "low";
  switch (zone) {
    case "science":
      if (kind === "lab") { if (h > .4) dome(p, cx, b.y + 2.2, top, 1.55, K.teal, q); else greenRoof(p, b.x + 1.2, b.y + 1.0, b.w - 2.4, 1.6, top, q); }
      else if (kind === "office") { mast(p, b.x + b.w - 1.2, b.y + 1.4, top, 3.6); p.box(b.x + 1.2, b.y + 1.2, 1.4, 1.4, .8, K.steel, top); if (!lowQ) { p.box(b.x + 3.0, b.y + 1.3, 1.2, 1.2, .55, K.white, top); p.cyl(b.x + 3.6, b.y + 1.9, .5, .2, K.teal, top + .55); } }
      else { lit(p, b.x + 1.5, b.y + 1.3, b.w - 3, 1.6, .15, K.glass, top); p.box(b.x + 1.5, b.y + 1.3, b.w - 3, .12, .9, K.white, top); p.box(b.x + 1.5, b.y + 2.78, b.w - 3, .12, .9, K.white, top); }
      return true;
    case "engineering":
      if (kind === "workshop") { sawtooth(p, b.x + 1, b.y + 1.0, b.w - 2, 2.6, top, K.steel, 3); stack(p, b.x + b.w - 1.2, b.y + 4.6, top, 4.4, .7); }
      else if (kind === "lab") { if (h > .5) stack(p, b.x + 1.4, b.y + 1.6, top, 3.6, .8); else tankCluster(p, cx, b.y + 1.6, top); if (!lowQ) acUnits(p, b.x + 3.2, b.y + 3.6, 2, top); }
      else if (h > .55) crane(p, cx, b.y + 2.4, top, q); else { tankCluster(p, cx, b.y + 2, top); }
      return true;
    case "medical":
      if (kind === "clinic") crossPylon(p, cx, cz, top, q);
      else if (kind === "lab") { tankCluster(p, cx, b.y + 1.8, top); if (!lowQ) p.box(b.x + 1, b.y + 3.6, b.w - 2, .16, .55, K.green, top); }
      else greenRoof(p, b.x + 1.2, b.y + 1.0, b.w - 2.4, b.h - 2, top, q);
      return true;
    case "arts":
      if (kind === "studio") sailMasts(p, b.x + 1, b.y + 2, b.w - 2, top, q);
      else if (kind === "office") billboard(p, cx, b.y + 1.5, Math.min(4.2, b.w - 2), top, [K.pink, K.teal, K.yellow][Math.floor(h * 3) % 3]!);
      else pergola(p, b.x + 1.4, b.y + 1.3, b.w - 2.8, 3, top, K.clay);
      return true;
    case "business":
      if (kind === "hall") clockTower(p, cx, cz, top, q, b.w > 10 ? 1.2 : 1);
      else if (kind === "office") { lit(p, b.x + .8, b.y + 1.4, b.w - 1.6, .2, .45, K.green, top + .5); lit(p, b.x + .8, b.y + 1.4, (b.w - 1.6) * .55, .2, .45, K.red, top + .5); acUnits(p, b.x + 1, b.y + 3.2, 2, top); mast(p, b.x + b.w - 1, b.y + 2.4, top, 3.2, K.navy); }
      else { for (let i = 0; i < 6; i++) p.box(b.x + .8 + i * (b.w - 1.8) / 5, b.y + b.h - 1.2, .22, .22, .9, K.white, top); mast(p, cx, b.y + 2, top, 4, K.blue); }
      return true;
    case "hostel":
      if (kind === "dorm") { waterTank(p, b.x + b.w * (h > .5 ? .3 : .7), cz, top); if (!lowQ) dish(p, b.x + b.w * (h > .5 ? .72 : .28), cz, top, 1.0); }
      else mast(p, cx, cz, top, 3, FLAGS[Math.floor(h * 6) % 6]);
      return true;
    case "market":
      if (kind === "shop" || kind === "canteen") { signboard(p, cx, cz, Math.min(b.w - 1.4, 5), top, [K.red, K.yellow, K.teal, K.pink, K.orange][Math.floor(h * 5) % 5]!); if (!lowQ) { for (let i = 0; i < 4; i++) p.box(b.x + 1.2 + i * 1.5, b.y + b.h - .05, .9, .08, .08, FLAGS[(i + Math.floor(h * 6)) % 6]!, 2.45); } }
      else { acUnits(p, b.x + 1.4, b.y + 1.6, 2, top); mast(p, b.x + b.w - 1.2, b.y + 1.4, top, 3); }
      return true;
    case "admin":
      if (kind === "hall") { dome(p, cx, cz, top, Math.min(b.h, b.w) * .27, K.gold, q); mast(p, b.x + 1, b.y + 1, top, 4.6, K.blue); mast(p, b.x + b.w - 1, b.y + 1, top, 4.6, K.yellow); }
      else if (kind === "office") { mast(p, b.x + 1.3, b.y + 1.5, top, 5.6, K.blue); if (!lowQ) { acUnits(p, b.x + 3.4, b.y + 2, 2, top); dish(p, b.x + b.w - 1.4, b.y + 1.6, top, .9); } }
      else greenRoof(p, b.x + 1.2, b.y + 1.0, b.w - 2.4, b.h - 2, top, q);
      return true;
    case "research":
      if (kind === "lab") { solarRow(p, b.x + 1, b.y + 1.0, 3, top, q); solarRow(p, b.x + 1, b.y + 2.8, 3, top, q); if (!lowQ) dish(p, b.x + b.w - 1.2, b.y + b.h - 1.4, top, 1.0); }
      else if (kind === "hall") { p.cyl(cx, cz, 4.4, .5, K.white, top); p.sph(cx, top + .5, cz, 4.2, 3.6, 4.2, K.white); litSph(p, cx, top + 1.2, cz, 4.3, .14, 4.3, K.teal); }
      else { mast(p, cx, cz, top, 6.5); p.box(cx - 1.3, cz - .05, 2.6, .1, .1, K.steel, top + 5.2); p.box(cx - .9, cz - .05, 1.8, .1, .1, K.steel, top + 4.2); acUnits(p, b.x + 1, b.y + 3.4, 2, top); }
      return true;
    case "innovation":
      if (kind === "studio") billboard(p, cx, b.y + 1.5, Math.min(4.6, b.w - 1.6), top, [K.pink, K.purple, K.teal][Math.floor(h * 3) % 3]!);
      else if (kind === "office") { p.box(b.x + 1.2, b.y + 1.2, 2.6, 2.4, 2.4, K.orange, top); p.box(b.x + 1.35, b.y + 1.0, 2.3, .1, 1.6, K.glass, top + .5); p.box(b.x + 4, b.y + 1.2, 2.2, 2.4, 1.2, K.teal, top); }
      else if (kind === "gym") { for (const sx of [b.x + 1, b.x + b.w - 1.2]) p.box(sx, b.y + 1.2, .2, .2, 3.2, K.steelDk, top); p.box(b.x + 1, b.y + 1.15, b.w - 2, .3, .5, K.black, top + 3.0); lit(p, b.x + 1.2, b.y + 1.45, b.w - 2.4, .08, .3, K.yellow, top + 3.1); }
      else pergola(p, b.x + 1.4, b.y + 1.3, b.w - 2.8, 3, top, K.purple);
      return true;
  }
  return false;
}

/* ======================================================================================== gateways */
export interface LandZone { id: string; rect: { x: number; y: number; w: number; h: number }; buildings: readonly { x: number; y: number; w: number; h: number }[] }
const GATE: Record<string, { accent: string; emblem: "atom" | "cross" | "gear" | "palette" | "scales" | "house" | "star" | "bulb" | "stall" | "dish" }> = {
  engineering_quarter: { accent: K.blue, emblem: "gear" }, science_complex: { accent: K.teal, emblem: "atom" }, medical_college: { accent: K.red, emblem: "cross" },
  arts_row: { accent: K.clay, emblem: "palette" }, business_law: { accent: K.purple, emblem: "scales" }, hostel_estate_east: { accent: K.orange, emblem: "house" },
  hostel_village: { accent: K.yellow, emblem: "house" }, market_town: { accent: K.pink, emblem: "stall" }, admin_quarter: { accent: K.navy, emblem: "star" },
  research_park: { accent: K.teal, emblem: "dish" }, innovation_village: { accent: K.purple, emblem: "bulb" },
};
export const LANDMARK_ZONES = Object.keys(GATE);

/** Open spine gap [x0,x1] between the building columns either side of the zone centreline. */
export function spineGap(z: LandZone): { x0: number; x1: number; cx: number } {
  const cx = z.rect.x + z.rect.w / 2; let x0 = z.rect.x + 1, x1 = z.rect.x + z.rect.w - 1;
  for (const b of z.buildings) { if (b.x + b.w <= cx + .01) x0 = Math.max(x0, b.x + b.w); else if (b.x >= cx - .01) x1 = Math.min(x1, b.x); }
  return { x0, x1, cx };
}
function emblem(p: P, kind: string, cx: number, y0: number, z: number, accent: string) {
  switch (kind) {
    case "atom": litSph(p, cx, y0 + .5, z, .5, .5, .5, K.warm); p.box(cx - .7, z - .05, 1.4, .1, .1, accent, y0 + .45); p.box(cx - .05, z - .05, .1, .1, 1.4, accent, y0 - .2); break;
    case "cross": lit(p, cx - .17, z - .05, .34, .1, 1.1, K.red, y0 - .05); lit(p, cx - .55, z - .05, 1.1, .1, .34, K.red, y0 + .33); break;
    case "gear": p.cyl(cx, z, 1.0, .2, K.steelDk, y0); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 4; p.rbox(cx, y0 + .1, z, 1.35, .2, .24, K.steelDk, a); } break;
    case "palette": p.cyl(cx, z, 1.2, .16, K.wood, y0); for (let i = 0; i < 3; i++) litSph(p, cx - .3 + i * .3, y0 + .22, z, .22, .12, .22, [K.red, K.yellow, K.teal][i]!); break;
    case "scales": p.box(cx - .04, z - .04, .08, .08, 1.0, K.gold, y0); p.box(cx - .6, z - .04, 1.2, .06, .06, K.gold, y0 + .95); p.cyl(cx - .55, z, .42, .05, K.gold, y0 + .55); p.cyl(cx + .55, z, .42, .05, K.gold, y0 + .55); break;
    case "house": p.box(cx - .45, z - .1, .9, .2, .6, K.white, y0); p.box(cx - .55, z - .12, 1.1, .24, .12, accent, y0 + .6); p.box(cx - .35, z - .12, .7, .24, .1, accent, y0 + .72); lit(p, cx - .08, z + .1, .16, .05, .3, K.warm, y0); break;
    case "star": for (let i = 0; i < 4; i++) p.rbox(cx, y0 + .5, z, 1.2, .14, .14, K.gold, i * Math.PI / 4); litSph(p, cx, y0 + .5, z, .28, .28, .28, K.warm); break;
    case "bulb": litSph(p, cx, y0 + .6, z, .7, .7, .7, K.warm); p.cyl(cx, z, .3, .3, K.steel, y0); break;
    case "stall": p.box(cx - .6, z - .1, 1.2, .2, .1, K.red, y0 + .6); p.box(cx - .6, z - .1, .4, .2, .1, K.yellow, y0 + .6); p.box(cx + .2, z - .1, .4, .2, .1, K.teal, y0 + .6); p.box(cx - .5, z - .08, .06, .06, .6, K.steelDk, y0); p.box(cx + .44, z - .08, .06, .06, .6, K.steelDk, y0); break;
    case "dish": p.cyl(cx, z, .12, .5, K.steel, y0); p.sph(cx, y0 + .75, z, 1.0, .3, 1.0, K.white); break;
  }
}
/** Portal arch across the district spine at its entry end, with the district's emblem and colour band. */
export function zoneGateway(zone: LandZone, q: Quality, p: P): boolean {
  const g = GATE[zone.id]; if (!g || !zone.buildings.length) return false;
  const { x0, x1, cx } = spineGap(zone), { y, h } = zone.rect;
  const minY = Math.min(...zone.buildings.map((b) => b.y)), maxB = Math.max(...zone.buildings.map((b) => b.y + b.h));
  const avTop = minY - y >= 5 || h > 45, z = avTop ? minY - 1.2 : maxB + 2.4;
  const a = x0 + .3, b2 = x1 - .75, spanW = b2 - a + .45;
  for (const px of [a, b2]) { p.box(px, z, .45, .45, 3.7, K.white); p.box(px - .1, z - .1, .65, .65, .35, K.stoneDk); p.box(px - .08, z - .08, .61, .61, .2, K.stone, 3.7); }
  p.box(a - .25, z - .12, spanW + .5, .7, .5, g.accent, 3.65); p.box(a - .25, z - .12, spanW + .5, .7, .12, K.white, 4.15);
  lit(p, a + .2, z + .6, spanW - .4, .06, .1, K.lamp, 3.7);
  p.box(cx - .6, z - .06, 1.2, .58, 1.1, K.navy, 4.27); emblem(p, g.emblem, cx, 4.45, z + .55, g.accent);
  if (q !== "low") for (const [fx, c] of [[a + .05, g.accent], [b2 + .05, K.yellow]] as const) { p.cyl(fx + .17, z + .2, .08, 2.4, K.steel, 4.3 - .2 + .1); p.box(fx + .21, z + .17, .6, .05, .5, c, 5.9); }
  return true;
}

/* ======================================================================================== gate road */
export function gateRoadExtras(rect: { x: number; y: number; w: number; h: number }, q: Quality, p: P): void {
  const { x, y, w, h } = rect, cx = x + w / 2, lowQ = q === "low";
  for (const zy of [y + 14, y + 46]) { for (let i = 0; i < 8; i++) p.box(cx - 4 + i, zy, .55, 2.4, .03, K.white, .08); }
  for (const [sx, sy, side] of [[x + 3.2, y + 30, 1], [x + w - 6.4, y + 56, -1]] as const) { // covered shuttle waiting shelters
    p.box(sx, sy, 3.4, 1.7, .14, K.teal, 2.5); for (const dx of [0, 3.2]) p.box(sx + dx, sy + (side > 0 ? 0 : 1.5), .14, .14, 2.5, K.steelDk);
    p.box(sx, sy + (side > 0 ? 0 : 1.6), 3.4, .08, 1.5, K.glass, .8); p.box(sx + .3, sy + .6, 2.8, .45, .1, K.wood, .45); if (!lowQ) { lit(p, sx + 1.2, sy + .85, 1, .06, .35, K.lamp, 2.0); p.box(sx + 3.5, sy + .4, .5, .5, .55, K.green, 0); }
  }
  const tx = x + w - 5.2, ty = y + 22; // wayfinding totem: one arrow plate per destination
  p.cyl(tx, ty, .22, 3.6, K.steelDk); litSph(p, tx, 3.75, ty, .4, .3, .4, K.lamp);
  const plates: [string, number][] = [[K.blue, 3.1], [K.red, 2.5], [K.purple, 1.9], [K.green, 1.3]];
  plates.forEach(([c, py], i) => { const dir = i % 2 ? -1 : 1; p.box(tx - (dir > 0 ? .1 : 1.5), ty - .05, 1.6, .1, .42, c, py); p.box(tx + (dir > 0 ? 1.5 : -1.7), ty - .05, .2, .1, .42, c, py); });
  if (!lowQ) for (let ly = y + 14; ly < y + h - 8; ly += 12) for (const sd of [-1, 1]) { // planted kerb strips with shrubs and a flower band, outside the walking lanes
    const px = cx + sd * 9.4; p.box(px - .55, ly, 1.1, 5.2, .22, K.stone); p.box(px - .45, ly + .1, .9, 5.0, .06, K.leaf, .22);
    p.sph(px, .6, ly + 1.2, .9, .6, .9, K.green); p.sph(px, .6, ly + 3.6, .9, .6, .9, K.leaf); p.box(px - .3, ly + 2.2, .6, .5, .12, FLAGS[(Math.floor(ly / 12) + (sd > 0 ? 2 : 0)) % 6]!, .3);
  }
  if (!lowQ) for (let ly = y + 8; ly < y + h - 4; ly += 12) { p.cyl(cx - 7.4, ly, .1, 3.4, K.steel); p.box(cx - 7.3, ly - .03, .6, .05, 1.1, FLAGS[Math.floor(ly / 12) % 6]!, 1.8); }
}

/* ======================================================================================== south lawns */
export interface LawnProp { kind: "tree" | "palm" | "pillar" | "bench" | "stage" | "block"; x: number; y: number; w: number; h: number }
export const LAWN_ZONES = ["admin_quarter", "research_park", "innovation_village"] as const;
const r2 = (n: number) => Math.round(n * 100) / 100;
/** The spare southern land that world-districts' default park used to dress. null when the zone has none. */
export function lawnRegion(rect: { x: number; y: number; w: number; h: number }, maxB: number) {
  const py = maxB + 6, ph = rect.y + rect.h - py - 1.5;
  return ph >= 11 ? { x: rect.x + 2, y: py, w: rect.w - 4, h: ph, cx: rect.x + rect.w / 2, my: py + ph / 2 } : null;
}
const tr = (cx: number, cy: number, s = 1.2): LawnProp => ({ kind: "tree", x: r2(cx - s / 2), y: r2(cy - s / 2), w: s, h: s });
const pl = (cx: number, cy: number, s = 1): LawnProp => ({ kind: "palm", x: r2(cx - s / 2), y: r2(cy - s / 2), w: s, h: s });
const pi = (cx: number, cy: number, s = .4): LawnProp => ({ kind: "pillar", x: r2(cx - s / 2), y: r2(cy - s / 2), w: s, h: s });
const bn = (cx: number, cy: number, w = 3.2): LawnProp => ({ kind: "bench", x: r2(cx - w / 2), y: r2(cy - .25), w, h: .5 });
/** Collision footprints for each lawn (written into zone JSON by scripts/world/generate-landmark-solids.mjs; kept clear of the spine lane). */
export function lawnLayout(zoneId: string, rect: { x: number; y: number; w: number; h: number }, maxB: number): LawnProp[] {
  const L = lawnRegion(rect, maxB); if (!L) return [];
  const { x, y, w, h, cx, my } = L;
  if (zoneId === "admin_quarter") return [
    pi(cx, my, 1.4), pi(cx - 5, my - 3, .3), pi(cx + 5, my - 3, .3), pi(cx - 5, my + 3, .3), pi(cx + 5, my + 3, .3),
    bn(cx - 9, my), bn(cx + 9, my), bn(cx - 4.5, y + h - 1.4), bn(cx + 4.5, y + h - 1.4),
    tr(x + 3.5, y + 3), tr(x + w - 3.5, y + 3), tr(x + 3.5, y + h - 3), tr(x + w - 3.5, y + h - 3), pl(cx - 13, my), pl(cx + 13, my), pl(cx - 13, y + 2.5), pl(cx + 13, y + 2.5),
  ];
  if (zoneId === "research_park") return [
    ...[-14, -9.5, 9.5, 14].flatMap((dx) => [pi(cx + dx, my - 3.5, .35), pi(cx + dx, my + 3.5, .35)]),
    { kind: "block", x: r2(cx + 8), y: r2(y + 2), w: 1.8, h: 1.8 }, pi(cx - 9, y + 3, .6),
    tr(x + 3, y + 3), tr(x + w - 3, y + h - 3), tr(x + 3, y + h - 3), bn(cx, y + h - 1.5),
  ];
  if (zoneId === "innovation_village") return [
    { kind: "stage", x: r2(cx - 5), y: r2(y + 2), w: 10, h: 3.4 }, { kind: "block", x: r2(x + 2.5), y: r2(my - 1), w: 6, h: 2.4 }, { kind: "block", x: r2(x + w - 8.5), y: r2(my - 1), w: 6, h: 2.4 },
    pi(x + 10, my - 4, .3), pi(x + w - 10, my - 4, .3), pi(x + 10, y + h - 3, .3), pi(x + w - 10, y + h - 3, .3),
    tr(x + 3, y + h - 2.8), tr(x + w - 3, y + h - 2.8), bn(cx - 5, y + h - 2.2), bn(cx + 5, y + h - 2.2),
  ];
  return [];
}
function lawnTree(p: P, c: LawnProp, q: Quality) { const cx = c.x + c.w / 2, cz = c.y + c.h / 2, s = .8 + rnd(cx, cz) * .35; p.cyl(cx, cz, .3 * s, 1.6 * s, K.woodDk); p.sph(cx, 2.2 * s, cz, 2.3 * s, 1.9 * s, 2.3 * s, ["#2a8653", "#3f8844", "#277a5b", "#4d9f55"][Math.floor(rnd(cz, cx) * 4)]!); if (q !== "low") p.sph(cx + .5 * s, 2.7 * s, cz - .3 * s, 1.3 * s, 1.1 * s, 1.3 * s, K.leaf); }
function lawnPalm(p: P, c: LawnProp) { palmTree(p, c.x + c.w / 2, c.y + c.h / 2, 4.4); }
function lawnBench(p: P, c: LawnProp) { p.box(c.x, c.y, c.w, c.h, .08, K.wood, .45); p.box(c.x + .1, c.y, .14, c.h, .45, K.woodDk); p.box(c.x + c.w - .24, c.y, .14, c.h, .45, K.woodDk); p.box(c.x, c.y + (c.h > .5 ? 0 : .38), c.w, .08, .45, K.wood, .5); }
function lamp(p: P, x: number, z: number) { p.cyl(x, z, .14, 3.2, K.steelDk); litSph(p, x, 3.3, z, .4, .3, .4, K.lamp); }

export function southLawn(zoneId: string, rect: { x: number; y: number; w: number; h: number }, maxB: number, q: Quality, p: P): boolean {
  const L = lawnRegion(rect, maxB); if (!L || !(LAWN_ZONES as readonly string[]).includes(zoneId)) return false;
  const { x, y, w, h, cx, my } = L, lowQ = q === "low";
  p.box(x, y, w, h, .05, K.lawn);
  p.box(cx - 1.6, y, 3.2, h, .07, K.pave); p.box(x, my - 1.6, w, 3.2, .07, K.pave);
  const props = lawnLayout(zoneId, rect, maxB);
  for (const c of props) { if (c.kind === "tree") lawnTree(p, c, q); else if (c.kind === "palm") lawnPalm(p, c); else if (c.kind === "bench") lawnBench(p, c); }
  if (zoneId === "admin_quarter") { // Convocation Green: ring plaza, stepped obelisk, four campus flags
    p.cyl(cx, my, 11, .08, K.pave); p.cyl(cx, my, 7.2, .2, K.stone); p.cyl(cx, my, 5.6, .2, K.white, .2); p.box(cx - 1.3, my - 1.3, 2.6, 2.6, .5, K.stone, .4); p.box(cx - .95, my - .95, 1.9, 1.9, 1.0, K.white, .9);
    p.box(cx - .6, my - .6, 1.2, 1.2, 4.2, K.white, 1.9); p.box(cx - .45, my - .45, .9, .9, 1.4, K.white, 6.1); p.box(cx - .25, my - .25, .5, .5, .7, K.white, 7.5); litSph(p, cx, 8.4, my, .45, .6, .45, K.warm);
    p.box(cx - .62, my + .6, 1.24, .08, .5, K.navy, 4.0); p.box(cx - .62, my - .68, 1.24, .08, .5, K.navy, 4.0);
    [[-5, -3], [5, -3], [-5, 3], [5, 3]].forEach(([dx, dz], i) => { p.cyl(cx + dx!, my + dz!, .22, 6.2, K.steel); p.box(cx + dx! + .1, my + dz! - .04, 1.7, .06, .95, FLAGS[i % 4]!, 5.1); litSph(p, cx + dx!, 6.4, my + dz!, .3, .3, .3, K.gold); });
    if (!lowQ) for (let i = 0; i < 6; i++) { lamp(p, cx - 7.5 + (i % 2) * 15, y + 2 + Math.floor(i / 2) * (h - 4) / 2); }
  } else if (zoneId === "research_park") { // Solar field + radio dish + wind turbine
    for (const dx of [-11.75, 11.75]) {
      const sx = cx + dx - 2.25; p.box(sx, my - 3.5, 4.5, 7, .12, K.solar, 2.7); p.box(sx + .1, my - 3.4, 4.3, .08, .05, K.glass, 2.85); for (let i = 1; i < 4; i++) p.box(sx + i * 1.12, my - 3.5, .05, 7, .06, K.glass, 2.83);
      lit(p, sx, my + 3.4, 4.5, .1, .1, K.teal, 2.6);
    }
    for (const dx of [-14, -9.5, 9.5, 14]) for (const dz of [-3.5, 3.5]) p.box(cx + dx - .17, my + dz - .17, .34, .34, 2.7, K.steelDk);
    const dxp = cx + 8.9, dzp = y + 2.9; p.box(dxp - .9, dzp - .9, 1.8, 1.8, .6, K.stoneDk); p.cyl(dxp, dzp, .5, 2.4, K.white, .6); p.sph(dxp, 3.6, dzp, 4.2, 1.1, 4.2, K.white); p.sph(dxp, 3.5, dzp, 3.9, .6, 3.9, K.steel); p.cyl(dxp, dzp, .14, 1.6, K.steel, 3.6); litSph(p, dxp, 5.4, dzp, .3, .3, .3, K.red);
    const tx = cx - 9, tz = y + 3; p.cyl(tx, tz, .45, 8.5, K.white); p.box(tx - .3, tz - .3, .6, .6, .5, K.steelDk, 8.4); p.box(tx - .08, tz - .5, .16, .08, 3.1, K.white, 8.9); p.box(tx - 1.4, tz - .5, 1.5, .08, .16, K.white, 9.6); p.box(tx, tz - .5, 1.7, .08, .16, K.white, 8.5);
    p.box(cx - 3, y + h - 3, 6, .14, .06, K.glass, .08); // open-air lab bench plaza
    if (!lowQ) for (let i = 0; i < 3; i++) lamp(p, cx - 3 + i * 3, y + h - 4.2);
  } else if (zoneId === "innovation_village") { // Maker yard: container stage, container pods, string lights
    const sx = cx - 5, sz = y + 2; p.box(sx, sz, 10, 3.4, .5, K.wood); p.box(sx, sz, 10, .3, 3.4, K.black, .5); p.box(sx - .2, sz - .2, 10.4, 3.8, .14, K.purple, 4.1);
    for (let i = 0; i < 5; i++) lit(p, sx + .8 + i * 2, sz + 3.0, .8, .5, .2, [K.pink, K.teal, K.yellow, K.purple, K.red][i]!, 3.9); p.box(sx - .2, sz - .2, .3, .3, 3.6, K.steelDk, .5); p.box(sx + 9.9, sz - .2, .3, .3, 3.6, K.steelDk, .5);
    lit(p, sx + 1, sz + .1, 8, .08, .9, K.purple, 2.2);
    const pods: [number, string][] = [[x + 2.5, K.orange], [x + w - 8.5, K.teal]];
    for (const [px, c] of pods) { p.box(px, my - 1, 6, 2.4, 2.4, c); p.box(px + .4, my + 1.38, 2.2, .06, 1.5, K.glass, .5); p.box(px + 3.2, my + 1.38, 2.4, .06, 1.5, K.white, .5); p.box(px, my - 1, 6, 2.4, .14, K.steelDk, 2.4); if (!lowQ) { p.box(px + 1.5, my - .8, 3, 2.0, 1.2, FLAGS[Math.floor(px) % 6]!, 2.54); } }
    for (const [lx, lz] of [[x + 10, my - 4], [x + w - 10, my - 4], [x + 10, y + h - 3], [x + w - 10, y + h - 3]] as const) p.cyl(lx, lz, .16, 3.8, K.steelDk);
    for (const wz of [my - 4, y + h - 3]) p.box(x + 10, wz - .02, w - 20, .04, .04, K.steelDk, 3.45);
    if (!lowQ) for (let i = 0; i < 9; i++) { const t = i / 8; litSph(p, x + 10 + t * (w - 20), 3.5 - Math.sin(t * Math.PI) * .5, my - 4, .22, .22, .22, FLAGS[i % 6]!); litSph(p, x + 10 + t * (w - 20), 3.5 - Math.sin(t * Math.PI) * .5, y + h - 3, .22, .22, .22, FLAGS[(i + 2) % 6]!); }
  }
  return true;
}
