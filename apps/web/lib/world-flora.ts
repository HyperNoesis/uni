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
  if (p.tri) {
    // Pinnate fronds as real geometry: an arched rachis (rises, then droops) with tapered leaflet triangles on both sides.
    const N = quality === "low" ? 5 : quality === "medium" ? 7 : 9, tri = p.tri.bind(p);
    for (let f = 0; f < nf; f++) {
      const a = f * (Math.PI * 2 / nf) + s * 6.28, ca = Math.cos(a), sa = Math.sin(a), px = -sa, pz = ca; // pz/px: horizontal perpendicular
      const L = 1.75 + h2(x + f, z - f) * .55, old = f % 3, rise = old === 0 ? .62 : old === 1 ? .46 : .34, drop = old === 0 ? .95 : old === 1 ? 1.1 : 1.3;
      const R = (t: number): [number, number, number] => [cx + ca * L * t, cy + .1 + L * (rise * t - drop * t * t), z + sa * L * t];
      for (let i = 0; i < N; i++) {
        const t0 = i / N, t1 = (i + 1) / N, A = R(t0), B = R(t1), M = R((t0 + t1) / 2);
        const lw = (.26 + .16 * Math.sin(Math.PI * Math.min(1, (i + .6) / (N + .3)))) * (1 - .5 * t1 * t1), dn = .12 + .4 * t1;
        const shade = i / N, c = f % 2 ? (shade < .5 ? "#3a7a31" : "#4f9a3e") : (shade < .5 ? "#2f6b2d" : "#63a944");
        for (const sd of [-1, 1]) tri(A[0], A[1], A[2], B[0], B[1], B[2], M[0] + px * lw * sd, M[1] - dn * lw, M[2] + pz * lw * sd, c);
      }
    }
  } else {
  for (let f = 0; f < nf; f++) {
      const a = f * (Math.PI * 2 / nf) + s * 6.28, ca = Math.cos(a), sa = Math.sin(a), tone = f % 3;
      const c1 = tone === 0 ? "#4f9a3e" : tone === 1 ? "#3f8636" : "#63a944", c2 = tone === 0 ? "#3c7d34" : tone === 1 ? "#2f6b2d" : "#4c8f3b";
      const len = 1.2 + s * .3;
      // pointed, flattened blades (ellipsoids) that rise from the crown then droop: reads as a curved palm leaf
      leaf(cx + ca * .7, cy + .22, z + sa * .7, 1.6, .09, .55, c1, -a);
      leaf(cx + ca * (.7 + len * .9), cy + .08 - (f % 2) * .05, z + sa * (.7 + len * .9), 1.7, .08, .62, c1, -a);
      if (quality !== "low") leaf(cx + ca * (.7 + len * 1.85), cy - .42, z + sa * (.7 + len * 1.85), 1.35, .07, .42, c2, -a);
    }
  }
  p.sph(cx, cy - .12, z, .42, .38, .42, "#5a3d22");                       // coconut cluster
  p.sph(cx, cy + .08, z, .5, .4, .5, "#3f7f33");
}

const shade = (hex: string, a: number) => { const n = parseInt(hex.replace("#", ""), 16), f = (c: number) => Math.max(0, Math.min(255, Math.round(a >= 0 ? c + (255 - c) * a : c * (1 + a)))); return "#" + ((1 << 24) + (f(n >> 16 & 255) << 16) + (f(n >> 8 & 255) << 8) + f(n & 255)).toString(16).slice(1); };
/** Scatter small outward-pointing leaf triangles over an ellipsoidal canopy (breaks the smooth-ball silhouette). No-op when the builder has no tri(). */
export function leafFringe(p: P, cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, color: string, count: number, seed: number, flat = false) {
  if (!p.tri || count <= 0) return;
  for (let i = 0; i < count; i++) {
    const r1 = h2(seed + i * 1.7, i * 3.1), r2 = h2(i * 2.3, seed - i), r3 = h2(seed * 1.3 + i, i * .7);
    const th = r1 * 6.2832, ph = flat ? .9 + r2 * .5 : .3 + r2 * 1.5, sx = Math.sin(ph) * Math.cos(th), sy = Math.cos(ph), sz = Math.sin(ph) * Math.sin(th);
    const px = cx + sx * rx, py = cy + sy * ry, pz = cz + sz * rz;
    let nx = sx / rx, ny = sy / ry, nz = sz / rz; const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    let tx = nz, tz = -nx; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    // Drooping shingle leaf: base on the canopy surface, tip hangs down ALONG the surface (reads as layered foliage, not thorns).
    let dx = -ny * nx, dy = -1 + ny * ny, dz = -ny * nz; const dl = Math.hypot(dx, dy, dz) || 1; dx /= dl; dy /= dl; dz /= dl;
    const L = .62 + r3 * .4, w = .3 + r3 * .16, col = shade(color, (r3 - .55) * .26 + (sy > .4 ? .05 : -.06));
    p.tri(px + tx * w, py, pz + tz * w, px - tx * w, py, pz - tz * w, px + dx * L + nx * .18, py + dy * L + ny * .18, pz + dz * L + nz * .18, col);
  }
}
