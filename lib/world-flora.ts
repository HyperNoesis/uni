// @ts-nocheck
/* Shared planting kit (visual bible v2): one palm used by every zone so the campus reads as one landscape. */
import type { P } from "./world-architecture";

const h2 = (x: number, z: number) => { const v = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return v - Math.floor(v); };

/** Ringed, slightly leaning trunk + 9 arched fronds (rising blade -> drooping tip) around a coconut crown. */
export function palmTree(p: P, x: number, z: number, H = 4.6, quality: "low" | "medium" | "high" = "high") {
  const s = h2(x, z), lean = (s - .5) * .7, nf = quality === "low" ? 6 : 9;
  p.cyl(x, z, .62, .22, "#a8613c");                                        // planter ring / root flare
  const segs = quality === "low" ? 2 : 4;
  for (let i = 0; i < segs; i++) {                                         // curved trunk built from tapered, offset drums
    const t = (i + .5) / segs, w = .42 - t * .14, cx = x + lean * t * t * 1.4;
    p.cyl(cx, z, w, H / segs + .02, i % 2 ? "#8a6240" : "#7a5636", (H / segs) * i);
  }
  const cx = x + lean * 1.4, cy = H;
  const leaf = (cx2: number, cy2: number, cz2: number, w: number, h: number, d: number, c: string, rot: number) =>
    (p.rsph ? p.rsph(cx2, cy2, cz2, w, h, d, c, rot) : p.rbox(cx2, cy2, cz2, w, h, d, c, rot));
  for (let f = 0; f < nf; f++) {
    const a = f * (Math.PI * 2 / nf) + s * 6.28, ca = Math.cos(a), sa = Math.sin(a), tone = f % 3;
    const c1 = tone === 0 ? "#4f9a3e" : tone === 1 ? "#3f8636" : "#63a944", c2 = tone === 0 ? "#3c7d34" : tone === 1 ? "#2f6b2d" : "#4c8f3b";
    const len = 1.2 + s * .3;
    // pointed, flattened blades (ellipsoids) that rise from the crown then droop: reads as a curved palm leaf
    leaf(cx + ca * .7, cy + .22, z + sa * .7, 1.6, .09, .55, c1, -a);
    leaf(cx + ca * (.7 + len * .9), cy + .08 - (f % 2) * .05, z + sa * (.7 + len * .9), 1.7, .08, .62, c1, -a);
    if (quality !== "low") leaf(cx + ca * (.7 + len * 1.85), cy - .42, z + sa * (.7 + len * 1.85), 1.35, .07, .42, c2, -a);
  }
  p.sph(cx, cy - .12, z, .42, .38, .42, "#5a3d22");                       // coconut cluster
  p.sph(cx, cy + .08, z, .5, .4, .5, "#3f7f33");
}
