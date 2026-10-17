#!/usr/bin/env node
/* CAMPUS Grand Gate kit v2 - original, procedurally authored GLBs (no third-party assets, no licence risk).
 * Run: node scripts/models/build-grand-gate.mjs [outDir]   (default apps/web/public/assets/gate)
 * Format matches the v1 kit: POSITION + NORMAL + COLOR_0 (vertex colour), uint16 indices, no materials.
 * Emissive geometry = vertex colour + 2.0 per channel (the shader's emissive flag, see world-shaders.ts).
 * Frame: x = lateral (width), y = up, z = depth. FRONT (arrival side) faces +z. Origin = centre of footprint at ground level.
 * Every piece is x-symmetric (and the wing/tower z-symmetric) so one GLB serves both sides via rot 0 / rot PI.
 */
import fs from "node:fs";
import path from "node:path";

const OUT = process.argv[2] ?? "apps/web/public/assets/gate";
fs.mkdirSync(OUT, { recursive: true });

const hex = (h) => { const n = parseInt(h.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
const lit = (h, k = 1) => hex(h).map((v) => Math.min(1, v * k) + 2); // emissive
const C = {
  cream: hex("#eee6d4"), creamDk: hex("#d9cfb9"), stone: hex("#cdbfa3"), stoneDk: hex("#a99b82"), stoneLt: hex("#e3d8c0"), travertine: hex("#d4c4a2"),
  terrazzo: hex("#e9e3d6"), terrazzoDk: hex("#cfc6b4"), terracotta: hex("#b8613f"), terraDk: hex("#8e4a30"), white: hex("#f6f2ea"),
  navy: hex("#1f3a6e"), navyDk: hex("#142848"), blue: hex("#3675e7"), gold: hex("#d9a93c"), goldDk: hex("#a9822a"), glass: hex("#86c3d8"), glassDk: hex("#4f8fa8"),
  steel: hex("#5b6679"), steelLt: hex("#aeb6c4"), black: hex("#232832"), shadow: hex("#2a3346"), timber: hex("#9a6a3c"), timberDk: hex("#6f4a29"),
  leaf: hex("#5f9a42"), leafDk: hex("#3f7a38"), leafLt: hex("#86b84e"), soil: hex("#5a4432"), grass: hex("#c9b565"), rock: hex("#8d8f95"),
  red: hex("#d94a55"), pink: hex("#e0559b"), yellow: hex("#f2c230"), orange: hex("#ec7a2c"), path: hex("#d8cdb6"), asphalt: hex("#3a3f48"),
};
const WARM = "#ffe2a0";

class Mesh {
  constructor(name, seed = 1, grad = true) { this.name = name; this.P = []; this.N = []; this.Cc = []; this.I = []; this.s = seed; this.grad = grad; }
  r() { this.s = (this.s * 16807) % 2147483647; return this.s / 2147483647; }
  /** push one flat quad (4 points in any order of a planar quad); orientation fixed so the geometric normal matches `n`. */
  quad(a, b, c, d, n, col) {
    const cr = [(b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])];
    if (cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] < 0) [b, d] = [d, b];
    const base = this.P.length / 3;
    for (const p of [a, b, c, d]) { this.P.push(p[0], p[1], p[2]); this.N.push(n[0], n[1], n[2]); this.Cc.push(col[0], col[1], col[2]); }
    this.I.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  /** Box centred in x/z at (cx,cz), bottom at y0. Optional rz (rotate about Z through box centre) for diagonal strokes. */
  bx(cx, y0, cz, w, h, d, col, o = {}) {
    const j = o.j ?? 0.05, k = 1 + (this.r() - 0.5) * j * 2, em = col[0] > 1.5;
    const cc = em ? col : [col[0] * k, col[1] * k, col[2] * k];
    const hx = w / 2, hy = h / 2, hz = d / 2, cy = y0 + hy, rz = o.rz ?? 0, cs = Math.cos(rz), sn = Math.sin(rz);
    const T = (x, y, z) => [cx + x * cs - y * sn, cy + x * sn + y * cs, cz + z];
    const R = (x, y, z) => { const v = [x * cs - y * sn, x * sn + y * cs, z]; return v; };
    const f = [
      [[1, 0, 0], [[hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz], [hx, -hy, hz]]], [[-1, 0, 0], [[-hx, -hy, -hz], [-hx, hy, -hz], [-hx, hy, hz], [-hx, -hy, hz]]],
      [[0, 1, 0], [[-hx, hy, -hz], [hx, hy, -hz], [hx, hy, hz], [-hx, hy, hz]]], [[0, -1, 0], [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]]],
      [[0, 0, 1], [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]]], [[0, 0, -1], [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz]]],
    ];
    for (const [n, q] of f) this.quad(T(...q[0]), T(...q[1]), T(...q[2]), T(...q[3]), R(...n), cc);
  }
  /** Frustum (rectangular), bottom (w0,d0) at y0, top (w1,d1) at y0+h. */
  fr(cx, y0, cz, w0, d0, w1, d1, h, col) {
    const k = 1 + (this.r() - 0.5) * 0.08, cc = col[0] > 1.5 ? col : col.map((v) => v * k), y1 = y0 + h;
    const B = [[cx - w0 / 2, y0, cz - d0 / 2], [cx + w0 / 2, y0, cz - d0 / 2], [cx + w0 / 2, y0, cz + d0 / 2], [cx - w0 / 2, y0, cz + d0 / 2]];
    const T = [[cx - w1 / 2, y1, cz - d1 / 2], [cx + w1 / 2, y1, cz - d1 / 2], [cx + w1 / 2, y1, cz + d1 / 2], [cx - w1 / 2, y1, cz + d1 / 2]];
    for (let i = 0; i < 4; i++) {
      const a = B[i], b = B[(i + 1) % 4], c = T[(i + 1) % 4], d = T[i];
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
      let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; const l = Math.hypot(...n) || 1; n = n.map((x) => x / l);
      this.quad(a, b, c, d, n, cc);
    }
    this.quad(T[0], T[1], T[2], T[3], [0, 1, 0], cc); this.quad(B[0], B[1], B[2], B[3], [0, -1, 0], cc);
  }
  /** Cylinder about y (axis "y") or about z (axis "z", for round emblems facing the viewer). Smooth side normals. */
  cyl(cx, y0, cz, r, h, n, col, axis = "y", r2 = r) {
    const k = 1 + (this.r() - 0.5) * 0.06, cc = col[0] > 1.5 ? col : col.map((v) => v * k), base = this.P.length / 3;
    const pt = (a, t, rr) => axis === "y" ? [cx + Math.cos(a) * rr, y0 + t * h, cz + Math.sin(a) * rr] : [cx + Math.cos(a) * rr, y0 + Math.sin(a) * rr, cz + (t - 0.5) * h];
    const nm = (a) => axis === "y" ? [Math.cos(a), 0, Math.sin(a)] : [Math.cos(a), Math.sin(a), 0];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      for (const t of [0, 1]) { const p = pt(a, t, t ? r2 : r), nn = nm(a); this.P.push(...p); this.N.push(...nn); this.Cc.push(...cc); }
    }
    for (let i = 0; i < n; i++) { const a = base + i * 2; this.I.push(a, a + 1, a + 3, a, a + 3, a + 2); }
    for (const t of [0, 1]) {
      const c0 = this.P.length / 3, cp = pt(0, t, 0), nn = axis === "y" ? [0, t ? 1 : -1, 0] : [0, 0, t ? 1 : -1], rr = t ? r2 : r;
      this.P.push(cp[0], cp[1], cp[2]); this.N.push(...nn); this.Cc.push(...cc);
      for (let i = 0; i <= n; i++) { const p = pt((i / n) * Math.PI * 2, t, rr); this.P.push(...p); this.N.push(...nn); this.Cc.push(...cc); }
      for (let i = 0; i < n; i++) { const a = c0 + 1 + i; if (t) this.I.push(c0, a + 1, a); else this.I.push(c0, a, a + 1); }
    }
  }
  /** Stroke (rotated box in the x-y plane) from p to q, thickness t, depth d, bottom of depth at z0. */
  seg(x1, y1, x2, y2, t, d, z0, col) {
    const L = Math.hypot(x2 - x1, y2 - y1) + t * 0.9, a = Math.atan2(y2 - y1, x2 - x1);
    this.bx((x1 + x2) / 2, (y1 + y2) / 2 - t / 2, z0 + d / 2, L, t, d, col, { rz: a, j: 0 });
  }
  finish() {
    if (this.grad) for (let i = 0; i < this.P.length / 3; i++) {
      if (this.Cc[i * 3] > 1.5) continue;
      const f = 1 - 0.3 * Math.exp(-Math.max(0, this.P[i * 3 + 1]) / 1.4);
      this.Cc[i * 3] *= f; this.Cc[i * 3 + 1] *= f; this.Cc[i * 3 + 2] *= f;
    }
    return this;
  }
}

