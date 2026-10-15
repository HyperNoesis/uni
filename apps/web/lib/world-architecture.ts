/* CAMPUS zone architecture (static, decorative).
 *
 * One function per zone composes primitives through a recorder `P`. The renderer bakes the recorded
 * primitives into ONE merged mesh per zone/quality (1 draw call) and releases it on destroy.
 * Unit-testable with a recording stub: call `buildZoneArchitecture(id, q, stub)`.
 *
 * Collision note: everything here is VISUAL ONLY. Walkable collision stays in the domain data
 * (SOLIDS). Pieces are placed on zone edges / forecourts so they never visually contradict a path.
 * Coordinates: x,z are world tile coords (z == domain "y"); heights are metres.
 */
export type Quality = "low" | "medium" | "high";
import { palmTree } from "./world-flora";
export interface P {
  /** box with min-corner footprint (x,z), size (w,d), height h, base y0 */
  box(x: number, z: number, w: number, d: number, h: number, color: string, y0?: number): void;
  /** centred cylinder footprint (cx,cz) diameter w, height h, base y0 */
  cyl(cx: number, cz: number, w: number, h: number, color: string, y0?: number): void;
  /** centred sphere/ellipsoid (cx,cy,cz) size w,h,d */
  sph(cx: number, cy: number, cz: number, w: number, h: number, d: number, color: string): void;
  /** optional rotated ellipsoid (rot about Y), used for leaf blades */
  rsph?(cx: number, cy: number, cz: number, w: number, h: number, d: number, color: string, rot: number): void;
  /** rotated box (rot about Y) with centre (cx,cy,cz) */
  rbox(cx: number, cy: number, cz: number, w: number, h: number, d: number, color: string, rot: number): void;
  /** optional emissive box / sphere (baked into the glow mesh; lit at night/festival) */
  lbox?(x: number, z: number, w: number, d: number, h: number, color: string, y0?: number): void;
  lsph?(cx: number, cy: number, cz: number, w: number, h: number, d: number, color: string): void;
  /** optional single triangle in world space (leaf blades). Only present while baking static meshes; normal is flipped to face up. */
  tri?(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number, color: string): void;
}

const PAL = {
  concrete: "#d8d2c4", concreteDk: "#aaa496", stone: "#e4d4b9", clay: "#c9724a", terracotta: "#b8613f",
  blue: "#3675e7", navy: "#1f3a6e", yellow: "#ffd166", green: "#3f8844", leaf: "#74b050", red: "#e8644a",
  steel: "#8d98aa", steelDk: "#4a5468", wood: "#916239", woodDk: "#6d4a2e", glass: "#8fd3ec", white: "#f4f1ea",
  purple: "#8b6fd6", teal: "#31c4d0", black: "#222831", pink: "#ff8fb3", lamp: "#fff1c4",
};
const STRIPES = [PAL.red, PAL.yellow, PAL.teal, PAL.blue, PAL.green];

/* ---------- shared helpers ---------- */
function steps(p: P, x: number, z: number, w: number, tiers: number, depth: number, rise: number, color: string) {
  // Tallest tier nearest the building (smaller z), stepping down toward the forecourt.
  for (let i = 0; i < tiers; i++) p.box(x, z + i * depth, w, depth, rise * (tiers - i), color);
}
function columns(p: P, x: number, z: number, n: number, gap: number, h: number, color: string, w = .5) {
  for (let i = 0; i < n; i++) { p.box(x + i * gap, z, w, w, h, color); p.box(x + i * gap - .1, z - .1, w + .2, w + .2, .22, PAL.concreteDk); p.box(x + i * gap - .12, z - .12, w + .24, w + .24, .2, color, h); }
}
function planter(p: P, x: number, z: number, w: number, d: number, plant: string) {
  p.box(x, z, w, d, .5, PAL.terracotta);
  p.sph(x + w / 2, .85, z + d / 2, w * .95, .7, d * .95, plant);
}
function lamp(p: P, x: number, z: number, h = 3.2) {
  p.cyl(x, z, .14, h, "#2a3a55"); (p.lsph ?? p.sph).call(p, x, h + .1, z, .46, .38, .46, PAL.lamp);
}
function umbrella(p: P, x: number, z: number, color: string, h = 2.3) {
  p.cyl(x, z, .08, h, PAL.steelDk); p.sph(x, h, z, 2.1, .45, 2.1, color);
}
function tableSet(p: P, x: number, z: number, color: string) {
  p.cyl(x, z, 1.1, .75, color); p.box(x - 1, z - .2, .5, .4, .4, PAL.woodDk); p.box(x + .5, z - .2, .5, .4, .4, PAL.woodDk);
}
function awning(p: P, x: number, z: number, w: number, d: number, h: number, i0 = 0, stripes = 5) {
  const sw = w / stripes;
  for (let i = 0; i < stripes; i++) p.box(x + i * sw, z, sw, d, .12, STRIPES[(i + i0) % STRIPES.length], h + (i % 2) * .04);
}
function floodlight(p: P, x: number, z: number, h: number, rot: number) {
  p.cyl(x, z, .28, h, PAL.steelDk);
  p.rbox(x, h + .3, z, 1.5, .9, .35, PAL.steel, rot);
  (p.lbox ? p.lsph! : p.sph).call(p, x, h + .3, z, 1.0, .5, .5, PAL.lamp);
}

/* ---------- LIBRARY (rect 4,4,38,22; hall 8..28 x 6..20; door x16..20 on z=20) ---------- */
function library(p: P, q: Quality) {
  // Forecourt paving + three-tier entrance steps in front of the door.
  p.box(8, 20.1, 20, 5, .08, "#cfc3a6", .02);
  steps(p, 14.4, 20.2, 7.2, 3, .55, .09, PAL.stone);
  // Accessible ramp on the right of the steps.
  p.rbox(23.4, .14, 21.1, 3.2, .1, 1.4, PAL.concreteDk, 0);
  // Portico colonnade: four columns flanking the door + entablature.
  columns(p, 13.2, 20.35, 2, 7, 2.9, PAL.stone, .6);
  columns(p, 15.8, 20.35, 2, 4.2, 2.9, PAL.stone, .6);
  p.box(12.8, 20.2, 9.2, 1.1, .35, PAL.purple, 3.15);
  p.box(12.8, 20.2, 9.2, 1.1, .12, PAL.stone, 3.5);
  // Glass facade panels along the front wall.
  for (let i = 0; i < 4; i++) { p.box(9 + i * 1.6, 20.05, 1.1, .12, 1.4, PAL.glass, 1.0); p.box(22 + i * 1.6, 20.05, 1.1, .12, 1.4, PAL.glass, 1.0); }
  // Vertical sunshade fins.
  if (q !== "low") for (let i = 0; i < 9; i++) p.box(8.2 + i * 2.2, 20.2, .12, .55, 2.2, PAL.navy, .4);
  planter(p, 9, 22.4, 2.4, 1, PAL.green); planter(p, 25.6, 22.4, 2.4, 1, PAL.leaf);
  if (q !== "low") { planter(p, 12.2, 23.4, 1.4, .9, PAL.leaf); planter(p, 22.4, 23.4, 1.4, .9, PAL.green); }
  // Reading terrace east of the hall: pergola, tables and benches.
  const tx = 31, tz = 8;
  p.box(tx, tz, 9, 8, .1, "#cdbf9e", .02);
  for (const [dx, dz] of [[0, 0], [8.4, 0], [0, 7.4], [8.4, 7.4]]) p.box(tx + dx, tz + dz, .35, .35, 3, PAL.woodDk);
  for (let i = 0; i < 9; i++) p.box(tx - .1 + i, tz, .22, 8, .18, PAL.wood, 3);
  if (q !== "low") for (let i = 0; i < 6; i++) p.box(tx, tz + .4 + i * 1.5, 9, .15, .1, PAL.leaf, 3.2);
  tableSet(p, tx + 2.2, tz + 2.5, PAL.white); tableSet(p, tx + 6.4, tz + 2.5, PAL.white); tableSet(p, tx + 4.3, tz + 5.4, PAL.white);
  lamp(p, 30, 22.5); lamp(p, 41, 22.5);
  // Rooftop details: clock tower stub and book-shaped sign.
  p.box(17.2, 11, 1.6, 1.6, 2.2, PAL.stone, 2.6); p.cyl(18, 11.8, 1.1, .12, PAL.white, 4.8); p.box(17.4, 11.2, 1.2, .3, .4, PAL.purple, 4.9);
  p.box(14, 20.0, 6, .22, .5, PAL.navy, 3.55);
  // Pass Q: grand glazed portal rising over the entrance (door passage x16..20 stays clear below y3.9).
  for (const px of [11.2, 21.2]) { p.box(px, 20.0, 3.6, 1.6, 8.2, PAL.stone, .05); p.box(px - .15, 19.9, 3.9, 1.9, .4, PAL.purple, 7.6); p.box(px + .4, 20.05, .3, .3, 7.4, PAL.concreteDk, .4); }
  p.box(14.8, 20.1, 6.4, .5, .5, PAL.navy, 3.9); // transom beam spanning the door
  p.box(14.8, 20.25, 6.4, .12, 3.6, PAL.glass, 4.4); // tall curtain-wall glazing
  for (let i = 0; i < 5; i++) p.box(14.8 + i * 1.6, 20.15, .12, .3, 3.7, PAL.navy, 4.4); // mullions
  p.box(11.0, 19.8, 14.1, 2.2, .3, PAL.stone, 8.2); p.box(11.0, 19.8, 14.1, .2, .2, PAL.yellow, 8.5); // portal cap + gold trim
  (p.lbox ?? p.box).call(p, 16.2, 19.95, 3.6, .14, .9, PAL.lamp, 6.2); // lit sign band (no baked text)
  // Brise-soleil ribs along both side walls and a projecting shade canopy on the east terrace side.
  if (q !== "low") for (let i = 0; i < 6; i++) { p.box(7.6, 7 + i * 2.2, .5, .14, 2.4, PAL.navy, .3); p.box(28.0, 7 + i * 2.2, .5, .14, 2.4, PAL.navy, .3); }
  p.box(28, 6, 3, 14, .14, PAL.purple, 2.9); for (const zz of [6.2, 13, 19.6]) p.box(30.7, zz, .2, .2, 2.8, PAL.steelDk, .1);
}

