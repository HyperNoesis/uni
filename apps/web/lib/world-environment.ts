/* CAMPUS surrounding environment (static, decorative, OUTSIDE the walkable 120x80 world).
 * Gives the campus a horizon: treeline belt, distant faculty wings + city skyline, rolling hills.
 * Baked by the renderer into ONE mesh per quality (1 draw call). Seeded + deterministic; no collision. */
import type { P, Quality } from "./world-architecture";
import { leafFringe } from "./world-flora";
const W = 240, H = 192;
const rnd = (a: number, b: number) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
const CONC = ["#d8d2c4", "#cfc8b8", "#e4d4b9", "#c9c2b4"], GLASS = "#a8e3f6", TINT = ["#8fb4cf", "#9db8c9", "#b5c6d4"];
const GREENS = [["#2b6f33", "#4a9040"], ["#2f6a34", "#558f3e"], ["#26623a", "#437f45"], ["#3a7a38", "#6aa84f"]] as const;

function tree(p: P, x: number, z: number, s: number, q: Quality) {
  const g = GREENS[Math.floor(rnd(x, z) * GREENS.length)]!;
  p.cyl(x, z, .4 * s, 2.2 * s, "#6d4a2e");
  p.sph(x, 3.0 * s, z, 3.6 * s, 3.0 * s, 3.4 * s, g[0]);
  if (q !== "low") leafFringe(p, x, 3.0 * s, z, 1.8 * s, 1.5 * s, 1.7 * s, g[0], 46, x + z * 3);
  if (q !== "low") p.sph(x - .5 * s, 3.9 * s, z + .2 * s, 2.5 * s, 2.0 * s, 2.4 * s, g[1]);
}
function wing(p: P, x: number, z: number, w: number, d: number, h: number, seed: number, q: Quality, face: "n" | "s" | "e" | "w") {
  const c = CONC[Math.floor(rnd(seed, 1) * CONC.length)]!, t = TINT[Math.floor(rnd(seed, 2) * TINT.length)]!;
  p.box(x, z, w, d, h, c); p.box(x - .2, z - .2, w + .4, d + .4, .5, "#b5ad9d");        // body + plinth
  p.box(x - .3, z - .3, w + .6, d + .6, .4, "#8a8478", h);                                // roof parapet
  const floors = Math.max(2, Math.floor(h / 3.2));
  // Pass Q: structural piers, terracotta band + roof plant so distant wings read as designed buildings, not slabs.
  const ACC = ["#c9724a", "#e8a24a", "#3675e7", "#3f8844"][Math.floor(rnd(seed, 3) * 4)]!;
  if (q !== "low") {
    const along = face === "s" || face === "n" ? w : d;
    for (let i = 0; i <= Math.floor(along / 3.4); i++) {
      const o = .4 + i * 3.4; if (o > along - .3) break;
      if (face === "s") p.box(x + o, z + d, .38, .45, h - .4, "#efe6d4", .5);
      else if (face === "n") p.box(x + o, z - .45, .38, .45, h - .4, "#efe6d4", .5);
      else if (face === "e") p.box(x + w, z + o, .45, .38, h - .4, "#efe6d4", .5);
      else p.box(x - .45, z + o, .45, .38, h - .4, "#efe6d4", .5);
    }
    if (face === "s") p.box(x - .1, z + d - .03, w + .2, .1, .35, ACC, 3.0); else if (face === "n") p.box(x - .1, z - .07, w + .2, .1, .35, ACC, 3.0);
    else if (face === "e") p.box(x + w - .03, z - .1, .1, d + .2, .35, ACC, 3.0); else p.box(x - .07, z - .1, .1, d + .2, .35, ACC, 3.0);
    p.box(x + w * .22, z + d * .25, w * .3, d * .45, 1.7, "#c4bba8", h + .4); p.cyl(x + w * .72, z + d * .5, 1.8, 1.6, "#8d98aa", h + .4);
  }
  for (let f = 0; f < floors; f++) {
    const y = 1.2 + f * 3.2;
    // glazed ribbon on the campus-facing side, sunshade ribs in front of it
    if (face === "s") { p.box(x + .8, z + d - .02, w - 1.6, .06, 1.6, t, y); if (q !== "low") p.box(x + .8, z + d, w - 1.6, .5, .12, "#f4f1ea", y + 1.65); }
    if (face === "n") { p.box(x + .8, z - .04, w - 1.6, .06, 1.6, t, y); if (q !== "low") p.box(x + .8, z - .5, w - 1.6, .5, .12, "#f4f1ea", y + 1.65); }
    if (face === "e") { p.box(x + w - .02, z + .8, .06, d - 1.6, 1.6, t, y); }
    if (face === "w") { p.box(x - .04, z + .8, .06, d - 1.6, 1.6, t, y); }
  }
  if (q !== "low" && h > 9 && p.lbox) { // night-lit window slits (glass colour triggers the window glow in the shader)
    for (let i = 0; i < 5; i++) { const fx = x + 1.2 + rnd(seed, i) * Math.max(1, w - 3); if (face === "s") p.lbox(fx, z + d + .02, .9, .06, 1.1, GLASS, 2 + (i % 3) * 3.2); if (face === "n") p.lbox(fx, z - .08, .9, .06, 1.1, GLASS, 2 + (i % 3) * 3.2); }
  }
}
/** Distant faculty wings [x, z, w, d, h, face-towards-campus]: boxes by default, Kenney model buildings (world-backdrop.ts) when loaded. */
export const WINGS: [number, number, number, number, number, "n" | "s" | "e" | "w"][] = [
  [-30, -30, 26, 9, 11, "s"], [8, -34, 22, 10, 15, "s"], [44, -36, 18, 8, 9, "s"], [78, -33, 28, 10, 13, "s"], [112, -30, 22, 9, 10, "s"],
  [-36, 10, 10, 26, 12, "e"], [-34, 48, 9, 20, 9, "e"],
  [W + 10, 8, 10, 24, 14, "w"], [W + 8, 44, 10, 22, 10, "w"],
  [-24, H + 16, 24, 9, 12, "n"], [14, H + 20, 20, 9, 8, "n"], [82, H + 18, 24, 10, 13, "n"], [112, H + 14, 22, 9, 10, "n"],
  // large-world additions: far north/east/south/west rims so the bigger campus still has a horizon
  [146, -34, 24, 10, 12, "s"], [182, -32, 26, 9, 14, "s"], [218, -33, 22, 10, 11, "s"],
  [-36, 86, 10, 24, 11, "e"], [W + 10, 84, 10, 24, 12, "w"], [W + 8, 118, 10, 22, 9, "w"], [-34, 122, 9, 20, 10, "e"],
  [150, H + 16, 24, 9, 11, "n"], [190, H + 20, 22, 9, 13, "n"], [-30, H + 38, 22, 9, 9, "n"], [214, H + 18, 22, 9, 12, "n"],
];