function glb(mesh, outPath, lift = false, scale = 1) {
  mesh.finish();
  const n = mesh.P.length / 3; let yOffset = 0;
  if (scale !== 1) for (let i = 0; i < mesh.P.length; i++) mesh.P[i] *= scale; // uniform scale (normals unchanged)
  if (lift) { let lo = 1e9; for (let i = 0; i < n; i++) lo = Math.min(lo, mesh.P[i * 3 + 1]); for (let i = 0; i < n; i++) mesh.P[i * 3 + 1] -= lo; yOffset = +lo.toFixed(3); } // authored at height: GLB sits on y=0, manifest/assets carry yOffset
  if (n > 65535) throw new Error(`${mesh.name}: ${n} verts exceeds uint16`);
  let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (let i = 0; i < n; i++) for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], mesh.P[i * 3 + a]); mx[a] = Math.max(mx[a], mesh.P[i * 3 + a]); }
  const pos = Buffer.from(new Float32Array(mesh.P).buffer), nor = Buffer.from(new Float32Array(mesh.N).buffer), col = Buffer.from(new Float32Array(mesh.Cc).buffer);
  let idx = Buffer.from(new Uint16Array(mesh.I).buffer); const pad = (4 - (idx.length % 4)) % 4; if (pad) idx = Buffer.concat([idx, Buffer.alloc(pad)]);
  const bin = Buffer.concat([pos, nor, col, idx]);
  const json = {
    asset: { version: "2.0", generator: "campus-grand-gate-kit (scripts/models/build-grand-gate.mjs)" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: mesh.name }],
    meshes: [{ name: mesh.name, primitives: [{ attributes: { POSITION: 0, NORMAL: 1, COLOR_0: 2 }, indices: 3, mode: 4 }] }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: n, type: "VEC3", min: mn, max: mx }, { bufferView: 1, componentType: 5126, count: n, type: "VEC3" },
      { bufferView: 2, componentType: 5126, count: n, type: "VEC3" }, { bufferView: 3, componentType: 5123, count: mesh.I.length, type: "SCALAR" }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: pos.length, target: 34962 }, { buffer: 0, byteOffset: pos.length, byteLength: nor.length, target: 34962 },
      { buffer: 0, byteOffset: pos.length + nor.length, byteLength: col.length, target: 34962 }, { buffer: 0, byteOffset: pos.length + nor.length + col.length, byteLength: mesh.I.length * 2, target: 34963 }],
    buffers: [{ byteLength: bin.length }],
  };
  let js = Buffer.from(JSON.stringify(json)); const jp = (4 - (js.length % 4)) % 4; js = Buffer.concat([js, Buffer.alloc(jp, 0x20)]);
  const total = 12 + 8 + js.length + 8 + bin.length, h = Buffer.alloc(12); h.write("glTF", 0); h.writeUInt32LE(2, 4); h.writeUInt32LE(total, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(js.length, 0); jh.write("JSON", 4); const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.write("BIN\0", 4);
  fs.writeFileSync(outPath, Buffer.concat([h, jh, js, bh, bin]));
  return { name: mesh.name, yOffset, bytes: total, tris: mesh.I.length / 3, verts: n, size: { w: +(mx[0] - mn[0]).toFixed(3), h: +(mx[1] - mn[1]).toFixed(3), d: +(mx[2] - mn[2]).toFixed(3) }, min: mn.map((v) => +v.toFixed(3)), max: mx.map((v) => +v.toFixed(3)) };
}