/* ---------- HOSTEL STREET (rect 4,30,38,16; hostels y30..35) ---------- */
function hostel(p: P, q: Quality) {
  for (const hx of [6, 20]) {
    // Balcony slabs + railings on the courtyard side (south face z=35).
    for (const lvl of [0, 1]) {
      const y0 = .9 + lvl * 1.3;
      p.box(hx + .5, 35, 9, 1.0, .1, PAL.concrete, y0);
      for (let i = 0; i < 10; i++) p.box(hx + .5 + i * 1, 35.9, .06, .06, .7, PAL.steelDk, y0 + .1);
      p.box(hx + .5, 35.9, 9, .06, .06, PAL.steelDk, y0 + .8);
    }
    // Louvred windows.
    for (let i = 0; i < 4; i++) { p.box(hx + 1 + i * 2.2, 35.05, 1.2, .1, 1, PAL.blue, 1.1); if (q !== "low") for (let k = 0; k < 4; k++) p.box(hx + 1 + i * 2.2, 35.15, 1.2, .05, .06, PAL.white, 1.15 + k * .22); }
    // Roof water tanks (black, with stand) and satellite dish.
    p.cyl(hx + 2, 31.5, 1.6, 1.2, PAL.black, 2.65); p.box(hx + 1.2, 30.8, 1.6, 1.6, .1, PAL.steel, 2.55);
    if (q !== "low") { p.cyl(hx + 5, 32, 1.6, 1.2, PAL.black, 2.65); p.rbox(hx + 8, 3.1, 31.6, 1, .08, 1, PAL.white, .5); }
    // Laundry line between each hostel's pillars.
    if (q !== "low") for (let i = 0; i < 5; i++) p.box(hx + 1.2 + i * 1.6, 37.1, .5, .05, .6, STRIPES[i % 5], 1.3);
  }
  // Courtyard paving, central tree bed, benches, generator house and kiosk.
  p.box(6, 36, 34, 9, .06, "#cfc3a6", .02);
  planter(p, 20.5, 39, 3, 3, PAL.green);
  p.cyl(22, 40.5, .3, 2.2, PAL.woodDk); p.sph(22, 3.2, 40.5, 3.2, 2.2, 3.2, "#2f7d4a");
  for (const bx of [9, 31]) { p.box(bx, 41, 3, .6, .18, PAL.wood, .5); p.box(bx + .2, 41.1, .2, .4, .5, PAL.woodDk); p.box(bx + 2.6, 41.1, .2, .4, .5, PAL.woodDk); }
  p.box(35.5, 37, 3.5, 2.2, 2.0, PAL.steel); p.box(35.3, 36.8, 3.9, 2.6, .15, PAL.steelDk, 2.0);
  // Provisions kiosk with striped awning + umbrella.
  p.box(9, 43, 3.2, 1.6, 1.6, PAL.clay); awning(p, 8.6, 42.3, 4, 1.6, 1.7); umbrella(p, 14, 43.6, PAL.yellow);
  lamp(p, 6.5, 37); lamp(p, 18, 44.5); lamp(p, 39.5, 44.5);
}

/* ---------- FOOD COURT (rect 78,40,22,18; hall 82..96 x 42..51) ---------- */
function food(p: P, q: Quality) {
  // Seating canopy south of the hall on four steel poles, striped tarp roof.
  const cx = 81, cz = 52, cw = 17, cd = 5;
  p.box(cx - 1, cz - .5, cw + 2, cd + 1, .06, "#c9bd9d", .02);
  for (const [dx, dz] of [[0, 0], [cw - .3, 0], [0, cd - .3], [cw - .3, cd - .3]]) p.box(cx + dx, cz + dz, .3, .3, 3.2, PAL.steelDk);
  for (let i = 0; i < 8; i++) p.box(cx - .4 + i * ((cw + .8) / 8), cz - .4, (cw + .8) / 8, cd + .8, .14, STRIPES[i % 5], 3.2 + (i % 2) * .05);
  if (q !== "low") for (let i = 0; i < 10; i++) p.sph(cx + .5 + i * 1.8, 3.05, cz + .1, .22, .22, .22, PAL.lamp);
  for (let i = 0; i < 4; i++) tableSet(p, cx + 2.2 + i * 4, cz + 2.3, i % 2 ? PAL.yellow : PAL.white);
  // Stalls along the east side with awnings and menu boards.
  for (let i = 0; i < 3; i++) {
    const sz = 41.5 + i * 3.6;
    p.box(96.8, sz, 2.2, 2.6, 1.4, i % 2 ? PAL.clay : PAL.teal); awning(p, 96.4, sz - .2, 3, 3, 1.7, i);
    p.box(98.6, sz + .4, .12, 1.4, 1.3, PAL.black, .6); p.box(98.55, sz + .5, .06, 1.2, .9, PAL.white, .8);
  }
  // Hall sign, rooftop vent hoods and bins.
  p.box(84, 51.0, 10, .25, .6, PAL.red, 2.45);
  for (let i = 0; i < 3; i++) p.box(84 + i * 3.4, 43, 1.1, 1.1, .9, PAL.steel, 2.55);
  umbrella(p, 80.2, 56.2, PAL.red); umbrella(p, 98.5, 55.8, PAL.blue);
  p.cyl(80.2, 49, .6, .9, PAL.green); p.cyl(99, 50, .6, .9, PAL.blue);
}

