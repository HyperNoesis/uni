/* CAMPUS hero landmark: the Grand Gate (static, decorative, VISUAL ONLY; no collision is added).
 *
 * Tropical-modernist Nigerian campus gate, built from the shared P primitives (no external assets, no licence risk):
 *   - terrazzo plinths with speckle, terracotta + white breezeblock (cast-concrete lattice) screens on every pier face,
 *   - a deep cantilevered sunshade slab with hanging brise-soleil fins, navy edge band, a glowing blue-and-gold emblem,
 *   - a terrazzo forecourt with navy border inlay, perimeter breezeblock wall stubs, a glazed guard booth, flags and lamps.
 * The central walking lane (|x - cx| < 6) is left completely open. Deterministic: same inputs -> same primitives.
 * Look reference and rules: README "Art direction", docs/GRAPHICS_VISION.md. Coordinates: x,z world tiles (z == domain "y").
 */
import type { P, Quality } from "./world-architecture";

const C = {
  terrazzo: "#e9e3d6", terrazzoDk: "#cfc6b4", speckA: "#b9ad98", speckB: "#c9724a", speckC: "#7d8fa8", terracotta: "#b8613f", white: "#f4f1ea",
  navy: "#1f3a6e", blue: "#3675e7", gold: "#d9a93c", glass: "#8fd3ec", steelDk: "#4a5468", black: "#222831", lamp: "#fff1c4", warm: "#ffe2a0",
  leaf: "#74b050", green: "#3f8844", red: "#e8644a", shadow: "#2a3346",
};
const lit = (p: P, x: number, z: number, w: number, d: number, h: number, c: string, y0 = 0) => (p.lbox ?? p.box).call(p, x, z, w, d, h, c, y0);
const litS = (p: P, cx: number, cy: number, cz: number, w: number, h: number, d: number, c: string) => (p.lsph ?? p.sph).call(p, cx, cy, cz, w, h, d, c);
const rnd = (a: number, b: number) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

/** Breezeblock screen standing OUTSIDE a wall face (face coordinate `face`, outward direction dir = +1/-1): a dark backing, then a crossed grille of THIN
 *  bars (terracotta verticals, white horizontals) so the holes read as shadow. Bars are < .26 m thick and >= 1 m^2, which the renderer treats as flat
 *  panels (no brick/masonry coursing). axis "x": face lies in the x-y plane at z=face; "z": in the z-y plane at x=face. */
function breeze(p: P, axis: "x" | "z", a0: number, face: number, dir: 1 | -1, span: number, y0: number, hgt: number, cell: number, q: Quality, skew = 0) {
  const nA = Math.max(2, Math.round(span / cell)), nY = Math.max(2, Math.round(hgt / cell)), ca = span / nA, cy = hgt / nY, t = .2, bw = Math.max(.3, ca * .42), bh = Math.max(.42, cy * .5);
  const back = dir > 0 ? face : face - .16, bars = dir > 0 ? face + .16 : face - .16 - t;
  if (axis === "x") p.box(a0, back, span, .16, hgt, C.shadow, y0); else p.box(back, a0, .16, span, hgt, C.shadow, y0);
  const step = q === "low" ? 2 : 1;
  for (let i = skew % 2; i <= nA; i += step) { // verticals
    const o = Math.min(Math.max(a0 + i * ca - bw / 2, a0), a0 + span - bw);
    if (axis === "x") p.box(o, bars, bw, t, hgt, C.terracotta, y0); else p.box(bars, o, t, bw, hgt, C.terracotta, y0);
  }
  for (let j = 0; j <= nY; j += step) { // horizontals, one bar-thickness proud of the verticals
    const o = Math.min(Math.max(y0 + j * cy - bh / 2, y0), y0 + hgt - bh), b2 = bars + dir * .06;
    if (axis === "x") p.box(a0, b2, span, t, bh, C.white, o); else p.box(b2, a0, t, span, bh, C.white, o);
  }
}

/** Terrazzo slab: pale base with a scatter of chips (medium/high only). */
function terrazzo(p: P, x: number, z: number, w: number, d: number, h: number, y0: number, q: Quality, seed: number) {
  p.box(x, z, w, d, h, C.terrazzo, y0);
  if (q === "low") return;
  const n = q === "high" ? Math.round(w * d * .9) : Math.round(w * d * .4), cols = [C.speckA, C.speckB, C.speckC, C.terrazzoDk];
  for (let i = 0; i < n; i++) p.box(x + .1 + rnd(i, seed) * (w - .35), z + .1 + rnd(seed, i) * (d - .35), .22 + rnd(i, i + seed) * .16, .22 + rnd(i + 3, seed) * .14, .012, cols[i % 4]!, y0 + h);
}