/** Breeze-block (jali) panel standing proud of a wall face: dark backing, terracotta verticals, white horizontals, navy frame. */
function jali(m, axis, face, dir, a0, span, y0, h, cell) {
  const nA = Math.max(2, Math.round(span / cell)), nY = Math.max(2, Math.round(h / cell)), ca = span / nA, cy = h / nY;
  const put = (aC, yB, aw, hh, off, th, col) => { const dc = face + dir * (off + th / 2); if (axis === "x") m.bx(aC, yB, dc, aw, hh, th, col, { j: 0.03 }); else m.bx(dc, yB, aC, th, hh, aw, col, { j: 0.03 }); };
  put(a0 + span / 2, y0, span, h, 0, 0.1, C.shadow);
  for (let i = 0; i <= nA; i++) put(Math.min(Math.max(a0 + i * ca, a0 + 0.1), a0 + span - 0.1), y0, 0.2, h, 0.1, 0.16, i % 2 ? C.terracotta : C.terraDk);
  for (let j = 1; j < nY; j++) put(a0 + span / 2, y0 + j * cy - 0.09, span, 0.18, 0.18, 0.1, C.white);
  put(a0 + span / 2, y0, span, 0.26, 0.1, 0.3, C.navy); put(a0 + span / 2, y0 + h - 0.26, span, 0.26, 0.1, 0.3, C.navy);
  put(a0 + 0.13, y0, 0.26, h, 0.1, 0.3, C.navy); put(a0 + span - 0.13, y0, 0.26, h, 0.1, 0.3, C.navy);
}

// ---------------------------------------------------------------- TOWER (pylon) - 7.2 x 6.4 footprint, ~19.6 m tall, symmetric (x and z)
function tower() {
  const m = new Mesh("gate_tower", 11), W = 7.2, D = 6.4, hw = W / 2, hd = D / 2;
  m.bx(0, 0, 0, W + 1.9, 0.25, D + 1.9, C.stoneDk); m.bx(0, 0.25, 0, W + 1.2, 0.3, D + 1.2, C.stone); m.bx(0, 0.55, 0, W + 0.55, 0.35, D + 0.55, C.terrazzo);
  for (let i = 0; i < 70; i++) { const side = i % 4, t = m.r(); const x = side < 2 ? (t - 0.5) * (W + 0.3) : (side === 2 ? 1 : -1) * (hw + 0.17 + m.r() * 0.2); const z = side < 2 ? (side ? 1 : -1) * (hd + 0.17 + m.r() * 0.2) : (m.r() - 0.5) * (D + 0.3); m.bx(x, 0.9, z, 0.2, 0.012, 0.16, [C.stoneDk, C.terracotta, C.glassDk, C.terrazzoDk][i % 4], { j: 0 }); }
  m.bx(0, 0.9, 0, W + 0.3, 2.5, D + 0.3, C.travertine);
  for (let y = 1.4; y < 3.4; y += 0.5) { m.bx(0, y, hd + 0.17, W + 0.3, 0.04, 0.03, C.stoneDk, { j: 0 }); m.bx(0, y, -hd - 0.17, W + 0.3, 0.04, 0.03, C.stoneDk, { j: 0 }); m.bx(hw + 0.17, y, 0, 0.03, 0.04, D + 0.3, C.stoneDk, { j: 0 }); m.bx(-hw - 0.17, y, 0, 0.03, 0.04, D + 0.3, C.stoneDk, { j: 0 }); }
  for (const dz of [-1, 1]) for (const x of [-2.4, 0, 2.4]) m.bx(x, 0.9, dz * (hd + 0.2), 0.7, 0.08, 0.1, lit(WARM, 0.9)); // night wash lights
  m.bx(0, 3.4, 0, W + 0.34, 0.14, D + 0.34, C.stoneLt);
  m.bx(0, 3.54, 0, W, 10.06, D, C.cream);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    m.bx(sx * (hw - 0.15), 0.9, sz * (hd - 0.15), 1.3, 12.7, 1.3, C.stone); m.bx(sx * (hw - 0.15), 13.6, sz * (hd - 0.15), 1.5, 0.16, 1.5, C.stoneLt);
    for (let y = 1.4; y < 13.4; y += 0.9) m.bx(sx * (hw - 0.15), y, sz * (hd - 0.15), 1.34, 0.035, 1.34, C.stoneDk, { j: 0 });
  }
  const y0 = 4.1, ph = 9.2;
  for (const dz of [-1, 1]) { // front/back: glazed slot flanked by two jali panels
    const f = dz * hd;
    jali(m, "x", f, dz, -2.65, 1.9, y0, ph, 0.5); jali(m, "x", f, dz, 0.75, 1.9, y0, ph, 0.5);
    m.bx(0, y0, f + dz * 0.04, 1.5, ph, 0.08, C.glassDk, { j: 0.02 });
    for (let k = -2; k <= 2; k++) m.bx(k * 0.375, y0, f + dz * 0.09, 0.05, ph, 0.05, C.navyDk, { j: 0 });
    for (let y = y0 + 1.1; y < y0 + ph; y += 1.1) m.bx(0, y, f + dz * 0.1, 1.5, 0.05, 0.05, C.navyDk, { j: 0 });
    m.bx(-0.84, y0, f + dz * 0.1, 0.09, ph, 0.1, lit(WARM)); m.bx(0.84, y0, f + dz * 0.1, 0.09, ph, 0.1, lit(WARM));
  }
  for (const dx of [-1, 1]) jali(m, "z", dx * hw, dx, -2.45, 4.9, y0, ph, 0.5); // both side faces (lane + outer)
  // belt, cornice, attic, crown
  m.bx(0, 13.76, 0, W + 0.9, 0.55, D + 0.9, C.navy); m.bx(0, 14.31, 0, W + 1.1, 0.14, D + 1.1, C.gold);
  for (let i = -3; i <= 3; i++) { m.bx(i * 1.0, 13.76, hd + 0.55, 0.4, 0.45, 0.08, C.navyDk, { j: 0 }); m.bx(i * 1.0, 13.76, -hd - 0.55, 0.4, 0.45, 0.08, C.navyDk, { j: 0 }); }
  m.bx(0, 14.45, 0, W + 1.5, 0.5, D + 1.5, C.cream);
  m.bx(0, 14.95, 0, W - 0.6, 0.9, D - 0.6, C.terracotta);
  for (const dz of [-1, 1]) for (let i = -2; i <= 2; i++) m.bx(i * 1.15, 15.15, dz * (hd - 0.28), 0.5, 0.5, 0.06, lit(WARM, 0.9));
  for (const dx of [-1, 1]) for (let i = -2; i <= 2; i++) m.bx(dx * (hw - 0.28), 15.15, i * 1.0, 0.06, 0.5, 0.45, lit(WARM, 0.9));
  m.bx(0, 15.85, 0, W + 0.3, 0.3, D + 0.3, C.gold);
  m.bx(0, 16.15, 0, W - 0.2, 0.32, D - 0.2, C.navy); m.bx(0, 16.47, 0, W - 0.1, 0.08, D - 0.1, C.gold); // flat modernist roof, no pitched/pagoda forms
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { m.bx(sx * (hw - 0.55), 16.55, sz * (hd - 0.55), 0.7, 1.5, 0.7, C.cream); m.bx(sx * (hw - 0.55), 18.05, sz * (hd - 0.55), 0.82, 0.12, 0.82, C.gold); }
  m.bx(0, 16.55, 0, 3.4, 0.3, 3.4, C.cream); m.bx(0, 16.85, 0, 2.2, 1.9, 2.2, lit(WARM));       // lit lantern: the tower's night beacon
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.bx(sx * 1.2, 16.85, sz * 1.2, 0.22, 2.0, 0.22, C.navyDk);
  for (let i = -2; i <= 2; i++) for (const dz of [-1, 1]) m.bx(i * 0.45, 16.85, dz * 1.15, 0.1, 1.9, 0.08, C.navyDk, { j: 0 });
  m.bx(0, 18.85, 0, 3.2, 0.28, 3.2, C.navy); m.bx(0, 19.13, 0, 3.3, 0.08, 3.3, C.gold);
  m.cyl(0, 19.2, 0, 0.08, 1.5, 8, C.steelLt); m.cyl(0, 20.7, 0, 0.16, 0.3, 8, C.gold);
  return m;
}