/* ---------- SPORTS GROUND (rect 78,62,38,16; pitch 81..113 x 64..76) ---------- */
function sports(p: P, q: Quality) {
  // Touchline fence (low-poly rail + posts), open at the west entrance.
  for (let x = 80.5; x <= 113.5; x += 1.6) { p.box(x, 63.4, .1, .1, 1.3, PAL.steel); p.box(x, 76.6, .1, .1, 1.3, PAL.steel); }
  p.box(80.5, 63.4, 33.1, .06, .06, PAL.steel, 1.25); p.box(80.5, 76.6, 33.1, .06, .06, PAL.steel, 1.25);
  if (q !== "low") { p.box(80.5, 63.4, 33.1, .04, .04, PAL.steel, .6); p.box(80.5, 76.6, 33.1, .04, .04, PAL.steel, .6); }
  // Goals: posts + crossbar + back frame at each end of the pitch.
  for (const gx of [81.2, 112.2]) {
    const back = gx < 97 ? -1.2 : 1.2;
    p.box(gx, 68.3, .12, .12, 2.1, PAL.white); p.box(gx, 71.6, .12, .12, 2.1, PAL.white); p.box(gx, 68.3, .12, 3.4, .12, PAL.white, 2.1);
    if (q !== "low") { p.box(gx + back, 68.3, .06, .06, 2.1, PAL.white); p.box(gx + back, 71.6, .06, .06, 2.1, PAL.white); p.box(gx + back * .5, 68.3, Math.abs(back) * .5, 3.4, .04, "#e9eef2", 2.1); }
  }
  // Grandstand on the south side: three raked tiers with bright seats and a canopy.
  const sx = 86, sz = 77, sw = 22;
  for (let t = 0; t < 3; t++) { p.box(sx, sz + t * .9, sw, .9, .5 + t * .45, PAL.concrete); p.box(sx, sz + t * .9, sw, .5, .08, STRIPES[(t + 3) % 5], .5 + t * .45); }
  for (let i = 0; i < 4; i++) p.box(sx + 1 + i * 6.3, sz + 2.9, .25, .25, 3.6, PAL.steelDk);
  p.box(sx - .3, sz + .1, sw + .6, 3.3, .14, PAL.blue, 3.6);
  if (q !== "low") p.box(sx - .3, sz + 3.3, sw + .6, .12, .5, PAL.navy, 3.3);
  // Scoreboard on two poles, north side.
  p.box(94, 61.4, .3, .3, 3.2, PAL.steelDk); p.box(100, 61.4, .3, .3, 3.2, PAL.steelDk);
  p.box(93.4, 61.2, 7.2, .5, 1.5, PAL.black, 3.2); p.box(93.7, 61.7, 6.6, .1, 1.1, "#0b1a33", 3.4); // display face on the SOUTH side, toward the pitch (was on the back)
  for (let i = 0; i < 4; i++) p.box(94.2 + i * 1.5, 61.8, .9, .05, .6, i % 2 ? PAL.yellow : PAL.leaf, 3.6);
  p.box(93.3, 61.65, 7.4, .08, .12, PAL.blue, 4.6); p.box(93.3, 61.65, 7.4, .08, .12, PAL.blue, 3.1); // blue trim frames the display
  // Corner floodlights + team benches/dugouts.
  floodlight(p, 80.5, 63, 8, .4); floodlight(p, 113.5, 63, 8, -.4);
  if (q !== "low") { floodlight(p, 80.5, 77, 8, -.4); floodlight(p, 113.5, 77, 8, .4); }
  for (const bx of [92, 99]) { p.box(bx, 62.5, 4, .9, 1.4, PAL.concreteDk); p.box(bx - .2, 62.3, 4.4, 1.3, .1, PAL.blue, 1.4); }
  // Pass N7: grandstand rear cladding + end walls so the stand reads as a built structure, not floating tiers.
  p.box(sx - .3, sz + 3.15, sw + .6, .2, 3.6, "#e9e1cc"); p.box(sx - .3, sz + 3.35, sw + .6, .08, .45, PAL.blue, .3);
  for (const ex of [sx - .35, sx + sw + .1]) p.box(ex, sz + .1, .25, 3.2, 1.7, "#e9e1cc");
  if (q !== "low") for (const ax of [sx + 7.3, sx + 14.6]) { p.box(ax, sz + .1, .08, 2.8, .9, PAL.steel, 1.0); p.box(ax + .9, sz + .1, .08, 2.8, .9, PAL.steel, 1.0); }
  // West entrance arch + ticket booth with striped awning.
  for (const gz of [66.2, 73.6]) p.box(79.7, gz, .6, .6, 2.9, PAL.stone);
  p.box(79.5, 66.0, 1.0, 8.2, .4, PAL.blue, 2.9); p.box(79.4, 66.0, 1.2, 8.2, .1, PAL.yellow, 3.3);
  p.box(78.6, 64.4, 1.6, 1.5, 1.8, PAL.clay); awning(p, 78.2, 63.9, 2.4, 1.8, 1.9);
}

/* ---------- EVENT ARENA (rect 78,4,38,32) ---------- */
function stage(p: P, q: Quality) {
  const sx = 88, sz = 5, sw = 18, sd = 7;
  p.box(sx, sz, sw, sd, 1.0, PAL.steelDk); p.box(sx, sz + sd - .4, sw, .4, 1.0, PAL.blue);
  p.box(sx, sz + sd - 1.2, sw, 1.2, .06, "#1c2a46", 1.0);
  // Truss gantry: four towers + top beams.
  for (const tx of [sx - .8, sx + sw + .2]) for (const tz of [sz, sz + sd - .4]) p.box(tx, tz, .6, .6, 6.8, PAL.steel);
  for (const bz of [sz, sz + sd - .4]) p.box(sx - .8, bz, sw + 1.6, .6, .5, PAL.steel, 6.6);
  p.box(sx - .8, sz, .6, sd, .5, PAL.steel, 6.6); p.box(sx + sw + .2, sz, .6, sd, .5, PAL.steel, 6.6);
  p.box(sx - .8, sz + 3, sw + 1.6, .5, .5, PAL.steel, 6.6);
  // Stage lights hung from the front truss.
  for (let i = 0; i < (q === "low" ? 5 : 9); i++) p.box(sx + .2 + i * (q === "low" ? 4 : 2.1), sz + sd - .3, .5, .5, .5, i % 2 ? PAL.yellow : PAL.pink, 6.0);
  if (p.lbox) for (let i = 0; i < (q === "low" ? 5 : 9); i++) p.lbox(sx + .3 + i * (q === "low" ? 4 : 2.1), sz + sd - .2, .3, .3, .3, i % 2 ? PAL.yellow : PAL.pink, 5.7);
  // LED screens flanking the stage, speaker stacks at the front corners.
  p.box(sx - 4.6, sz + 1, .5, 4.2, 4.2, PAL.black, 1.0); (p.lbox ?? p.box).call(p, sx - 4.5, sz + 1.3, .08, 3.6, 3.6, PAL.teal, 1.3);
  p.box(sx + sw + 4.1, sz + 1, .5, 4.2, 4.2, PAL.black, 1.0); (p.lbox ?? p.box).call(p, sx + sw + 4.2, sz + 1.3, .08, 3.6, 3.6, PAL.pink, 1.3);
  for (const spx of [sx - 2.4, sx + sw + 1.4]) { p.box(spx, sz + sd - 1.6, 1.2, 1.2, 1.1, PAL.black); p.box(spx + .1, sz + sd - 1.6, 1, .6, .9, "#2b3345", 1.15); p.cyl(spx + .6, sz + sd - 1.7, .6, .1, PAL.steel, .5); }
  // Crowd barrier rail across the front.
  p.box(sx - 4, 15.2, sw + 8, .12, 1.0, PAL.steel); p.box(sx - 4, 15.2, sw + 8, .12, .1, PAL.yellow, 1.0);
  if (q !== "low") for (let i = 0; i < 14; i++) p.box(sx - 4 + i * ((sw + 8) / 13), 15.1, .12, .12, 1.0, PAL.steelDk);
  // Backstage compound: containers + two tents + generator.
  p.box(109, 6, 5, 2.4, 2.4, PAL.red); p.box(109, 9.6, 5, 2.4, 2.4, PAL.teal); p.box(109, 6, .08, 2.4, .5, PAL.white, 1.6);
  for (const tz of [13.6, 17.4]) { p.box(109, tz, 4, 3, 1.5, PAL.white); p.sph(111, 2.0, tz + 1.5, 4.6, 1.2, 3.6, PAL.white); }
  p.box(109.4, 21.4, 2.6, 1.4, 1.2, PAL.steelDk);
  // Pass Q: arena ground design - paved apron, crowd-pen markings, runway, spectator bank, lawn, pennant line.
  p.box(80, 12, 34, 14, .05, "#cdbf9e", .03); for (let i = 0; i < 8; i++) p.box(80 + i * 4.3, 12, .12, 14, .02, "#b3a584", .08);
  for (const zz of [17.6, 21.2]) p.box(80, zz, 34, .14, .02, PAL.yellow, .08);
  p.box(95.2, 11.6, 3.6, 5.2, .45, PAL.black, .05); (p.lbox ?? p.box).call(p, 95.2, 16.7, 3.6, .1, .06, PAL.pink, .5); (p.lbox ?? p.box).call(p, 95.2, 11.6, .1, 5.2, .06, PAL.teal, .5); (p.lbox ?? p.box).call(p, 98.7, 11.6, .1, 5.2, .06, PAL.teal, .5);
  p.box(80, 29, 34, 6, .05, "#4aa563", .03); for (let i = 0; i < 6; i++) p.box(80 + i * 6, 29, 3, 6, .02, "#5bb874", .08);
  for (let t = 0; t < 4; t++) p.box(111.4 + t * .7, 14, .7, 14, .35 * (t + 1), t % 2 ? PAL.steel : "#d6d0c2", .03); p.box(111.2, 14, .15, 14, 1.8, PAL.steelDk, .03);
  if (q !== "low") for (let i = 0; i < 7; i++) { const fx = 82 + i * 5; p.cyl(fx, 14.2, .12, 3.4, PAL.steel); p.box(fx + .06, 14.1, .9, .06, .55, STRIPES[i % 5]!, 2.7); }
  // Pass N7: stage skirt + entry steps, acoustic back shell (open roof so performers stay visible from above), sign banner over the front truss, FOH mixing desk.
  p.box(sx + .3, sz + sd, sw - .6, .08, .8, PAL.navy, .1); (p.lbox ?? p.box).call(p, sx + .3, sz + sd + .06, sw - .6, .05, .08, PAL.teal, .15);
  for (let i = 0; i < 3; i++) p.box(sx + sw - 3.2, sz + sd + (2 - i) * .45, 2.6, .45, .33 * (i + 1), PAL.concreteDk);
  p.box(sx, sz, sw, .35, 5.4, "#1c2a46", 1.0); p.box(sx, sz + .35, sw, .08, .5, PAL.blue, 1.0);
  p.box(sx + 3, sz + sd - .35, 12, .08, 1.4, PAL.navy, 7.1); (p.lbox ?? p.box).call(p, sx + 3.4, sz + sd - .28, 11.2, .05, .5, PAL.pink, 7.55);
  p.box(95, 23.4, 3, 1.4, .95, PAL.black); (p.lbox ?? p.box).call(p, 95.2, 23.5, 2.6, .6, .06, PAL.teal, .96);
  if (q !== "low") { p.box(sx - .5, sz, .3, 3.2, 4.2, "#1c2a46", 1.0); p.box(sx + sw + .2, sz, .3, 3.2, 4.2, "#1c2a46", 1.0); }
  // Perimeter floodlights.
  floodlight(p, 80, 6, 9, .7); floodlight(p, 114, 6, 9, -.7);
  if (q !== "low") { floodlight(p, 80, 30, 9, -.7); floodlight(p, 114, 30, 9, .7); }
  // Food/merch pop-up tents at arena edge.
  if (q !== "low") for (let i = 0; i < 3; i++) { const tz = 22 + i * 3.4; p.box(80.5, tz, 3, 2.4, .06, STRIPES[i], 2.2); for (const [dx, dz] of [[0, 0], [2.8, 0], [0, 2.2], [2.8, 2.2]]) p.box(80.5 + dx, tz + dz, .1, .1, 2.2, PAL.steel); }
}