export function environment(p: P, q: Quality, opts?: { models?: boolean }) {
  const step = q === "low" ? 7 : q === "medium" ? 4.6 : 3.6;
  // ---- treeline belt: 2-3 staggered rows just outside the playable edge (a gap is left for the main gate road) ----
  const rows = q === "low" ? 1 : q === "medium" ? 2 : 3;
  for (let r = 0; r < rows; r++) {
    const off = 5 + r * 4.2;
    for (let x = -off; x <= W + off; x += step) {
      for (const z of [-off, H + off]) {
        if (z > H && x > 52 && x < 68) continue;                       // road into the gate
        tree(p, x + (rnd(x, z) - .5) * 2.4, z + (rnd(z, x) - .5) * 2.4, .85 + rnd(x + r, z) * .55, q);
      }
    }
    for (let z = -off + step; z < H + off; z += step) for (const x of [-off, W + off]) tree(p, x + (rnd(x, z) - .5) * 2.4, z + (rnd(z, x) - .5) * 2.4, .85 + rnd(x, z + r) * .55, q);
  }
  // ---- distant faculty wings (hero background kit: same facade grammar as the campus, just simplified) ----
  const stop = opts?.models ? 0 : q === "low" ? 7 : WINGS.length;
  for (let i = 0; i < stop; i++) { const [x, z, w, d, h, f] = WINGS[i]!; wing(p, x, z, w, d, h, i + 3, q, f); }
  // ---- city skyline silhouette far north (taller, simpler, slightly blue = atmospheric depth) ----
  if (q !== "low" && !opts?.models) for (let i = 0; i < (q === "high" ? 16 : 9); i++) {
    const x = -50 + i * (q === "high" ? 22 : 40) + rnd(i, 7) * 5, h = 18 + rnd(i, 3) * 38, w = 5 + rnd(i, 4) * 6;
    p.box(x, -62 - rnd(i, 5) * 8, w, 6, h, i % 3 ? "#9fb4c9" : "#b3bfcc"); if (p.lbox && q === "high") p.lbox(x + 1, -62 - rnd(i, 5) * 8 + 6.02, w - 2, .06, h * .55, GLASS, 3);
  }
  // ---- rolling hills (flattened spheres, faded by fog into the sky) ----
  for (let i = 0; i < (q === "low" ? 4 : 9); i++) { const a = i / 9 * Math.PI * 2 + .3; p.sph(W / 2 + Math.cos(a) * 230, 2, H / 2 + Math.sin(a) * 200, 55 + rnd(i, 9) * 25, 16 + rnd(i, 2) * 10, 50, "#5f8f55"); }
}
