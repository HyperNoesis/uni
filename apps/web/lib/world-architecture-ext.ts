/* CAMPUS zone architecture, extension set (static, decorative, VISUAL ONLY).
 * Covers the 12 quarters that had no architecture. Every zone gets: a framed central avenue,
 * a unique landmark on the free central axis (never inside building footprints), lamps, planting,
 * seating and a zone colour band. Coordinates are world tiles; z == domain "y". */
import type { P, Quality } from "./world-architecture";
import { palmTree, leafFringe } from "./world-flora";

const K = {
  conc: "#d8d2c4", concDk: "#aaa496", stone: "#e4d4b9", clay: "#c9724a", terra: "#b8613f", blue: "#3675e7", navy: "#1f3a6e",
  yellow: "#ffd166", green: "#3f8844", leaf: "#74b050", red: "#e8644a", steel: "#8d98aa", steelDk: "#4a5468", wood: "#916239",
  woodDk: "#6d4a2e", glass: "#8fd3ec", white: "#f4f1ea", purple: "#8b6fd6", teal: "#31c4d0", black: "#222831", pink: "#ff8fb3",
  lamp: "#fff1c4", orange: "#f2994a", paving: "#cfc3a6", soil: "#7a5a3a",
};
type R = { x: number; y: number; w: number; h: number };
const lit = (p: P, x: number, z: number, w: number, d: number, h: number, c: string, y0 = 0) => (p.lbox ?? p.box).call(p, x, z, w, d, h, c, y0);
const litS = (p: P, cx: number, cy: number, cz: number, w: number, h: number, d: number, c: string) => (p.lsph ?? p.sph).call(p, cx, cy, cz, w, h, d, c);
const lamp = (p: P, x: number, z: number, h = 3.2) => { p.cyl(x, z, .14, h, "#2a3a55"); litS(p, x, h + .1, z, .46, .38, .46, K.lamp); };
const bench = (p: P, x: number, z: number, along: "x" | "z" = "x") => {
  const [w, d] = along === "x" ? [2, .55] : [.55, 2];
  p.box(x, z, w, d, .12, K.wood, .45); p.box(x, z, w, d, .08, K.woodDk, .3);
  if (along === "x") { p.box(x + .1, z + .1, .12, .35, .45, K.steelDk); p.box(x + w - .22, z + .1, .12, .35, .45, K.steelDk); }
  else { p.box(x + .1, z + .1, .35, .12, .45, K.steelDk); p.box(x + .1, z + w - .22, .35, .12, .45, K.steelDk); }
};
const planter = (p: P, x: number, z: number, w: number, d: number, plant = K.green) => { p.box(x, z, w, d, .5, K.terra); p.sph(x + w / 2, .85, z + d / 2, w * .95, .7, d * .95, plant); };
const treeHash = (x: number, z: number) => { const v = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return v - Math.floor(v); };
/** Campus tree with species variety (seeded by position): round shade tree, flat-topped acacia, tall neem/mango. */
const tree = (p: P, x: number, z: number, s = 1, c = K.green) => {
  const h = treeHash(x, z);
  if (h < .4) { p.cyl(x, z, .35 * s, 2.2 * s, K.woodDk); p.sph(x, 3.1 * s, z, 2.6 * s, 2.0 * s, 2.6 * s, c); p.sph(x + .5 * s, 3.7 * s, z - .3 * s, 1.8 * s, 1.4 * s, 1.8 * s, K.leaf); leafFringe(p, x, 3.1 * s, z, 1.3 * s, 1.0 * s, 1.3 * s, c, 60, x * 2 + z); leafFringe(p, x + .5 * s, 3.7 * s, z - .3 * s, .9 * s, .7 * s, .9 * s, K.leaf, 28, x + z * 3); return; }
  if (h < .7) { // acacia: forked trunk, wide layered umbrella crown
    const lean = (h * 9 % 1 - .5) * .5 * s;
    p.cyl(x, z, .34 * s, 1.9 * s, K.woodDk); p.cyl(x + lean, z, .22 * s, 1.5 * s, K.woodDk, 1.7 * s); p.cyl(x - lean * 1.2, z + .15, .18 * s, 1.4 * s, K.woodDk, 1.8 * s);
    p.sph(x, 3.55 * s, z, 4.4 * s, .75 * s, 3.9 * s, "#4f7d36"); p.sph(x + .5 * s, 3.95 * s, z - .3 * s, 3.1 * s, .55 * s, 2.7 * s, "#6c9a42"); p.sph(x - .9 * s, 3.75 * s, z + .5 * s, 2.1 * s, .5 * s, 1.9 * s, "#86b24c"); leafFringe(p, x, 3.6 * s, z, 2.2 * s, .45 * s, 1.95 * s, "#6c9a42", 66, x + z * 2, true);
    return;
  }
  p.cyl(x, z, .3 * s, 2.4 * s, "#5f432f"); // neem/mango: tall dense oval crown
  p.sph(x, 4.0 * s, z, 2.5 * s, 3.1 * s, 2.4 * s, c === K.green ? "#2b6a3a" : c); p.sph(x + .5 * s, 4.5 * s, z - .3 * s, 1.6 * s, 1.8 * s, 1.5 * s, "#3f8a48"); p.sph(x - .5 * s, 3.7 * s, z + .4 * s, 1.3 * s, 1.5 * s, 1.3 * s, "#58a255");
};
const palm = (p: P, x: number, z: number, h = 4.6) => palmTree(p, x, z, h);
const flag = (p: P, x: number, z: number, c: string, h = 6) => { p.cyl(x, z, .1, h, "#d9d9e4"); p.box(x + .05, z - .03, 1.5, .06, .9, c, h - .95); };
const steps = (p: P, x: number, z: number, w: number, n: number, c = K.stone) => { for (let i = 0; i < n; i++) p.box(x, z + i * .6, w, .6, .12 * (n - i), c); };
const colorBand = (p: P, r: R, c: string) => { p.box(r.x + 1, r.y + r.h - .6, r.w - 2, .3, .06, c, .02); p.box(r.x + 1, r.y + .3, r.w - 2, .3, .06, c, .02); };
const avenue = (p: P, r: R, cx: number, c: string, q: Quality) => {
  p.box(cx - 2.2, r.y + .5, 4.4, r.h - 1, .05, K.paving, .02);
  p.box(cx - .15, r.y + .5, .3, r.h - 1, .06, c, .04);
  const n = Math.floor((r.h - 4) / 7);
  for (let i = 0; i <= n; i++) { const z = r.y + 3 + i * 7; lamp(p, cx - 2.8, z); lamp(p, cx + 2.8, z); if (q !== "low") { tree(p, cx - 4.2, z + 3.5, .9); tree(p, cx + 4.2, z + 3.5, .9); } }
};
const quad = (p: P, r: R, c: string, q: Quality) => { avenue(p, r, r.x + 20, c, q); colorBand(p, r, c); for (const dx of [6, 34]) { bench(p, r.x + dx, r.y + r.h / 2); planter(p, r.x + dx + 2.4, r.y + r.h / 2 - .4, 1.6, 1.6); } };