/* ---------- CREATOR HUB (rect 4,50,38,26; studio 8..22 x 52..64) ---------- */
function creator(p: P, q: Quality) {
  // Neon sign band + vertical facade fins on the studio front (z=64).
  p.box(8.4, 63.9, 13.2, .3, .9, PAL.black, 2.6); p.box(8.6, 63.8, 12.8, .1, .5, PAL.pink, 2.8);
  for (let i = 0; i < 12; i++) p.box(8.4 + i * 1.2, 64.1, .16, .5, 2.3, i % 3 === 0 ? PAL.yellow : i % 3 === 1 ? PAL.teal : PAL.pink, .3);
  p.box(8, 64, 14, 6, .06, "#cfc3a6", .02);
  // Yard: workbenches with tools and colourful cubes, cable spools, gallery panels.
  for (let i = 0; i < 3; i++) { const bx = 9 + i * 4.2; p.box(bx, 66, 3, 1.2, .8, PAL.wood); p.box(bx, 66, .12, .12, .8, PAL.woodDk); p.box(bx + 2.8, 66, .12, 1.2, .8, PAL.woodDk); p.box(bx + .3, 66.2, .6, .5, .35, [PAL.red, PAL.blue, PAL.yellow][i], .8); }
  for (let i = 0; i < 3; i++) p.cyl(24 + i * 1.6, 66.5, 1.2, .5, PAL.woodDk);
  for (let i = 0; i < 4; i++) { const gx = 26 + i * 3.4; p.box(gx, 54, .15, 2.4, 2.4, PAL.white); p.box(gx - .06, 54, .06, 2.4, .08, PAL.steelDk, 2.4); p.box(gx + .15, 54.4, .04, 1.6, 1.2, [PAL.purple, PAL.teal, PAL.yellow, PAL.pink][i], 1.0); p.box(gx - .2, 54, .5, .3, .08, PAL.steelDk); }
  if (q !== "low") { for (let i = 0; i < 6; i++) p.box(26 + (i % 3) * 3.2, 61 + Math.floor(i / 3) * 3.6, 1.1, 1.1, 1.1, STRIPES[i % 5], 0); planter(p, 36, 55, 2.4, 1, PAL.leaf); }
  // Open rooftop studio frame (steel pergola) over the east half of the building.
  for (const [dx, dz] of [[0, 0], [5.8, 0], [0, 5.8], [5.8, 5.8]]) p.box(14.5 + dx, 56 + dz, .25, .25, 1.4, PAL.steelDk, 2.1);
  p.box(14.4, 55.9, 6.4, 6.4, .1, PAL.teal, 3.5);
  lamp(p, 8, 70); lamp(p, 22, 70); lamp(p, 38, 70);
}

/* ---------- ACADEMIC BLOCK (rect 45,4,30,22; lectures 47..57 / 63..73 x 6..20) ---------- */
function academic(p: P, q: Quality) {
  // Covered walkway/arcade between the lecture blocks (x57..63) at the front (z=20..24).
  p.box(55, 20.1, 20, 4.6, .08, "#cfc3a6", .02);
  columns(p, 55.4, 21, 8, 2.4, 2.9, PAL.stone, .5);
  p.box(55, 20.8, 19, 1.6, .22, PAL.navy, 3.1); p.box(55, 20.8, 19, 1.6, .1, PAL.stone, 3.32);
  // Entrance steps for each block.
  steps(p, 49.6, 20.2, 4.8, 2, .6, .1, PAL.stone); steps(p, 65.6, 20.2, 4.8, 2, .6, .1, PAL.stone);
  // Facade bands: window ribbons and brise-soleil on both blocks.
  for (const bx of [47, 63]) {
    for (let i = 0; i < 4; i++) p.box(bx + .8 + i * 2.3, 20.05, 1.5, .1, 1.1, PAL.glass, 1.1);
    if (q !== "low") for (let i = 0; i < 9; i++) p.box(bx + .5 + i * 1.1, 20.2, .08, .45, 2.0, PAL.blue, .5);
    p.box(bx + 1, 20.0, 8, .15, .45, PAL.blue, 2.55);
  }
  // Notice boards, flag mast with banner, bike racks, benches.
  p.box(58.4, 24.2, 3.2, .15, 1.4, PAL.wood, .5); p.box(58.6, 24.1, 2.8, .05, 1.1, PAL.yellow, .65);
  p.cyl(60, 25, .12, 6, "#d9d9e4"); p.box(60.1, 25, 1.6, .06, .9, PAL.blue, 5);
  for (let i = 0; i < 5; i++) p.box(48 + i * .5, 24.5, .05, .8, .6, PAL.steel);
  for (const bx of [50, 68]) { p.box(bx, 25, 2.8, .5, .16, PAL.wood, .5); p.box(bx + .2, 25.05, .15, .4, .5, PAL.woodDk); p.box(bx + 2.4, 25.05, .15, .4, .5, PAL.woodDk); }
  planter(p, 46.4, 22, 1.8, 1.8, PAL.green); planter(p, 73.2, 22, 1.8, 1.8, PAL.leaf);
  lamp(p, 54, 25.5); lamp(p, 66, 25.5);
}

const ARCH: Record<string, (p: P, q: Quality) => void> = {
  main_gate: (p, q) => { gate(p, q); shuttleBay(p, q); }, student_commons: commons, library, hostel_street: (p, q) => { hostel(p, q); hostelExtras(p, q); }, food_court: food, sports_ground: sports, event_arena: stage, creator_hub: creator, academic_block: academic,
  quiet_garden: (p, q) => { quietGarden(p, q); waterTower(p, q); },
};

export const ARCHITECTURE_ZONES: string[] = Object.keys(ARCH);
/** Adds zone builders from other modules (kept out of this file so it stays self-contained for plain-Node tests). Idempotent. */
export function registerArchitecture(extra: Record<string, (p: P, q: Quality) => void>) {
  for (const [id, fn] of Object.entries(extra)) { if (!(id in ARCH)) ARCHITECTURE_ZONES.push(id); ARCH[id] = fn; }
}
export const hasZoneArchitecture = (zoneId: string) => zoneId in ARCH;
/** Records the static architecture for a zone into `p`. Returns false when the zone has none. */
export function buildZoneArchitecture(zoneId: string, q: Quality, p: P): boolean {
  const fn = ARCH[zoneId];
  if (!fn) return false;
  fn(p, q);
  return true;
}

/* ===================== Pass E landmarks: gate, commons, interiors ===================== */
const C = {
  concrete: "#d8d2c4", concreteDk: "#aaa496", stone: "#e4d4b9", clay: "#c9724a", terracotta: "#b8613f",
  blue: "#3675e7", navy: "#1f3a6e", yellow: "#ffd166", green: "#3f8844", leaf: "#74b050", red: "#e8644a",
  steel: "#8d98aa", steelDk: "#4a5468", wood: "#916239", woodDk: "#6d4a2e", glass: "#a8e3f6", white: "#f4f1ea",
  teal: "#31c4d0", black: "#222831", pink: "#ff8fb3", lamp: "#fff1c4", warm: "#ffe2a0", purple: "#8b6fd6",
};
const LSTRIPES = [C.red, C.yellow, C.teal, C.blue, C.green];

/** Emissive box when the recorder supports it, plain box otherwise (keeps old test stubs working). */
const lit = (p: P, x: number, z: number, w: number, d: number, h: number, color: string, y0 = 0) =>
  (p.lbox ?? p.box).call(p, x, z, w, d, h, color, y0);