// ---------------------------------------------------------------- SPAN (roof bridge) - 16 m wide, 6.6 deep, beam y 11.2..15.1, crest to ~19.2
function span() {
  const m = new Mesh("gate_span", 21), S = 15.6;
  m.bx(0, 11.2, 0, 16.0, 3.5, 5.6, C.cream);
  for (const dz of [-1, 1]) {
    m.bx(0, 11.5, dz * 2.95, S, 3.0, 0.3, C.navy, { j: 0.02 }); m.bx(0, 11.2, dz * 2.95, S + 0.2, 0.3, 0.36, C.gold); m.bx(0, 14.5, dz * 2.95, S + 0.2, 0.2, 0.36, C.gold);
    for (let i = -7; i <= 7; i++) m.bx(i * 1.05, 11.5, dz * 3.12, 0.07, 3.0, 0.04, C.navyDk, { j: 0 });
  }
  m.bx(0, 14.7, 0, 16.6, 0.4, 6.7, C.cream); m.bx(0, 15.1, 0, 16.7, 0.1, 6.8, C.gold);
  m.bx(0, 15.2, 2.9, 16.0, 0.55, 0.5, C.terrazzo); m.bx(0, 15.2, -2.9, 16.0, 0.55, 0.5, C.terrazzo); m.bx(7.75, 15.2, 0, 0.5, 0.55, 5.3, C.terrazzo); m.bx(-7.75, 15.2, 0, 0.5, 0.55, 5.3, C.terrazzo);
  for (let i = -7; i <= 7; i += 2) for (const dz of [-1, 1]) m.bx(i, 15.75, dz * 2.9, 0.5, 0.25, 0.6, C.gold);
  for (let i = -7; i <= 7; i++) m.bx(i * 0.5 + (i > 0 ? 0 : 0), 10.15, 0, 0.14, 1.05, 5.4, C.timber, { j: 0.08 }); // brise-soleil fins
  for (let i = -15; i <= 15; i++) if (i % 2 === 0 && Math.abs(i * 0.5) <= 7.2) m.bx(i * 0.5 + 0.25, 10.15, 0, 0.14, 1.05, 5.4, C.timberDk, { j: 0.06 });
  for (const dz of [-1, 1]) { m.bx(0, 10.85, dz * 2.55, 15.2, 0.35, 0.34, C.navy); m.bx(0, 10.1, dz * 2.1, 14.6, 0.06, 0.2, lit(WARM)); }
  // crest
  m.bx(0, 15.75, 0, 3.0, 0.7, 1.0, C.stone); m.bx(0, 16.45, 0, 2.2, 0.15, 0.9, C.gold);
  m.cyl(0, 17.9, 0, 1.85, 0.5, 32, C.gold, "z"); m.cyl(0, 17.9, 0, 1.6, 0.58, 32, C.navy, "z"); m.cyl(0, 17.9, 0, 1.28, 0.64, 32, C.gold, "z"); m.cyl(0, 17.9, 0, 1.12, 0.68, 32, C.navyDk, "z");
  for (let k = 0; k < 5; k++) { const a = Math.PI / 2 + (k * 2 * Math.PI) / 5; m.seg(0, 17.9, Math.cos(a) * 0.95, 17.9 + Math.sin(a) * 0.95, 0.28, 0.74, -0.37, lit("#ffd35a")); }
  m.cyl(0, 17.9, 0, 0.3, 0.78, 12, lit("#ffe9a8"), "z");
  m.cyl(0, 17.9, 0, 1.9, 0.12, 32, C.goldDk, "z");
  return m;
}