export function grandGate(cx: number, z0: number, q: Quality, p: P): void {
  const low = q === "low", D = 5, H = 6.6, lane = 6.4, pierW = 3.4, outer = cx - 12, outerR = cx + 12;
  // --- forecourt: terrazzo with navy border inlay, centre line left to the road
  terrazzo(p, cx - lane - pierW - 1, z0 - 1.2, (lane + pierW + 1) * 2, D + 2.4, .05, .02, q, 7);
  p.box(cx - lane - pierW - 1, z0 - 1.2, (lane + pierW + 1) * 2, .22, .06, C.navy, .02); p.box(cx - lane - pierW - 1, z0 + D + 1, (lane + pierW + 1) * 2, .22, .06, C.navy, .02);
  for (const sd of [-1, 1]) {
    const px = sd < 0 ? cx - lane - pierW : cx + lane; // pier min-x
    // plinth + pier core
    terrazzo(p, sd < 0 ? px - .25 : px, z0 - .25, pierW + .25, D + .5, .55, 0, q, 11 + (sd > 0 ? 5 : 0)); // outer margin only: lane side stays flush
    p.box(px, z0, pierW, D, H, C.white, .55);
    p.box(px - .15, z0 - .15, pierW + .3, D + .3, .22, C.navy, H + .55 - .22); // pier cap band
    // breezeblock screens: front + back (z faces) and the lane-side face
    breeze(p, "x", px + .25, z0, -1, pierW - .5, 1.1, H - 1.2, .8, q, sd > 0 ? 1 : 0);
    breeze(p, "x", px + .25, z0 + D, 1, pierW - .5, 1.1, H - 1.2, .8, q, sd > 0 ? 0 : 1);
    breeze(p, "z", z0 + .25, sd < 0 ? px + pierW : px, sd < 0 ? 1 : -1, D - .5, 1.1, H - 1.2, .8, q, 0);
    // perimeter wall stub out to the district edge, breezeblock band over a solid terracotta base
    const wx = sd < 0 ? outer : px + pierW, ww = sd < 0 ? px - outer : outerR - (px + pierW);
    p.box(wx, z0 + 1.2, ww, D - 2.4, 1.0, C.terracotta, 0); p.box(wx - .05, z0 + 1.1, ww + .1, D - 2.2, .14, C.white, 1.0);
    if (!low) breeze(p, "x", wx + .1, z0 + 1.2, -1, ww - .2, 1.14, 1.0, .5, q, 1);
    // glowing vertical light strip on the road-facing corner
    lit(p, sd < 0 ? px + pierW - .08 : px - .02, z0 + .3, .1, .3, H - 1.4, C.lamp, .9);
  }
  // --- cantilevered sunshade slab (deep overhang) with navy edge band and terracotta soffit
  const sx = cx - lane - pierW - .8, sw = (lane + pierW + .8) * 2, sz = z0 - 1.6, sd2 = D + 3.2, sy = H + .55;
  p.box(sx, sz, sw, sd2, .24, C.white, sy + .26); p.box(sx, sz, sw, sd2, .24, C.white, sy); p.box(sx - .1, sz - .1, sw + .2, .22, .62, C.navy, sy - .06); p.box(sx - .1, sz + sd2 - .12, sw + .2, .22, .62, C.navy, sy - .06);
  p.box(sx + .3, sz + .3, sw - .6, sd2 - .6, .18, C.terracotta, sy - .18); // soffit
  // brise-soleil: vertical fins hanging under the slab across the lane (bottom at ~5.3 m, well above head height)
  const fins = low ? 6 : 14, span = lane * 2 - .6;
  for (let i = 0; i < fins; i++) { const fx = cx - span / 2 + (i + .5) * (span / fins); p.box(fx - .07, sz + .5, .14, sd2 - 1, 1.5, i % 2 ? C.white : C.terracotta, sy - 1.7 - .18); }
  // --- emblem: blue disc ringed in gold, lit, centred on the slab front; flanking finials
  litS(p, cx, sy + 2.0, z0 - 1.0, 3.2, 3.2, .5, C.gold); litS(p, cx, sy + 2.0, z0 - 1.12, 2.5, 2.5, .5, C.blue);
  p.box(cx - .22, z0 - 1.3, .44, .5, 1.0, C.white, sy + .5);
  if (!low) { p.box(cx - 1.4, z0 - 1.4, 2.8, .12, .12, C.white, sy + 1.95); lit(p, cx - .9, z0 - 1.46, 1.8, .08, .1, C.warm, sy + 2.55); }
  for (const sd of [-1, 1]) litS(p, cx + sd * (lane + pierW / 2), sy + .75, z0 + D / 2, .9, .9, .9, C.lamp);
  // --- flagpoles on the slab edge (blue / white / green, same family as the Gate Road row)
  for (const [fx, c] of [[cx - 5.2, C.blue], [cx, C.white], [cx + 5.2, C.green]] as const) { if (low && fx === cx) continue; p.cyl(fx, z0 + D + .9, .12, 4.6, C.steelDk, sy + .5); p.box(fx + .06, z0 + D + .87, 1.2, .06, .7, c, sy + 4.3); }
  // --- glazed guard booth beside the lane, inside the wall stub, with a sloped-look roof slab
  const bx = cx + lane + pierW + .05, bz = z0 + D + .8;
  p.box(bx, bz, 2.0, 2.0, .3, C.terrazzo, 0); p.box(bx + .1, bz + .1, 1.8, 1.8, 2.3, C.white, .3);
  p.box(bx + .2, bz + .02, 1.6, .1, 1.2, C.glass, 1.0); p.box(bx - .15, bz - .15, 2.3, 2.3, .22, C.navy, 2.6);
  if (!low) lit(p, bx + .4, bz + .06, 1.2, .06, .14, C.warm, 2.45);
  // --- planting at the pier feet (kerb + shrubs), medium+ only
  if (!low) for (const sd of [-1, 1]) {
    const px = sd < 0 ? cx - lane - pierW - 1.6 : cx + lane + pierW + .6;
    p.box(px, z0 + D + 1.2, 1.0, 4, .25, C.terrazzo, 0); p.box(px + .08, z0 + D + 1.28, .84, 3.84, .08, C.green, .25);
    p.sph(px + .5, .75, z0 + D + 2.2, 1.0, .8, 1.0, C.leaf); p.sph(px + .5, .75, z0 + D + 4.0, .9, .7, .9, C.green);
  }
}