const litSph = (p: P, cx: number, cy: number, cz: number, w: number, h: number, d: number, color: string) =>
  (p.lsph ?? p.sph).call(p, cx, cy, cz, w, h, d, color);

/* 5x7 block font: only the letters we need for the campus monument. */
const GLYPH: Record<string, string[]> = {
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
};
/** Block lettering on a wall. face=+1 reads from the south (+z), face=-1 from the north. Runs are merged per row. */
export function text3d(p: P, str: string, cx: number, z: number, y0: number, cell: number, color: string, face: 1 | -1, depth = .22, glow = false) {
  const total = str.length * 6 * cell - cell, x0 = cx - total / 2;
  for (let i = 0; i < str.length; i++) {
    const g = GLYPH[str[i]!]; if (!g) continue;
    for (let r = 0; r < 7; r++) {
      const row = g[r]!; let c = 0;
      while (c < 5) {
        if (row[c] !== "1") { c++; continue; }
        let e = c; while (e < 5 && row[e] === "1") e++;
        const xs = x0 + (i * 6 + c) * cell, len = (e - c) * cell;
        const x = face === 1 ? xs : 2 * cx - (xs + len);
        const zz = face === 1 ? z : z - depth;
        const y = y0 + (6 - r) * cell;
        if (glow) lit(p, x, zz, len, depth, cell, color, y); else p.box(x, zz, len, depth, cell, color, y);
        c = e;
      }
    }
  }
}

function palm(p: P, x: number, z: number, h: number) { palmTree(p, x, z, h); }
function bed(p: P, x: number, z: number, w: number, d: number, plant: string) {
  p.box(x, z, w, d, .42, C.terracotta); p.box(x + .12, z + .12, w - .24, d - .24, .1, "#5a3b27", .42);
  for (let i = 0; i < Math.floor(w / .7); i++) p.sph(x + .45 + i * .7, z + d / 2, .66, .6, .5, .6, i % 3 === 0 ? C.yellow : plant);
}
function bollard(p: P, x: number, z: number) { p.cyl(x, z, .22, .7, C.steelDk); p.cyl(x, z, .24, .1, C.yellow, .62); }

/* ---------------------------------------------------------------- Grand Gate + Transport Edge */
export function gate(p: P, q: Quality) {
  const cx = 59.2, z0 = 70.4;
  // Paired pylons (stone, breezeblock screens, timber soffit, lantern caps).
  for (const px of [50.9, 65.5]) {
    p.box(px - .2, z0 - .2, 2.4, 2.4, .5, C.concreteDk);
    p.box(px, z0, 2.0, 2.0, 7.2, C.stone);
    p.box(px - .15, z0 - .15, 2.3, 2.3, .3, C.navy, 7.2);
    for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) p.box(px + .22 + c * .55, z0 + 2.0, .4, .1, .42, c % 2 ? C.clay : C.terracotta, .9 + r * .95);
    p.box(px + .85, z0 + 2.0, .3, .12, 5.4, C.steelDk, .7);
    litSph(p, px + 1, 7.95, z0 + 1, .7, .9, .7, C.warm);
  }
  // Lintel with navy sign panel on both faces and block lettering.
  p.box(50.9, z0, 16.6, 1.6, 1.7, C.concrete, 5.4);
  p.box(50.7, z0 - .2, 17, 2.0, .25, C.navy, 7.1);
  p.box(51.3, z0 + .2, 15.8, 1.2, .2, C.wood, 5.2);
  p.box(52.9, z0 + 1.6, 12.6, .1, 1.5, C.navy, 5.5); p.box(52.9, z0 - .1, 12.6, .1, 1.5, C.navy, 5.5);
  text3d(p, "CAMPUS", cx, z0 + 1.7, 5.55, .22, C.white, 1, .16, true);
  text3d(p, "CAMPUS", cx, z0 - .1, 5.55, .22, C.white, -1, .16, true);
  p.box(52.9, z0 + 1.6, 12.6, .12, .12, C.yellow, 5.4); p.box(52.9, z0 + 1.6, 12.6, .12, .12, C.yellow, 6.98);
  // Roofed gatehouse: flat roof slab with parapet, yellow fascia, timber soffit and solar-canopy ribs spanning the pylons.
  p.box(50.4, z0 - .7, 17.6, 3.4, .22, C.concreteDk, 7.55); p.box(50.4, z0 - .7, 17.6, .18, .5, C.navy, 7.77); p.box(50.4, z0 + 2.5, 17.6, .18, .5, C.navy, 7.77);
  p.box(50.4, z0 - .72, 17.6, .1, .12, C.yellow, 7.43); p.box(51.0, z0 - .2, 16.4, 2.4, .08, C.wood, 7.47);
  if (q !== "low") for (let i = 0; i < 9; i++) p.box(51.6 + i * 1.8, z0 + .1, .7, 1.8, .1, C.steelDk, 7.95);
  // Flag masts on the piers.
  for (const fx of [50.5, 68.0]) { p.cyl(fx, z0 + 1, .12, 3.2, C.steel, 7.4); p.box(fx, z0 + .95, 1.3, .06, .8, fx < 59 ? C.blue : C.yellow, 9.7); }
  // Gatehouse booths with canopy and glowing glazing.
  for (const bx of [46.6, 69.6]) {
    p.box(bx, 71, 3.2, 3, 3, C.concrete); p.box(bx - .4, 70.6, 4, 3.8, .25, C.terracotta, 3);
    lit(p, bx + .3, 73.95, 2.6, .08, 1.2, C.glass, 1.1);
    p.box(bx + 1.2, 73.9, .8, .12, 2.0, C.woodDk);
  }
  // Perimeter wall with metal screen above.
  for (const [fx, fw] of [[43.5, 3.0], [72.8, 2.7]] as const) {
    p.box(fx, 71.2, fw, .4, 1.2, C.concrete);
    for (let i = 0; i < Math.floor(fw / .55); i++) p.box(fx + .15 + i * .55, 71.3, .1, .2, 1.1, C.steelDk, 1.2);
  }
  // Wayfinding totems (directional sign family): colour band per destination.
  for (const [tx, bands] of [[55.2, [C.blue, C.red, C.purple]], [63.0, [C.green, C.yellow, C.teal]]] as const) {
    p.box(tx, 75.4, 1.1, .45, 2.8, C.navy); p.box(tx - .08, 75.3, 1.26, .65, .2, C.steelDk, 2.8);
    bands.forEach((b, i) => { p.box(tx + .08, 75.85, .94, .08, .26, b, 2.0 - i * .55); lit(p, tx + .2, 75.9, .7, .05, .12, C.white, 2.07 - i * .55); });
  }
  // Planting beds, palms as landmarks, bollards.
  bed(p, 52.2, 74.2, 3.4, 1.4, C.leaf); bed(p, 52.2, 77.4, 3.4, 1.4, C.green); bed(p, 54.4, 78.6, 1.4, 1.2, C.leaf);
  palm(p, 49.6, 75, 6.2); palm(p, 69.2, 79, 5.6);
  if (q !== "low") { palm(p, 51, 79, 4.6); bed(p, 66.8, 79.4, 3, 1.1, C.leaf); }
  // Zebra crossing + painted kerb across the avenue near the arrival court.
  for (let i = 0; i < 5; i++) p.box(58.35 + i * .8, 77.2, .5, 2.0, .03, C.white, .16);
  // Shuttle bay (Transport Edge): kerb, bay paint, shelter, route sign, fictional shuttle.
  p.box(62.7, 72.6, .25, 6.6, .18, C.concrete);
  for (let i = 0; i < 4; i++) p.box(63.0, 73.2 + i * 1.7, 3.4, .1, .03, C.yellow, .16);
  p.box(63.0, 72.8, 3.4, .12, .03, C.white, .16);
  bollard(p, 62.4, 73); bollard(p, 62.4, 75.4); bollard(p, 62.4, 77.8);
  const sx = 64.0, sz = 74.6;
  p.box(sx, sz, 2.0, 5.2, .9, C.blue, .45); p.box(sx + .08, sz + .15, 1.84, 4.9, .75, C.white, 1.35);
  p.box(sx - .02, sz + .3, 2.04, 4.6, .1, C.yellow, .8);
  lit(p, sx - .05, sz + .4, .06, 4.1, .4, C.glass, 1.5); lit(p, sx + 2.0, sz + .4, .06, 4.1, .4, C.glass, 1.5);
  lit(p, sx + .2, sz + 5.18, 1.6, .06, .45, C.glass, 1.5);
  for (const wz of [sz + .6, sz + 4.0]) for (const wx of [sx - .1, sx + 1.85]) p.box(wx, wz, .25, .7, .7, C.black, 0);
  litSph(p, sx + .3, .85, sz + 5.2, .22, .22, .12, C.lamp); litSph(p, sx + 1.7, .85, sz + 5.2, .22, .22, .12, C.lamp);
  // Covered waiting area.
  for (const [wx, wz] of [[66.8, 74.2], [69.4, 74.2], [66.8, 77.2], [69.4, 77.2]] as const) p.box(wx, wz, .16, .16, 2.9, C.steelDk);
  p.box(66.5, 73.9, 3.3, 3.6, .22, C.blue, 2.9); p.box(66.5, 73.9, 3.3, .2, .3, C.yellow, 3.12);
  p.box(66.9, 77.0, 2.6, .5, .45, C.wood, .0); p.box(66.9, 77.4, 2.6, .12, .55, C.woodDk, .45);
  p.box(69.7, 74.6, .12, .12, 2.6, C.steelDk); lit(p, 69.45, 74.5, .6, .12, .5, C.teal, 2.2);
}