// ---------------------------------------------------------------- LETTERS "UNITY HEIGHTS" (stroke font, emissive) ~12.4 m wide
const G = {
  U: [[[0, 1], [0, .3], [.08, .12], [.25, .02], [.5, 0], [.75, .02], [.92, .12], [1, .3], [1, 1]]],
  N: [[[0, 0], [0, 1]], [[0, 1], [1, 0]], [[1, 0], [1, 1]]], I: [[[.5, 0], [.5, 1]]], T: [[[0, 1], [1, 1]], [[.5, 1], [.5, 0]]],
  Y: [[[0, 1], [.5, .5]], [[1, 1], [.5, .5]], [[.5, .5], [.5, 0]]], H: [[[0, 0], [0, 1]], [[1, 0], [1, 1]], [[0, .5], [1, .5]]],
  E: [[[1, 1], [0, 1], [0, 0], [1, 0]], [[0, .5], [.8, .5]]],
  G: [[[1, .78], [.9, .9], [.72, .98], [.5, 1], [.28, .98], [.1, .88], [0, .7], [0, .3], [.1, .12], [.28, .02], [.5, 0], [.75, .02], [.92, .12], [1, .3], [1, .48], [.55, .48]]],
  S: [[[1, .85], [.85, .96], [.65, 1], [.4, 1], [.18, .96], [.05, .84], [.05, .65], [.2, .54], [.5, .5], [.8, .46], [.95, .35], [.95, .16], [.82, .04], [.6, 0], [.35, 0], [.15, .04], [0, .15]]],
};
function letters(text = "UNITY HEIGHTS") {
  const m = new Mesh("gate_letters_grand", 31, false), K = 0.9, H = 1.9 * K, th = 0.26 * K, dep = 0.3, W = { I: 0.34 * K, T: 0.8 * K, S: 0.8 * K, E: 0.72 * K, U: 0.82 * K, N: 0.86 * K, Y: 0.86 * K, H: 0.86 * K, G: 0.86 * K }, gap = 0.27, sp = 0.65;
  let x = 0; const items = [];
  for (const ch of text) { if (ch === " ") { x += sp; continue; } const w = W[ch] ?? 0.8 * K; items.push([ch, x, w]); x += w + gap; }
  const total = x - gap, off = -total / 2, col = lit("#fff3d0");
  for (const [ch, x0, w] of items) for (const stroke of G[ch]) for (let i = 0; i + 1 < stroke.length; i++) {
    const [a, b] = [stroke[i], stroke[i + 1]];
    m.seg(off + x0 + a[0] * w, a[1] * H, off + x0 + b[0] * w, b[1] * H, th, dep, 0, col);
  }
  m.bx(0, -0.16, 0.05, total + 0.8, 0.07, 0.1, lit("#ffd35a")); m.bx(0, H + 0.1, 0.05, total + 0.8, 0.07, 0.1, lit("#ffd35a"));
  return m;
}

// ---------------------------------------------------------------- WING wall: runs x 0..17 outward from a tower, stepping down 5.4 -> 2.4 m
function wing() {
  const m = new Mesh("gate_wing", 41), hts = [5.4, 4.6, 3.8, 3.0, 2.4], step = 4.0, xs = hts.map((_, i) => 0.55 + i * step);
  m.bx(8.5, 0, 0, 17.4, 0.25, 1.9, C.stoneDk); m.bx(8.5, 0.25, 0, 17.0, 0.2, 1.6, C.stone);
  hts.forEach((h, i) => {
    const x = xs[i];
    m.bx(x, 0.45, 0, 1.0, h - 0.45, 1.2, C.cream); m.bx(x, h, 0, 1.3, 0.18, 1.5, C.gold); m.bx(x, h + 0.18, 0, 1.1, 0.22, 1.3, C.navy);
    for (let y = 0.9; y < h - 0.3; y += 0.9) m.bx(x, y, 0, 1.04, 0.03, 1.24, C.creamDk, { j: 0 });
    if (i % 2 === 0) m.bx(x, h + 0.4, 0, 0.42, 0.42, 0.42, lit(WARM));
    if (i < hts.length - 1) {
      const nx = xs[i + 1], x0 = x + 0.5, x1 = nx - 0.5, w = x1 - x0, hm = Math.min(h, hts[i + 1]);
      m.bx((x0 + x1) / 2, 0.45, 0, w, 0.65, 1.0, C.stone);
      for (const dz of [-1, 1]) jali(m, "x", dz * 0.45, dz, x0 + 0.1, w - 0.2, 1.15, hm - 1.15 - 0.55, 0.5);
      m.bx((x0 + x1) / 2, hm - 0.55, 0, w, 0.22, 1.1, C.cream); m.bx((x0 + x1) / 2, hm - 0.33, 0, w, 0.08, 1.2, C.gold);
    }
  });
  return m;
}

