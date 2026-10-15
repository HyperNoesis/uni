/* Campus backdrop: real (Kenney CC0, baked by scripts/models/import-backdrop.sh) commercial buildings + skyscrapers placed where the
 * environment's box "faculty wings" and skyline used to be. Pure data, deterministic, no collision (all outside the walkable world). */
import { WINGS } from "./world-environment";

export type Backdrop = { model: string; x: number; y: number; rot: number; scale: number };
const rnd = (a: number, b: number) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
/** Model footprints at scale 1 (w x d, metres), mirrored from assets.json. */
const MODELS: Record<string, { w: number; d: number }> = {
  kn_bd_a: { w: 11.9, d: 12.7 }, kn_bd_b: { w: 13.1, d: 12.7 }, kn_bd_c: { w: 11.9, d: 14.7 }, kn_bd_d: { w: 11.3, d: 12.2 },
  kn_bd_e: { w: 22.1, d: 13.6 }, kn_bd_f: { w: 11.3, d: 13.9 }, kn_bd_g: { w: 13.1, d: 12.4 }, kn_bd_h: { w: 11.9, d: 13.6 },
};
const NORMAL = Object.keys(MODELS).filter((m) => m !== "kn_bd_e");
/** Yaw that turns a model's front (+z in the glb) towards the campus, by wing face. */
const YAW: Record<string, number> = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 };

export const BACKDROP: Backdrop[] = (() => {
  const out: Backdrop[] = [];
  WINGS.forEach(([x, z, w, d, , face], wi) => {
    const horiz = face === "s" || face === "n", along = horiz ? w : d, across = horiz ? d : w;
    const n = Math.max(1, Math.round(along / 13)), step = along / n;
    for (let i = 0; i < n; i++) {
      const seed = wi * 31 + i, wide = along >= 22 && n === 1 && rnd(seed, 5) > .4;
      const model = wide ? "kn_bd_e" : NORMAL[Math.floor(rnd(seed, 1) * NORMAL.length)]!;
      const m = MODELS[model]!, scale = (.88 + rnd(seed, 2) * .3) * Math.min(1.25, step / m.w * 1.02);
      const a = (i + .5) * step, c = across / 2 + (rnd(seed, 3) - .5) * 2;
      out.push({ model, x: horiz ? x + a : x + c, y: horiz ? z + c : z + a, rot: YAW[face]! + (rnd(seed, 4) - .5) * .06, scale });
    }
  });
  // far skyline: taller towers behind the north rim
  const SKY = ["kn_bd_sky_a", "kn_bd_sky_c", "kn_bd_sky_d", "kn_bd_sky_c", "kn_bd_sky_a"];
  for (let i = 0; i < 12; i++) out.push({ model: SKY[i % SKY.length]!, x: -60 + i * 26 + rnd(i, 7) * 8, y: -78 - rnd(i, 5) * 14, rot: 0, scale: .9 + rnd(i, 9) * .4 });
  return out;
})();