/* ---------------------------------------------------------------- Student Commons landmark + islands */
function island(p: P, cx: number, cz: number, r: number) {
  p.cyl(cx, cz, r * 2, .4, C.stone); p.cyl(cx, cz, r * 1.7, .1, C.leaf, .4);
  p.cyl(cx, cz, .32, 2.6, C.woodDk, .4);
  p.sph(cx, 3.6, cz, r * 2.4, 2.0, r * 2.4, C.green); p.sph(cx + .3, 4.2, cz - .2, r * 1.5, 1.4, r * 1.5, C.leaf);
  for (const [dx, dz, w, d] of [[-.9, r + .1, 1.8, .5], [-.9, -r - .6, 1.8, .5], [r + .1, -.9, .5, 1.8], [-r - .6, -.9, .5, 1.8]] as const) {
    p.box(cx + dx, cz + dz, w, d, .1, C.wood, .42); p.box(cx + dx + (w > d ? .05 : 0), cz + dz + (w > d ? 0 : .05), w > d ? .12 : d, w > d ? d : .12, .42, C.woodDk);
  }
}
function parasol(p: P, cx: number, cz: number, color: string) {
  p.cyl(cx, cz, .12, 2.3, C.steel); p.sph(cx, 2.35, cz, 2.3, .45, 2.3, color); p.cyl(cx, cz, .9, .06, C.white, .75); p.cyl(cx, cz, .12, .75, C.steel);
  for (const [dx, dz] of [[.9, 0], [-.9, 0], [0, .9], [0, -.9]] as const) p.cyl(cx + dx, cz + dz, .38, .42, C.woodDk);
}
export function commons(p: P, q: Quality) {
  // Concentric paving rings around the fountain.
  p.cyl(58.5, 48, 11, .03, "#c9ad84", .13); p.cyl(58.5, 48, 9.6, .03, "#e1d2ad", .15);
  p.cyl(58.5, 48, 8.0, .03, "#c28a62", .17); p.cyl(58.5, 48, 6.6, .03, "#e1d2ad", .19);
  // Unity Beacon: stepped plinth, tapering shaft with glowing slits, ring deck, crown.
  const bx = 66, bz = 41;
  p.box(bx - .4, bz - .4, 4.2, 4.2, .35, C.concreteDk); p.box(bx - .1, bz - .1, 3.6, 3.6, .35, C.stone, .35);
  const tiers: [number, number][] = [[2.6, 3.4], [2.2, 3.2], [1.8, 3.0], [1.4, 2.8]];
  let y = .7;
  tiers.forEach(([w, h], i) => {
    const o = (3.4 - w) / 2 + .05;
    p.box(bx + o, bz + o, w, w, h, i % 2 ? C.concrete : C.stone, y);
    lit(p, bx + o + w / 2 - .12, bz + o + w, .24, .06, h * .7, C.glass, y + h * .15);
    p.box(bx + o - .08, bz + o - .08, w + .16, w + .16, .14, i === 3 ? C.yellow : C.blue, y + h);
    y += h + .14;
  });
  p.box(bx + .45, bz + .45, 2.5, 2.5, .3, C.navy, y); p.box(bx + .2, bz + .2, 3.0, 3.0, .16, C.yellow, y + .3);
  litSph(p, bx + 1.7, y + 1.4, bz + 1.7, 1.5, 1.7, 1.5, C.blue);
  p.cyl(bx + 1.7, bz + 1.7, .12, 1.6, C.steel, y + 2.1); litSph(p, bx + 1.7, y + 3.8, bz + 1.7, .35, .35, .35, C.yellow);
  for (const [dx, dz] of [[.1, .1], [3.1, .1], [.1, 3.1], [3.1, 3.1]] as const) p.box(bx + dx - .1, bz + dz - .1, .22, .22, 3.2, C.steel, .7);
  // Garden + seating islands (shade trees, ring benches).
  island(p, 52.4, 50.6, 1.8); island(p, 68.2, 50.6, 1.8); if (q !== "low") island(p, 69.2, 61.2, 1.7);
  // Cafe umbrellas on the east side of the plaza.
  parasol(p, 72.2, 53, C.red); parasol(p, 72.2, 56.6, C.yellow); if (q !== "low") parasol(p, 72.2, 60.2, C.teal);
  // Pennant poles along the plaza edge.
  for (const [fx, fz, col] of [[48.4, 47, C.blue], [48.4, 53, C.yellow], [71.6, 47, C.red], [71.6, 64, C.teal]] as const) {
    p.cyl(fx, fz, .1, 4.2, C.steel); p.box(fx, fz - .5, .06, .5, 1.1, col, 2.9);
  }
}

/* ---------------------------------------------------------------- Interiors (lit, visual-only dressing) */
export interface Bld { id: string; x: number; y: number; w: number; h: number; height: number; kind?: string | undefined }
export function buildInterior(b: Bld, p: P, q: Quality): boolean {
  const x0 = b.x + .45, z0 = b.y + .45, w = b.w - .9, d = b.h - .9, cx = b.x + b.w / 2;
  if (b.id === "student_centre") {
    p.box(x0 + 1, z0 + 2.2, w - 2, d - 4.4, .03, C.blue, .07);
    p.box(cx - 2, z0 + 1.2, 4, .9, 1.05, C.wood); p.box(cx - 2.1, z0 + 1.1, 4.2, 1.1, .08, C.white, 1.05);
    lit(p, cx - 1.8, z0 + .02, 3.6, .1, .9, "#6cc6ff", 1.9);
    for (const sx of [x0 + .2, x0 + w - 2.8]) { p.box(sx, z0 + 4.2, 2.6, .9, .5, C.terracotta); p.box(sx, z0 + 4.2, 2.6, .25, .9, C.clay); }
    lit(p, x0 + .1, z0 + .02, w - .2, .08, .1, C.warm, 2.9);
    for (let i = 0; i < 4; i++) p.box(x0 + .6 + i * (w - 1.8) / 3, z0 + .04, .9, .06, 1.3, LSTRIPES[i]!, 1.2);
    return true;
  }
  if (b.id === "library_hall") {
    for (let i = 0; i < Math.floor(w / 1.6); i++) {
      const sx = x0 + .2 + i * 1.6; p.box(sx, z0, 1.3, .5, 2.4, C.wood);
      for (let r = 0; r < 3; r++) p.box(sx + .08, z0 + .5, 1.14, .04, .5, LSTRIPES[(i + r) % 5]!, .35 + r * .7);
    }
    lit(p, x0, z0 + .02, w, .08, .12, C.warm, 2.55);
    for (let i = 0; i < 3; i++) {
      const tx = b.x + 3 + i * 5; litSph(p, tx + 1.5, .72, b.y + 3.35, .3, .3, .3, C.warm);
      for (const o of [.4, 1.9]) p.box(tx + o, b.y + 4.1, .6, .6, .5, C.woodDk);
    }
    return true;
  }
  if (b.id === "food_hall") {
    for (let i = 0; i < 3; i++) lit(p, x0 + 1 + i * (w - 3) / 2, z0 + .02, 2.2, .08, .8, [C.red, C.yellow, C.teal][i]!, 1.6);
    p.box(x0, z0, w, .5, 1.3, C.woodDk);
    for (let i = 0; i < 4; i++) { const sx = b.x + 3 + i * Math.max(1.4, (w - 3) / 3); p.cyl(sx, b.y + 3.6, .5, .6, C.clay); litSph(p, sx, 2.5, b.y + 3.0, .32, .32, .32, C.warm); p.box(sx - .02, b.y + 2.98, .04, .04, 1.4, C.steel, 1.1); }
    return true;
  }
  if (b.id === "creator_studio") {
    const cols = [C.purple, C.teal, C.pink];
    for (let i = 0; i < 3; i++) lit(p, x0 + .8 + i * (w - 1.6) / 3, z0 + .02, 1.6, .08, 1.3, cols[i]!, 1.1);
    for (let i = 0; i < 3; i++) { const px = b.x + 2.4 + i * 3; p.box(px, b.y + 5.2, .8, .8, .6, C.concrete); litSph(p, px + .4, .95, b.y + 5.6, .45, .45, .45, cols[i]!); }
    return true;
  }
  if (b.id.indexOf("lecture") === 0) {
    lit(p, x0 + 1, z0 + .02, w - 2, .08, 1.3, "#d9f5ff", 1.3);
    const rows = q === "low" ? 2 : 3;
    for (let r = 0; r < rows; r++) for (let c = 0; c < Math.floor((w - 1) / 2.2); c++) { p.box(x0 + .8 + c * 2.2, z0 + 2.4 + r * 1.9, 1.6, .6, .12, C.wood, .7); p.box(x0 + 1.2 + c * 2.2, z0 + 2.4 + r * 1.9, .8, .6, .06, C.woodDk, .7 - .55); }
    return true;
  }
  return b.kind ? roomInterior(b, b.kind, p, q) : false;
}