/* ---------- landmarks ---------- */
function engineering(p: P, q: Quality) {
  const r = { x: 120, y: 0, w: 40, h: 40 }; quad(p, r, K.orange, q);
  const cx = 140, cz = 22; // lattice tower on the avenue
  p.box(cx - 1.2, cz - 1.2, 2.4, 2.4, .4, K.concDk);
  for (const [dx, dz] of [[-.9, -.9], [.9, -.9], [-.9, .9], [.9, .9]]) p.rbox(cx + dx * .8, 4, cz + dz * .8, .18, 8, .18, K.steelDk, 0);
  for (let i = 0; i < 6; i++) { p.box(cx - .9 + i * .02, cz - .9, 1.8, .1, .1, K.steel, 1 + i * 1.3); p.box(cx - .9, cz - .9 + i * .02, .1, 1.8, .1, K.steel, 1 + i * 1.3); }
  p.cyl(cx, cz, 2.8, .3, K.orange, 8.2); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; p.rbox(cx + Math.cos(a) * 1.6, 8.5, cz + Math.sin(a) * 1.6, .5, .5, .5, K.orange, a); }
  litS(p, cx, 9.4, cz, .7, .7, .7, K.yellow);
  p.box(cx - 4, cz + 4, 8, 3, .06, K.steelDk, .02); for (let i = 0; i < 4; i++) p.box(cx - 3.4 + i * 1.8, cz + 4.4, 1.2, 2, .9, K.steel, .1);
  flag(p, 126, 24, K.orange); flag(p, 154, 24, K.orange);
}
function science(p: P, q: Quality) {
  const r = { x: 160, y: 0, w: 40, h: 40 }; quad(p, r, K.teal, q);
  const cx = 180, cz = 24; // observatory dome on a drum + atom sculpture
  p.cyl(cx, cz, 5.2, 3.2, K.white); p.cyl(cx, cz, 5.6, .3, K.concDk, 3.2); p.sph(cx, 3.5, cz, 5, 3.6, 5, K.glass);
  p.box(cx - .3, cz - 2.6, .6, 2.6, 2.4, K.navy, 3.2); steps(p, cx - 1.5, cz + 2.8, 3, 3);
  p.rbox(cx + 1.2, 5.6, cz, .5, 2.4, .5, K.steelDk, .6);
  const ax = 180, az = 10; p.cyl(ax, az, .3, 3, K.steelDk); litS(p, ax, 3.8, az, 1, 1, 1, K.teal);
  for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3; for (let j = 0; j < 10; j++) { const t = j / 10 * Math.PI * 2; p.sph(ax + Math.cos(t) * Math.cos(a) * 1.8, 3.8 + Math.sin(t) * 1.4, az + Math.cos(t) * Math.sin(a) * 1.8, .22, .22, .22, K.blue); } }
  planter(p, 176, 31, 2, 2, K.leaf); planter(p, 182, 31, 2, 2, K.leaf);
}
function medical(p: P, q: Quality) {
  const r = { x: 200, y: 0, w: 40, h: 40 }; quad(p, r, K.green, q);
  const cx = 220, cz = 24; // cross-shaped pavilion with green roof
  p.box(cx - 1.2, cz - 3.2, 2.4, 6.4, .3, K.white, 0); p.box(cx - 3.2, cz - 1.2, 6.4, 2.4, .3, K.white, 0);
  for (const [dx, dz] of [[-3, -1], [2.4, -1], [-3, .4], [2.4, .4]]) p.box(cx + dx, cz + dz, .3, .3, 3, K.stone, .3);
  p.box(cx - 3.4, cz - 1.4, 6.8, 2.8, .25, K.green, 3.3); p.box(cx - 1.4, cz - 3.4, 2.8, 6.8, .25, K.green, 3.3);
  lit(p, cx - .6, cz - .6, 1.2, 1.2, .1, K.red, 3.55); lit(p, cx - .15, cz - .9, .3, 1.8, .05, K.white, 3.66); lit(p, cx - .9, cz - .15, 1.8, .3, .05, K.white, 3.66);
  const hx = 220, hz = 9; for (let i = 0; i < 14; i++) { const t = i / 14 * Math.PI * 4; p.sph(hx + Math.cos(t) * .8, .5 + i * .28, hz + Math.sin(t) * .8, .3, .3, .3, i % 2 ? K.teal : K.pink); }
  p.cyl(hx, hz, .12, 4.5, K.steel);
  for (let i = 0; i < 4; i++) planter(p, 213 + i * 4.4, 31, 1.8, 1.8, i % 2 ? K.green : K.leaf);
}
function arts(p: P, q: Quality) {
  const r = { x: 120, y: 40, w: 40, h: 40 }; quad(p, r, K.pink, q);
  const cx = 140, cz = 64; // stepped amphitheatre arc + colourful sculptures
  for (let t = 0; t < 4; t++) for (let i = -5; i <= 5; i++) { const a = i / 5 * 1.0; p.rbox(cx + Math.sin(a) * (3 + t * 1.4), .2 + t * .22, cz - Math.cos(a) * (3 + t * 1.4) + 5, 1.5, .4 + t * .44, .9, t % 2 ? K.stone : K.concDk, a); }
  p.box(cx - 2.6, cz + 2.4, 5.2, 2.6, .35, K.wood, 0); lit(p, cx - 2.6, cz + 5.1, 5.2, .2, .15, K.pink, .35);
  const cols = [K.red, K.yellow, K.teal, K.purple]; for (let i = 0; i < 4; i++) { p.box(130 + i * 6.7, 46.1, .7, .7, 1.4, K.concDk); p.sph(130.35 + i * 6.7, 2.1 + (i % 2) * .4, 46.45, 1.2, 1.5 + i * .2, 1.2, cols[i]!); }
  for (let i = 0; i < 6; i++) { p.cyl(124 + i * 5.6, 76.5, .08, 3, K.steelDk); p.box(124.05 + i * 5.6, 76.45, 1.2, .05, .8, cols[i % 4]!, 2.2); }
}
function business(p: P, q: Quality) {
  const r = { x: 160, y: 40, w: 40, h: 40 }; quad(p, r, K.navy, q);
  const cx = 180, cz = 63; // clock tower with portico
  p.box(cx - 1.4, cz - 1.4, 2.8, 2.8, .5, K.concDk); p.box(cx - 1, cz - 1, 2, 2, 7.5, K.stone, .5); p.box(cx - 1.25, cz - 1.25, 2.5, 2.5, .4, K.navy, 8);
  p.box(cx - 1.15, cz - 1.15, 2.3, 2.3, 1.4, K.stone, 8.4); p.cyl(cx, cz + 1.18, 1.5, .1, K.white, 8.6);
  for (const [dx, dz] of [[0, -1.2], [0, 1.2]]) lit(p, cx - .08 + dx, cz - .6 + dz * .4, .16, 1.2, .04, K.black, 9.2);
  p.sph(cx, 10.4, cz, 2.2, 1.4, 2.2, K.navy); p.cyl(cx, cz, .1, 1.6, K.yellow, 11);
  steps(p, cx - 2.5, cz + 2, 5, 3);
  for (let i = 0; i < 4; i++) { p.cyl(172 + i * 5.4, 48.8, .6, 3.4, K.white); p.box(171.6 + i * 5.4, 48.4, 1.4, 1.4, .25, K.concDk, 3.4); }
  p.box(171, 48, 17, 2, .35, K.stone, 3.65); p.box(173, 48.4, 13, 1.2, .5, K.navy, 4);
  flag(p, 164, 74, K.blue); flag(p, 196, 74, K.blue);
}
function hostelEast(p: P, q: Quality) {
  const r = { x: 200, y: 40, w: 40, h: 40 }; quad(p, r, K.clay, q);
  for (const [x, z] of [[205, 56], [235, 56], [205, 66], [235, 66]] as const) { tree(p, x, z, 1.1); bench(p, x - 1, z + 1.6); }
  for (let i = 0; i < 4; i++) { p.cyl(214 + i * 2.2, 74.4, .08, 1.8, K.steelDk); } p.box(213.9, 74.35, 6.8, .04, .04, K.steel, 1.8);
  for (let i = 0; i < 5; i++) p.box(214.2 + i * 1.3, 74.38, .5, .03, .8, [K.pink, K.yellow, K.teal, K.white, K.red][i]!, 1);
  const kx = 217, kz = 61; p.box(kx, kz, 5, 3, 2.4, K.terra); p.box(kx - .3, kz - .3, 5.6, 3.6, .2, K.yellow, 2.4); awningStripes(p, kx, kz + 3, 5);
  for (let i = 0; i < 6; i++) { p.box(224 + i * .6, 62, .4, .15, .9, K.steel); p.cyl(224.2 + i * .6, 62.2, .5, .1, K.black, .9); }
}
function awningStripes(p: P, x: number, z: number, w: number) { const cs = [K.red, K.yellow, K.teal, K.blue, K.green]; for (let i = 0; i < 5; i++) p.box(x + i * w / 5, z, w / 5, 1.1, .1, cs[i]!, 2.1); }
function admin(p: P, q: Quality) {
  const r = { x: 120, y: 80, w: 40, h: 70 }; quad(p, r, K.blue, q);
  const cx = 140, cz = 120; // fountain roundabout + flagpoles
  p.cyl(cx, cz, 9, .45, K.stone); p.cyl(cx, cz, 7.8, .5, K.glass, .1); p.cyl(cx, cz, 1.4, 1.8, K.stone, .1); p.cyl(cx, cz, 3.4, .3, K.stone, 1.6);
  litS(p, cx, 2.4, cz, 1.2, 1.6, 1.2, K.glass); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; p.sph(cx + Math.cos(a) * 2.6, 1.2, cz + Math.sin(a) * 2.6, .3, .6, .3, K.glass); p.box(cx + Math.cos(a) * 4.4 - .3, cz + Math.sin(a) * 4.4 - .3, .6, .6, .6, K.concDk); }
  for (let i = 0; i < 3; i++) flag(p, 134 + i * 6, 104, [K.blue, K.white, K.green][i]!, 7.5);
  p.box(126, 140, 28, 4, .1, K.paving, .02); for (let i = 0; i < 6; i++) planter(p, 127 + i * 4.8, 144.6, 2, 1.4, K.leaf);
}
function research(p: P, q: Quality) {
  const r = { x: 160, y: 80, w: 40, h: 70 }; quad(p, r, K.teal, q);
  for (let i = 0; i < 3; i++) { const x = 163 + i * 11, z = 118; for (let j = 0; j < 4; j++) p.rbox(x + j * 2.4 + 1, 3.6, z + 1, 2.2, .12, 3.4, K.navy, 0); for (const px of [x, x + 9.6]) for (const pz of [z, z + 2]) p.box(px, pz, .2, .2, 3.4, K.steelDk); }
  const cx = 180, cz = 100; p.cyl(cx, cz, .5, 11, K.steel); litS(p, cx, 11.2, cz, .7, .7, .7, K.red);
  for (let i = 0; i < 3; i++) p.box(cx - .9 + i * .9, cz - .1, .08, .08, 3.4 + i * 2, K.steelDk, 1.5);
  p.cyl(cx, cz, 2, .3, K.concDk); for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2; p.rbox(cx + Math.cos(a) * 2.6, 1, cz + Math.sin(a) * 2.6, .08, 2, .08, K.steelDk, 0); }
  p.cyl(166, 136, 4.4, 2.2, K.white); p.sph(166, 3.2, 136, 4.2, 2, 4.2, K.glass); p.cyl(190, 136, 4.4, 2.2, K.white); p.sph(190, 3.2, 136, 4.2, 2, 4.2, K.glass);
}
function innovation(p: P, q: Quality) {
  const r = { x: 200, y: 80, w: 40, h: 70 }; quad(p, r, K.purple, q);
  const cx = 220; for (const [dx, c] of [[-2.6, K.purple], [2.6, K.purple]] as const) p.box(cx + dx - .3, 100, .6, .6, 5, K.black); p.box(cx - 3.2, 100, 6.4, .6, .5, K.black, 5);
  lit(p, cx - 2.6, 100.15, 5.2, .3, .35, K.teal, 5.05);
  const cols = [K.teal, K.orange, K.purple, K.yellow, K.pink];
  for (let i = 0; i < 5; i++) { const x = 203 + (i % 2) * 28, z = 112 + Math.floor(i / 2) * 7; p.box(x, z, 5.5, 2.4, 2.4, cols[i]!); p.box(x + 1, z - .05, 2, .1, 1.1, K.glass, 1); p.box(x - .1, z - .1, 5.7, 2.6, .12, K.black, 2.4); }
  const tx = 214, tz = 140; p.cyl(tx, tz, .3, 9, K.white); for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3 + .3; p.rbox(tx + Math.cos(a) * 2.2, 9.2, tz, 4.4, .18, .5, K.white, a * 0 + a); } p.sph(tx, 9.2, tz, .8, .8, .8, K.steel);
  planter(p, 226, 134, 2.4, 2.4, K.leaf); bench(p, 224, 130);
}
function hostelVillage(p: P, q: Quality) {
  const r = { x: 0, y: 80, w: 48, h: 70 }; avenue(p, r, 24, K.clay, q); colorBand(p, r, K.clay);
  const cx = 24, cz = 112; p.box(cx - 5, cz - 3, 10, 6, .05, K.green, .02); p.box(cx - 5, cz - .08, 10, .16, .06, K.white, .05); p.cyl(cx, cz, 1.2, .06, K.white, .05);
  for (const sx of [cx - 5.1, cx + 4.9]) { p.cyl(sx, cz, .12, 2.4, K.steelDk); } p.box(cx - 5, cz - .03, 10, .06, .9, K.white, 1.5);
  for (const [x, z] of [[8, 100], [40, 100], [8, 125], [40, 125], [8, 140], [40, 140]] as const) { tree(p, x, z, 1.1); bench(p, x - 1, z + 1.5); }
  for (let i = 0; i < 6; i++) { p.cyl(6 + i * 7, 147, .08, 1.9, K.steelDk); p.box(5.9 + i * 7, 146.97, 2.2, .04, .04, K.steel, 1.9); }
  for (let i = 0; i < 5; i++) { p.box(10 + i * 1.2, 144, .5, .9, .5, K.steelDk); p.cyl(10.3 + i * 1.2, 144.5, .4, .06, K.black, .5); }
}
function market(p: P, q: Quality) {
  const r = { x: 72, y: 80, w: 48, h: 70 }; avenue(p, r, 96, K.yellow, q); colorBand(p, r, K.yellow);
  const cs = [K.red, K.yellow, K.teal, K.blue, K.green, K.orange];
  for (let row = 0; row < 3; row++) for (let i = 0; i < 4; i++) { const x = 100.5 + i * 4.4, z = 108 + row * 9; p.box(x, z, 3.2, 2, .9, K.wood); for (const px of [x, x + 3]) p.box(px, z - .1, .1, .1, 2.3, K.steelDk); p.box(x - .3, z - .3, 3.8, 2.6, .12, cs[(i + row * 2) % 6]!, 2.3); p.sph(x + 1, 1.15, z + 1, 1, .5, .8, cs[(i + row) % 6]!); }
  p.box(92.5, 100, .8, .8, 6, K.terra); p.box(99.7, 100, .8, .8, 6, K.terra); p.box(92.5, 100, 8, .8, .9, K.yellow, 5.4); lit(p, 93, 100.1, 7, .3, .5, K.red, 5.5);
  for (let i = 0; i < 6; i++) { litS(p, 92.5 + i * 1.5, 5.3, 101, .35, .35, .35, K.lamp); }
  umbrella(p, 90, 130, K.red); umbrella(p, 102, 130, K.teal); tableSet(p, 90, 130, K.woodDk); tableSet(p, 102, 130, K.woodDk);
}
function umbrella(p: P, x: number, z: number, c: string) { p.cyl(x, z, .08, 2.3, K.steelDk); p.sph(x, 2.3, z, 2.1, .45, 2.1, c); }
function tableSet(p: P, x: number, z: number, c: string) { p.cyl(x, z + 1.2, 1.1, .75, c); p.box(x - 1, z + .8, .5, .4, .4, K.woodDk); p.box(x + .5, z + .8, .5, .4, .4, K.woodDk); }
function gateRoad(p: P, q: Quality) {
  const r = { x: 48, y: 80, w: 24, h: 70 }; const cx = 60;
  p.box(cx - 5, 80, 10, 70, .04, K.paving, .02); p.box(cx - .25, 80, .5, 70, .06, K.yellow, .04);
  for (let z = 82; z < 148; z += 8) { for (const dx of [-5.4, 4.8]) p.box(cx + dx, z, .6, 2.5, .05, K.white, .03); p.box(cx - 1.4, z + 3, 2.8, .22, .05, K.white, .05); }
  for (let z = 84; z < 148; z += 12) { for (const dx of [-5.8, 5.8]) { lamp(p, cx + dx, z, 4); palm(p, cx + dx * 1.2, z + 6, 4.4 + (z % 3) * .3); } }
  for (let i = 0; i < 6; i++) { p.cyl(cx - 5.6, 100 + i * 1.6, .3, .8, K.yellow); p.cyl(cx + 5.6, 100 + i * 1.6, .3, .8, K.yellow); }
  const bx = 52, bz = 118; p.box(bx, bz, 6, 2, .1, K.steelDk, 2.6); for (const px of [bx, bx + 5.8]) p.box(px, bz, .2, 2, 2.6, K.steelDk); p.box(bx, bz + 1.8, 6, .2, 2.6, K.glass, .1); bench(p, bx + 2, bz + .6); lit(p, bx + .4, bz + .4, 5.2, .15, .3, K.blue, 2.7);
  for (let i = 0; i < 3; i++) flag(p, 55 + i * 5, 148, [K.blue, K.white, K.green][i]!, 5);
  if (q !== "low") for (let z = 90; z < 145; z += 10) { planter(p, cx - 7, z, 1.4, 1.4, K.leaf); planter(p, cx + 5.6, z, 1.4, 1.4, K.leaf); }
}

export const EXT_ARCH: Record<string, (p: P, q: Quality) => void> = {
  engineering_quarter: engineering, science_complex: science, medical_college: medical, arts_row: arts, business_law: business,
  hostel_estate_east: hostelEast, admin_quarter: admin, research_park: research, innovation_village: innovation,
  hostel_village: hostelVillage, market_town: market, gate_road: gateRoad,
};