// ---------------------------------------------------------------- PAVILION (gatehouse / security & welcome desk) 6.8 x 5.6, 3.9 m tall
function pavilion() {
  const m = new Mesh("gate_pavilion", 51);
  m.bx(0, 0, 0, 6.4, 0.25, 5.2, C.stoneDk); m.bx(0, 0.25, 0, 5.8, 0.15, 4.6, C.terrazzo);
  m.bx(0, 0.4, 0, 5.2, 0.8, 4.0, C.cream); m.bx(0, 1.2, 0, 5.3, 0.1, 4.1, C.stoneLt);
  for (const dz of [-1, 1]) { m.bx(0, 1.3, dz * 2.0, 5.0, 1.8, 0.08, dz > 0 ? C.glass : C.cream); }
  m.bx(-2.55, 1.3, 0, 0.08, 1.8, 3.9, C.glass); m.bx(2.55, 1.3, 0, 0.08, 1.8, 3.9, C.glass);
  for (let i = -2; i <= 2; i++) m.bx(i * 1.25, 1.3, 2.05, 0.1, 1.8, 0.1, C.navyDk, { j: 0 });
  for (let i = -1; i <= 1; i++) { m.bx(-2.6, 1.3, i * 1.3, 0.1, 1.8, 0.1, C.navyDk, { j: 0 }); m.bx(2.6, 1.3, i * 1.3, 0.1, 1.8, 0.1, C.navyDk, { j: 0 }); }
  m.bx(0, 1.05, 2.35, 4.6, 0.12, 0.5, C.timber); m.bx(0, 0.4, 2.3, 4.6, 0.65, 0.1, C.timberDk);
  m.bx(0, 0.4, -2.05, 1.1, 2.4, 0.1, C.shadow);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { m.bx(sx * 3.0, 0.4, sz * 2.45, 0.28, 2.9, 0.28, C.steel); }
  m.bx(0, 3.3, 0, 7.0, 0.14, 5.8, C.timber); m.bx(0, 3.44, 0, 7.0, 0.36, 5.8, C.navy); m.bx(0, 3.8, 0, 7.1, 0.07, 5.9, C.gold);
  for (let i = -6; i <= 6; i++) m.bx(i * 0.5, 3.18, 0, 0.1, 0.14, 5.7, C.timberDk, { j: 0.06 });
  m.bx(0, 3.15, 2.75, 6.4, 0.04, 0.14, lit(WARM)); m.bx(0, 3.15, -2.75, 6.4, 0.04, 0.14, lit(WARM));
  m.bx(0, 3.87, 0, 2.2, 0.28, 1.2, C.steelLt); m.bx(0, 3.87, 0, 1.0, 0.18, 0.6, lit("#fff3d0"));
  return m;
}

// ---------------------------------------------------------------- FLAG MAST (15 m) with campus banner; origin = pole base, flag flies toward +x
function mast() {
  const m = new Mesh("gate_mast", 61);
  m.cyl(0, 0, 0, 0.5, 0.5, 14, C.stoneDk); m.cyl(0, 0.5, 0, 0.32, 0.25, 14, C.stone);
  m.cyl(0, 0.75, 0, 0.12, 9, 10, C.steelLt, "y", 0.1); m.cyl(0, 9.75, 0, 0.1, 5.2, 10, C.steelLt, "y", 0.055);
  m.cyl(0, 14.95, 0, 0.17, 0.32, 10, C.gold); m.fr(0, 15.25, 0, 0.3, 0.3, 0.02, 0.02, 0.5, C.gold);
  const cols = [C.navy, C.blue, C.gold], N = 12, fw = 4.6, y0 = 11.6, fh = 2.6;
  for (let i = 0; i < N; i++) { const z = Math.sin(i * 0.65) * 0.22 * (i / N + 0.2); m.bx(0.12 + (i + 0.5) * (fw / N), y0 - Math.sin(i * 0.65) * 0.06, z, fw / N + 0.01, fh, 0.05, cols[Math.floor((i / N) * 3)], { j: 0.03 }); }
  m.bx(0.14, y0 - 0.05, 0, 0.04, fh + 0.1, 0.06, C.steel);
  return m;
}

// ---------------------------------------------------------------- TALL TWIN-ARM LAMP (8.4 m)
function lamp() {
  const m = new Mesh("gate_lamp_tall", 71);
  m.bx(0, 0, 0, 0.7, 0.35, 0.7, C.stoneDk); m.bx(0, 0.35, 0, 0.5, 0.4, 0.5, C.stone); m.cyl(0, 0.75, 0, 0.13, 7.2, 10, C.steel, "y", 0.08);
  m.bx(0, 7.9, 0, 2.7, 0.1, 0.1, C.steel);
  for (const s of [-1, 1]) { m.bx(s * 1.3, 7.55, 0, 0.5, 0.42, 0.5, lit(WARM)); m.fr(s * 1.3, 7.97, 0, 0.62, 0.62, 0.2, 0.2, 0.28, C.navyDk); m.bx(s * 1.3, 7.3, 0, 0.58, 0.07, 0.58, C.navyDk); }
  m.bx(0, 6.3, 0.17, 0.14, 1.4, 0.04, C.navy); m.bx(0, 6.3, 0.2, 0.6, 1.0, 0.03, C.blue);
  return m;
}