/* Generic room dressing by kind (district rooms). Items hug the north/side walls; the south ~2.4 units stay clear for the doorway. */
function roomInterior(b: Bld, kind: string, p: P, q: Quality): boolean {
  const x0 = b.x + .9, z0 = b.y + 1.2, w = b.w - 1.8, d = b.h - 2.0, cx = b.x + b.w / 2, deep = d - 2.4;
  const L = p.lbox ?? p.box, hi = q !== "low";
  const desk = (x: number, z: number) => { p.box(x, z, 1.1, .55, .06, C.wood, .7); p.box(x + .05, z + .05, .08, .45, .65, C.woodDk); p.box(x + .97, z + .05, .08, .45, .65, C.woodDk); };
  switch (kind) {
    case "classroom": case "hall": {
      L.call(p, x0 + 1, z0 - .4, w - 2, .08, .9, "#d9f5ff", 1.4); p.box(cx - 1, z0 + .2, 2, .6, .08, C.wood, .7);
      const rows = Math.max(1, Math.min(hi ? 3 : 2, Math.floor((deep - 1.2) / 1.5)));
      for (let r = 0; r < rows; r++) for (let c = 0; c < Math.max(1, Math.floor((w - .4) / 1.7)); c++) desk(x0 + .2 + c * 1.7, z0 + 1.6 + r * 1.5);
      return true;
    }
    case "lab": case "workshop": {
      p.box(x0, z0 - .3, w, .6, .9, C.steel); p.box(x0, z0 - .3, w, .6, .05, C.white, .9);
      for (let i = 0; i < Math.floor(w / 1.8); i++) L.call(p, x0 + .3 + i * 1.8, z0 + .3, .9, .06, .55, i % 2 ? "#31c4d0" : "#a8e3f6", 1.05);
      if (deep > 2.5) { p.box(cx - 1.4, z0 + 1.5, 2.8, 1, .9, C.steelDk); p.box(cx - 1.4, z0 + 1.5, 2.8, 1, .05, C.white, .9); }
      if (hi && kind === "workshop") p.box(x0 + w - 1.2, z0 + 2.4, 1, 1, 1.2, C.clay);
      return true;
    }
    case "dorm": {
      p.box(x0, z0 - .3, 1.1, 2.2, .45, C.blue); p.box(x0, z0 - .3, 1.1, .5, .6, C.white, .45);
      p.box(x0 + w - 1.2, z0 - .3, 1.1, 2.2, .45, C.teal); p.box(x0 + w - 1.2, z0 - .3, 1.1, .5, .6, C.white, .45);
      p.box(cx - .4, z0 - .3, .8, .4, 2.0, C.woodDk); desk(cx - .55, z0 + 1.6);
      L.call(p, cx - .2, z0 + 1.7, .3, .3, .35, C.warm, .78);
      return true;
    }
    case "office": {
      for (let i = 0; i < Math.min(3, Math.floor(w / 2)); i++) { const dx = x0 + .3 + i * 2; p.box(dx, z0 + .6, 1.4, .7, .06, C.wood, .72); p.box(dx + .1, z0 + .6, .08, .6, .7, C.woodDk); L.call(p, dx + .4, z0 + .75, .6, .06, .4, "#8fd3ec", .85); }
      p.box(x0 + w - .8, z0 - .3, .7, 1.4, 1.5, C.steel); planter(p, x0 + w - 1.1, z0 + deep - .5, .6, .6, C.green);
      return true;
    }
    case "clinic": {
      for (let i = 0; i < 2; i++) { const bx = x0 + .3 + i * 2.4; p.box(bx, z0 + .2, 1, 2, .5, C.white); p.box(bx, z0 + .2, 1, .5, .6, C.blue, .5); }
      p.box(x0 + w - 1, z0 - .3, .9, 1.6, 1.6, C.white);
      L.call(p, cx - .15, z0 - .38, .3, .06, .9, C.red, 1.7); L.call(p, cx - .45, z0 - .38, .9, .06, .3, C.red, 2.0);
      return true;
    }
    case "shop": {
      p.box(x0 + .5, z0 + deep * .55, w - 1, .6, 1.0, C.wood); p.box(x0 + .4, z0 + deep * .55 - .1, w - .8, .8, .08, C.white, 1.0);
      p.box(x0, z0 - .3, w, .5, 2.0, C.woodDk);
      for (let i = 0; i < Math.floor(w / 1.2); i++) p.box(x0 + .1 + i * 1.2, z0 - .2, .9, .08, .35, LSTRIPES[i % 5]!, .5 + (i % 3) * .5);
      L.call(p, x0 + 1, z0 - .35, w - 2, .06, .25, C.warm, 2.2);
      return true;
    }
    case "canteen": {
      p.box(x0, z0 - .3, w, .6, 1.2, C.woodDk);
      for (let i = 0; i < 3; i++) L.call(p, x0 + .6 + i * (w - 1.6) / 2.2, z0 + .32, 1.0, .06, .5, [C.red, C.yellow, C.teal][i]!, 1.6);
      for (let i = 0; i < Math.max(1, Math.min(hi ? 4 : 2, Math.floor(w / 2))); i++) { const tx = x0 + .6 + i * 2.1; p.cyl(tx + .5, z0 + deep * .65, .9, .7, C.clay); }
      return true;
    }
    case "studio": {
      const cols = [C.purple, C.teal, C.pink];
      for (let i = 0; i < 3; i++) L.call(p, x0 + .5 + i * (w - 1.4) / 2.6, z0 - .38, 1.2, .06, 1.2, cols[i]!, 1.1);
      p.box(cx - .8, z0 + 1.8, 1.6, .8, .06, C.wood, .7); L.call(p, cx - .4, z0 + 1.95, .8, .06, .4, "#8fd3ec", .8);
      return true;
    }
    case "gym": {
      p.box(x0, z0 + .6, w, 1.8, .06, C.green, .02); for (let i = 0; i < Math.floor(w / 1.6); i++) { p.box(x0 + .3 + i * 1.6, z0 - .3, .15, .15, 1.4, C.steelDk); p.box(x0 + .1 + i * 1.6, z0 - .3, .55, .15, .1, C.steel, 1.4); }
      return true;
    }
    default: { // lounge / fallback: sofas + rug
      p.box(x0 + .8, z0 + 1, w - 1.6, deep - 1.8 > 1 ? deep - 1.8 : 1, .04, C.blue, .03);
      p.box(x0 + .2, z0 - .3, 2.2, .8, .5, C.terracotta); p.box(x0 + w - 2.4, z0 - .3, 2.2, .8, .5, C.terracotta);
      p.cyl(cx, z0 + deep * .55, 1, .45, C.wood);
      return true;
    }
  }
}

/* Hostel blocks are scenic-only (no door in domain data): lit window grid reads as occupied rooms,
 * plus courtyard bike racks and a clothes line for lived-in detail. */
function hostelExtras(p: P, q: Quality) {
  for (const hx of [6, 20]) {
    for (let lvl = 0; lvl < 2; lvl++) for (let i = 0; i < 4; i++)
      (p.lbox ?? p.box).call(p, hx + .9 + i * 2.3, 35.02, 1.3, .06, .8, i % 3 === 1 ? "#ffd9a0" : "#a8e3f6", .45 + lvl * 1.0);
    p.box(hx + 1, 31.1, 8, .06, .06, C.steel, 2.5);
    for (let i = 0; i < 5; i++) p.box(hx + 1.4 + i * 1.4, 31.1, .5, .04, .7, LSTRIPES[(i + hx) % 5]!, 1.8);
  }
  if (q !== "low") for (let i = 0; i < 5; i++) { p.box(13.2 + i * .7, 38.4, .06, 1.1, .6, C.steelDk); p.box(13.2 + i * .7 - .1, 38.4, .26, .06, .06, C.steelDk, .6); }
  p.box(12.4, 38.2, 4.2, 1.5, .08, C.concreteDk, .02);
}

/* ===================== Pass I: Green Spine / Quiet Garden + Water Tower (long-range landmark) =====================
 * Sits in the open east strip (x 100-116, y 40-62) between the food court and the sports ground, so it never
 * overlaps a zone building. VISUAL ONLY (no collision) — keep gathering space open: the plaza stones are the path. */
export const GARDEN_CENTER = { x: 108, z: 51 };
export function quietGarden(p: P, q: Quality) {
  const cx = 107, cz = 51;
  // Winding stepping-stone trail from the food court side toward the gazebo.
  for (let i = 0; i < 9; i++) p.cyl(101.2 + i * .85, 45.5 + Math.sin(i * .9) * 1.3 + i * .62, .8, .05, i % 2 ? C.stone : C.concrete, .02);
  // Pond itself is the domain "fountain" solid (collision + basin); here: lily pads on the water and reeds on the bank.
  for (const [dx, dz] of [[-.9, .4], [.7, -.6], [.2, 1.1]] as const) p.cyl(cx - 3.2 + dx, cz + 4.2 + dz, .55, .03, C.leaf, .52);
  if (q !== "low") for (let i = 0; i < 5; i++) p.cyl(cx - 5.9 + i * .3, cz + 5.4 - Math.sin(i) * .4, .09, 1.1 + (i % 2) * .3, C.green);
  // Gazebo: plinth, 4 posts, hip roof with timber ring, bench ring, lantern.
  p.cyl(cx + 1.8, cz - .6, 5.6, .3, C.concreteDk); p.cyl(cx + 1.8, cz - .6, 5.0, .12, C.stone, .3);
  for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]] as const) p.box(cx + 1.8 + dx - .13, cz - .6 + dz - .13, .26, .26, 2.8, C.white, .4);
  p.box(cx + 1.8 - 2.3, cz - .6 - 2.3, 4.6, 4.6, .16, C.woodDk, 3.2);
  p.rbox(cx + 1.8, 3.65, cz - .6, 4.2, .5, 4.2, C.terracotta, Math.PI / 4); p.rbox(cx + 1.8, 4.05, cz - .6, 2.6, .4, 2.6, C.clay, Math.PI / 4);
  p.cyl(cx + 1.8, cz - .6, .18, .7, C.steelDk, 4.2);
  if (p.lsph) p.lsph(cx + 1.8, 2.9, cz - .6, .5, .6, .5, C.lamp);
  for (const [dx, dz, w, d] of [[-1.8, -1.7, 3.6, .55], [-1.8, 1.15, 3.6, .55]] as const) { p.box(cx + 1.8 + dx, cz - .6 + dz, w, d, .1, C.wood, .45); p.box(cx + 1.8 + dx + .2, cz - .6 + dz + .1, .15, d - .2, .45, C.woodDk); p.box(cx + 1.8 + dx + w - .35, cz - .6 + dz + .1, .15, d - .2, .45, C.woodDk); }
  // Shade trees are domain "tree" solids; beds + lantern posts here.
  bed(p, 103.5, 47.4, 3.2, 1, C.leaf); bed(p, 109.5, 56.2, 3.6, 1, C.pink);
  for (const [lx, lz] of [[101.3, 50.2], [108.2, 56.2], [112.6, 52.6]] as const) { p.cyl(lx, lz, .12, 2.2, C.steelDk); if (p.lsph) p.lsph(lx, 2.4, lz, .42, .42, .42, C.lamp); else p.sph(lx, 2.4, lz, .42, .42, .42, C.lamp); }
  // Quiet-garden sign (zone-colour family).
  p.box(100.8, 43.4, .12, 1.6, 1.1, C.navy, 1.0); p.box(100.7, 43.7, .06, 1.0, .12, C.teal, 1.6); p.cyl(100.86, 43.3, .1, 1.1, C.steelDk); p.cyl(100.86, 45.1, .1, 1.1, C.steelDk);
}
/** Water tower: tall silhouette seen above tree canopies from the commons. */
export function waterTower(p: P, q: Quality) {
  const x = 113.5, z = 59.5;
  p.box(x - 2, z - 2, 4, 4, .4, C.concreteDk);
  for (const [dx, dz] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]] as const) p.box(x + dx - .18, z + dz - .18, .36, .36, 8, C.concrete, .4);
  for (const y of [3, 5.6]) { p.box(x - 1.6, z - 1.6, 3.2, .1, .1, C.steel, y); p.box(x - 1.6, z + 1.5, 3.2, .1, .1, C.steel, y); p.box(x - 1.6, z - 1.6, .1, 3.2, .1, C.steel, y); p.box(x + 1.5, z - 1.6, .1, 3.2, .1, C.steel, y); }
  p.cyl(x, z, 4.4, .3, C.steelDk, 8.4); p.cyl(x, z, 4.2, 2.6, C.blue, 8.7); p.cyl(x, z, 4.3, .22, C.white, 9.6); p.sph(x, 11.5, z, 4.2, 1.5, 4.2, C.navy);
  p.cyl(x, z, .14, 1.2, C.steel, 12.1); if (p.lsph) p.lsph(x, 13.4, z, .4, .4, .4, C.red); else p.sph(x, 13.4, z, .4, .4, .4, C.red);
  p.box(x + 2.15, z - .6, .08, 1.2, 1.2, C.yellow, 9.1); // campus-colour band tag (no text baked in)
  if (q === "high") p.box(x - .1, z - 2.1, .2, .2, 8, C.steelDk, .4);
}

/* ---------- TRANSPORT EDGE: shuttle bay west of the arrival court (x 43..49.6, z 71..79.5). Visual only; no collision. ---------- */
export function shuttleBay(p: P, q: Quality) {
  const x0 = 43, z0 = 71, len = 8.5;
  p.box(x0, z0, 3.2, len, .08, "#3b4048"); // asphalt lane
  p.box(x0 + 3.2, z0, .3, len, .2, C.concrete); // painted kerb
  p.box(x0 + 3.2, z0, .3, len, .03, C.yellow, .2);
  p.box(x0 + 3.5, z0, 3.1, len, .1, C.stone); // waiting pavement
  for (let i = 0; i < 5; i++) p.box(x0 + .1 + i * .62, z0 + .3, .36, 1.3, .02, C.white, .08); // zebra crossing
  for (let i = 0; i < 4; i++) p.box(x0 + 1.5, z0 + 2.4 + i * 1.5, .12, .8, .02, C.white, .08); // lane dashes
  p.box(x0 + .4, z0 + 2.2, 2.4, .12, .02, C.yellow, .08); p.box(x0 + .4, z0 + 7.4, 2.4, .12, .02, C.yellow, .08); // bay end marks
  // Fictional shuttle (blue body, glazed band, roof pod, lit headlamps).
  const sz = z0 + 2.4;
  p.box(x0 + .5, sz, 2.2, 5, 1.7, C.blue, .35); p.box(x0 + .45, sz + .1, 2.3, 4.8, .12, C.white, 1.0);
  p.box(x0 + .45, sz + .35, 2.3, 4.3, .75, C.black, 1.1); p.box(x0 + .5, sz, 2.2, 5, .12, C.navy, 2.05);
  p.box(x0 + 1.0, sz + 1.2, 1.2, 2.2, .3, C.white, 2.17);
  for (const wz of [sz + .7, sz + 3.7]) for (const wx of [x0 + .4, x0 + 2.55]) p.cyl(wx + .08, wz + .3, .75, .3, C.black, .0);
  if (p.lbox) { p.lbox(x0 + .7, sz + .02, .4, .06, .22, C.lamp, .65); p.lbox(x0 + 2.0, sz + .02, .4, .06, .22, C.lamp, .65); }
  // Covered shelter: posts, roof slab with fascia, glazed back panel, bench, route board.
  const hx = x0 + 3.9, hz = z0 + 2.0;
  for (const [dx, dz] of [[0, 0], [2.4, 0], [0, 4.2], [2.4, 4.2]] as const) p.box(hx + dx, hz + dz, .14, .14, 2.7, C.steelDk, .1);
  p.box(hx - .3, hz - .3, 3.1, 4.8, .14, C.navy, 2.8); p.box(hx - .3, hz - .3, 3.1, .1, .22, C.yellow, 2.8);
  p.box(hx + 2.4, hz + .1, .06, 4.0, 1.9, C.glass, .4);
  p.box(hx + 1.3, hz + .5, .5, 3.2, .1, C.wood, .5); p.box(hx + 1.3, hz + .6, .08, .3, .5, C.woodDk); p.box(hx + 1.3, hz + 3.4, .08, .3, .5, C.woodDk);
  p.cyl(hx + .6, z0 + .8, .1, 3.0, C.steel); p.box(hx + .15, z0 + .65, .9, .08, .7, C.blue, 2.1); p.box(hx + .15, z0 + .65, .9, .09, .12, C.yellow, 2.1);
  if (p.lbox) p.lbox(hx + .5, hz + 2.0, 1.6, .6, .06, C.warm, 2.72);
  for (let i = 0; i < 3; i++) bollard(p, x0 + 3.35, z0 + 1 + i * 3.3);
  if (q !== "low") { planter(p, hx + .2, z0 + 7.0, 1.4, 1.2, C.green); lamp(p, hx + 2.8, z0 + 7.6); }
}