// ---------------------------------------------------------------- WAYFINDING KIOSK 2.8 m wide
function kiosk() {
  const m = new Mesh("gate_kiosk", 81);
  m.bx(0, 0, 0, 3.0, 0.2, 1.4, C.stoneDk); m.bx(0, 0.2, 0, 2.6, 2.5, 0.6, C.navy);
  m.bx(0, 0.75, 0.31, 2.2, 1.7, 0.05, C.blue, { j: 0 });
  for (const [x1, y1, x2, y2] of [[-1, 1, 1, 1], [0, 0.85, 0, 2.05], [-0.6, 1.5, 0.9, 1.5], [0.5, 1.0, 0.5, 2.0], [-0.9, 1.9, 0.3, 1.9]]) m.bx((x1 + x2) / 2, Math.min(y1, y2) + 0.0, 0.345, Math.max(0.07, Math.abs(x2 - x1)), Math.max(0.07, Math.abs(y2 - y1)), 0.03, C.white, { j: 0 });
  m.bx(0.5, 1.45, 0.37, 0.2, 0.2, 0.05, lit("#ff7a5a")); m.bx(0, 2.7, 0, 2.8, 0.38, 0.9, C.navyDk); m.bx(0, 2.74, 0.46, 2.4, 0.18, 0.04, lit(WARM));
  m.bx(0, 3.08, 0, 3.2, 0.14, 1.2, C.timber); m.bx(0, 3.22, 0, 3.3, 0.06, 1.3, C.gold);
  return m;
}

// ---------------------------------------------------------------- NAME MONUMENT (stone wall with campus crest, no extra text)
function monument() {
  const m = new Mesh("gate_monument", 91);
  m.bx(0, 0, 0, 7.6, 0.5, 2.0, C.stoneDk); m.bx(0, 0.5, 0, 6.9, 2.2, 1.1, C.travertine);
  for (let y = 0.9; y < 2.6; y += 0.45) { m.bx(0, y, 0.56, 6.9, 0.035, 0.03, C.stoneDk, { j: 0 }); m.bx(0, y, -0.56, 6.9, 0.035, 0.03, C.stoneDk, { j: 0 }); }
  m.bx(0, 2.7, 0, 7.3, 0.2, 1.4, C.navy); m.bx(0, 2.9, 0, 7.4, 0.08, 1.5, C.gold);
  for (const dz of [-1, 1]) { const z = dz * 0.58; m.cyl(0, 1.6, z + dz * 0.0, 1.0, 0.1, 28, C.gold, "z"); m.cyl(0, 1.6, z + dz * 0.04, 0.82, 0.12, 28, C.navy, "z"); m.cyl(0, 1.6, z + dz * 0.07, 0.55, 0.14, 28, C.gold, "z"); for (let k = 0; k < 5; k++) { const a = Math.PI / 2 + (k * 2 * Math.PI) / 5; m.seg(0, 1.6, Math.cos(a) * 0.42, 1.6 + Math.sin(a) * 0.42, 0.14, 0.16, z + (dz > 0 ? 0.05 : -0.21), lit("#ffd35a")); } }
  for (const s of [-1, 1]) { m.bx(s * 2.7, 0.5, 0, 0.5, 2.2, 1.3, C.stone); m.bx(s * 2.7, 2.7, 0, 0.7, 0.1, 1.5, C.gold); }
  return m;
}

// ---------------------------------------------------------------- GARDEN BED 8 x 3 (kerb, mulch, shrubs, flowers, grass clumps)
function garden() {
  const m = new Mesh("gate_garden_bed", 101), Wd = 8, Dp = 3;
  m.bx(0, 0, -Dp / 2 + 0.15, Wd, 0.4, 0.3, C.stoneLt); m.bx(0, 0, Dp / 2 - 0.15, Wd, 0.4, 0.3, C.stoneLt); m.bx(-Wd / 2 + 0.15, 0, 0, 0.3, 0.4, Dp - 0.6, C.stoneLt); m.bx(Wd / 2 - 0.15, 0, 0, 0.3, 0.4, Dp - 0.6, C.stoneLt);
  m.bx(0, 0.02, 0, Wd - 0.6, 0.3, Dp - 0.6, C.soil);
  for (let i = 0; i < 16; i++) {
    const x = (m.r() - 0.5) * (Wd - 1.8), z = (m.r() - 0.5) * (Dp - 1.2), w = 0.9 + m.r() * 0.9, h = 0.6 + m.r() * 0.9, c = [C.leaf, C.leafDk, C.leafLt][i % 3];
    m.fr(x, 0.3, z, w, w, w * 0.55, w * 0.55, h, c); m.fr(x, 0.3 + h * 0.7, z, w * 0.7, w * 0.7, w * 0.3, w * 0.3, h * 0.45, [C.leafLt, C.leaf][i % 2]);
    if (i % 2 === 0) for (let k = 0; k < 4; k++) m.bx(x + (m.r() - 0.5) * w * 0.5, 0.3 + h * 1.02, z + (m.r() - 0.5) * w * 0.5, 0.2, 0.14, 0.2, [C.red, C.pink, C.yellow, C.orange][(i + k) % 4], { j: 0 });
  }
  for (let c = 0; c < 4; c++) { const cx = (c - 1.5) * 1.8, cz = (c % 2 ? 0.7 : -0.7); for (let b = 0; b < 6; b++) m.bx(cx + (m.r() - 0.5) * 0.4, 0.3, cz + (m.r() - 0.5) * 0.4, 0.05, 0.9 + m.r() * 0.5, 0.05, C.grass, { j: 0.1 }); }
  m.fr(-2.9, 0.3, 0.2, 0.9, 0.7, 0.6, 0.5, 0.55, C.rock); m.fr(3.0, 0.3, -0.3, 0.8, 0.7, 0.5, 0.45, 0.45, C.rock);
  return m;
}

// ---------------------------------------------------------------- REFLECTING POOL with fountain jets, 9 x 8
function pool() {
  const m = new Mesh("gate_pool", 121), W = 9, D = 8, water = [0.24, 0.62, 0.72];
  m.bx(0, 0, -D / 2 + 0.35, W, 0.55, 0.7, C.stoneLt); m.bx(0, 0, D / 2 - 0.35, W, 0.55, 0.7, C.stoneLt); m.bx(-W / 2 + 0.35, 0, 0, 0.7, 0.55, D - 1.4, C.stoneLt); m.bx(W / 2 - 0.35, 0, 0, 0.7, 0.55, D - 1.4, C.stoneLt);
  m.bx(0, 0.55, 0, W + 0.1, 0.05, D + 0.1, C.gold); m.bx(0, 0, 0, W - 1.4, 0.2, D - 1.4, C.navy); m.bx(0, 0.2, 0, W - 1.4, 0.26, D - 1.4, water, { j: 0.02 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.bx(sx * 2.6, 0.46, sz * 2.2, 0.35, 0.03, 0.35, lit("#7fe8ff", 0.9));
  m.cyl(0, 0.46, 0, 0.55, 0.4, 14, C.stoneLt); m.fr(0, 0.86, 0, 0.3, 0.3, 0.1, 0.1, 3.6, [0.92, 0.97, 1]); m.cyl(0, 2.4, 0, 0.95, 0.06, 18, [0.85, 0.95, 1]); m.cyl(0, 3.3, 0, 0.55, 0.05, 14, [0.9, 0.97, 1]);
  for (const [x, z] of [[-2, -1.6], [2, -1.6], [-2, 1.6], [2, 1.6]]) { m.fr(x, 0.46, z, 0.22, 0.22, 0.07, 0.07, 2.0, [0.92, 0.97, 1]); m.cyl(x, 1.9, z, 0.4, 0.05, 12, [0.88, 0.96, 1]); }
  return m;
}

// ---------------------------------------------------------------- PLAZA (arrival court) 56 x 24, centre at (0,0); gate passage is z < +3.7
function plaza() {
  const m = new Mesh("gate_plaza", 111, false), W = 80, D = 24, z0 = -D / 2, y = 0.07;
  m.bx(0, 0, 0, W, y, D, C.terrazzo, { j: 0 });
  for (let i = 0; i < 9; i++) m.bx(0, y, z0 + 1.2 + i * 2.9, W - 1.2, 0.012, 1.45, C.terrazzoDk, { j: 0 }); // paving bands
  for (let i = 0; i < 190; i++) m.bx((m.r() - 0.5) * (W - 1), y + 0.012, (m.r() - 0.5) * (D - 1), 0.18 + m.r() * 0.16, 0.012, 0.16 + m.r() * 0.14, [C.stoneDk, C.terracotta, C.glassDk, C.terrazzoDk][i % 4], { j: 0 });
  m.bx(0, y, z0 + 0.3, W - 0.6, 0.03, 0.6, C.navy, { j: 0 }); m.bx(0, y, D / 2 - 0.3, W - 0.6, 0.03, 0.6, C.navy, { j: 0 });
  m.bx(-W / 2 + 0.3, y, 0, 0.6, 0.03, D - 1.2, C.navy, { j: 0 }); m.bx(W / 2 - 0.3, y, 0, 0.6, 0.03, D - 1.2, C.navy, { j: 0 });
  for (const s of [-1, 1]) { m.bx(s * 10.4, y, 0, 0.36, 0.03, D - 1.2, C.gold, { j: 0 }); m.bx(s * 10.95, y, 0, 0.55, 0.03, D - 1.2, C.navy, { j: 0 }); }
  const cz = 9; // medallion on the arrival side
  m.cyl(0, y, cz, 7.0, 0.03, 40, C.navy); m.cyl(0, y + 0.03, cz, 6.4, 0.012, 40, C.gold); m.cyl(0, y + 0.04, cz, 6.0, 0.012, 40, C.terrazzo); m.cyl(0, y + 0.05, cz, 4.4, 0.012, 40, C.navy); m.cyl(0, y + 0.06, cz, 3.9, 0.012, 40, C.gold); m.cyl(0, y + 0.07, cz, 3.5, 0.012, 40, C.terrazzo);
  for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4; m.bx(Math.cos(a) * 1.9, y + 0.075, cz + Math.sin(a) * 1.9, 3.2, 0.012, 0.22, k % 2 ? C.navy : C.gold, { rz: 0, j: 0 }); }
  m.cyl(0, y + 0.075, cz, 0.7, 0.02, 20, C.navy); m.cyl(0, y + 0.095, cz, 0.45, 0.012, 20, C.gold);
  for (const s of [-1, 1]) for (let i = 0; i < 6; i++) { const z = z0 + 3 + i * 3.4; m.bx(s * 12.6, 0, z, 0.22, 0.45, 0.22, C.steel); } // bollards flank the lane
  m.bx(-W / 2 + 0.2, 0, 0, 0.4, 0.2, D, C.stoneDk, { j: 0 }); m.bx(W / 2 - 0.2, 0, 0, 0.4, 0.2, D, C.stoneDk, { j: 0 }); m.bx(0, 0, D / 2 - 0.2, W, 0.2, 0.4, C.stoneDk, { j: 0 });
  return m;
}

const kit = [tower(), span(), letters(), wing(), pavilion(), mast(), lamp(), kiosk(), monument(), garden(), pool(), plaza()];
const LIFT = new Set(["gate_span", "gate_letters_grand"]);
const SCALE = { gate_tower: 1.35, gate_span: 1.35, gate_letters_grand: 1.35, gate_mast: 1.3, gate_pavilion: 1.15, gate_lamp_tall: 1.15 }; // v2.1: grander
const report = kit.map((m) => glb(m, path.join(OUT, m.name + ".glb"), LIFT.has(m.name), SCALE[m.name] ?? 1));
const tot = report.reduce((a, r) => ({ bytes: a.bytes + r.bytes, tris: a.tris + r.tris }), { bytes: 0, tris: 0 });
fs.writeFileSync(path.join(OUT, "..", "..", "..", "..", "..", "docs", "evidence", "grand-gate-kit.json"), JSON.stringify({ report, total: tot }, null, 1) + "\n", { flag: "w" });
for (const r of report) console.log(r.name.padEnd(22), String(r.tris).padStart(6), "tris", String(Math.round(r.bytes / 1024)).padStart(5), "KB", JSON.stringify(r.size));
console.log("TOTAL", tot.tris, "tris", Math.round(tot.bytes / 1024), "KB");
