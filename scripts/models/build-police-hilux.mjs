#!/usr/bin/env node
/* CAMPUS Nigeria Police Force patrol pickup: Toyota Hilux double cab, original procedural GLB (no third-party assets).
 * Run: node scripts/models/build-police-hilux.mjs   -> apps/web/public/assets/gate/gate_police_hilux.glb + registers it in assets.json
 * Frame: x = right, y = up, z = forward (front bumper at +z). Origin = footprint centre at ground. Vertex colours only (same format as the gate kit).
 * Livery: police blue body, white roof and belt stripe, white "POLICE" on both doors and the tailgate, gold force crest, black bull bar,
 * caged load bed, roof light-bar housing (the flashing lenses are drawn live by the renderer so they can blink).
 */
import fs from "node:fs";

const hex = (h) => { const n = parseInt(h.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
const lit = (h) => hex(h).map((v) => Math.min(1, v) + 2);
const C = { blue: hex("#1d3f91"), blueDk: hex("#142c68"), white: hex("#eef1f6"), black: hex("#15171c"), steel: hex("#8d96a6"), steelDk: hex("#3d424d"), glass: hex("#1c2733"), tyre: hex("#101216"), hub: hex("#b9c0cc"), red: hex("#c9262e"), amber: hex("#ff9d2e"), gold: hex("#d9a93c"), plate: hex("#f4f1e4"), seat: hex("#2a2d36") };

class Mesh {
  constructor() { this.P = []; this.N = []; this.Cc = []; this.I = []; }
  quad(a, b, c, d, n, col) {
    const cr = [(b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])];
    if (cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] < 0) [b, d] = [d, b];
    const base = this.P.length / 3;
    for (const p of [a, b, c, d]) { this.P.push(...p); this.N.push(...n); this.Cc.push(...col); }
    this.I.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  box(cx, cy, cz, w, h, d, col) {
    const x = w / 2, y = h / 2, z = d / 2, P = (a, b, c) => [cx + a, cy + b, cz + c];
    this.quad(P(x, -y, -z), P(x, y, -z), P(x, y, z), P(x, -y, z), [1, 0, 0], col); this.quad(P(-x, -y, -z), P(-x, y, -z), P(-x, y, z), P(-x, -y, z), [-1, 0, 0], col);
    this.quad(P(-x, y, -z), P(x, y, -z), P(x, y, z), P(-x, y, z), [0, 1, 0], col); this.quad(P(-x, -y, -z), P(x, -y, -z), P(x, -y, z), P(-x, -y, z), [0, -1, 0], col);
    this.quad(P(-x, -y, z), P(x, -y, z), P(x, y, z), P(-x, y, z), [0, 0, 1], col); this.quad(P(-x, -y, -z), P(x, -y, -z), P(x, y, -z), P(-x, y, -z), [0, 0, -1], col);
  }
  /** Convex side profile [(z,y)...] extruded across x in [xa, xb]. */
  extrude(profile, xa, xb, col) {
    const n = profile.length, tri = (x, flip, nx) => { const base = this.P.length / 3; for (const [z, y] of profile) { this.P.push(x, y, z); this.N.push(nx, 0, 0); this.Cc.push(...col); } for (let i = 1; i < n - 1; i++) this.I.push(...(flip ? [base, base + i + 1, base + i] : [base, base + i, base + i + 1])); };
    let area = 0; for (let i = 0; i < n; i++) { const [z1, y1] = profile[i], [z2, y2] = profile[(i + 1) % n]; area += z1 * y2 - z2 * y1; }
    const f = area < 0; tri(xb, f, 1); tri(xa, !f, -1);
    for (let i = 0; i < n; i++) {
      const [z1, y1] = profile[i], [z2, y2] = profile[(i + 1) % n], dz = z2 - z1, dy = y2 - y1, l = Math.hypot(dz, dy) || 1, nn = [0, dz / l * (f ? 1 : -1) * -1, dy / l * (f ? 1 : -1)];
      // outward normal of the edge in the z-y plane
      const o = f ? [0, -dz / l * -1 * 0, 0] : [0, 0, 0]; void o;
      const ny = f ? -dz / l : dz / l, nz = f ? dy / l : -dy / l; void nn;
      this.quad([xa, y1, z1], [xb, y1, z1], [xb, y2, z2], [xa, y2, z2], [0, ny, nz], col);
    }
  }
  /** Cylinder about the x axis (wheels). */
  cylX(cx, cy, cz, r, w, n, col) {
    const base = this.P.length / 3;
    for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a); for (const t of [-0.5, 0.5]) { this.P.push(cx + t * w, cy + s * r, cz + c * r); this.N.push(0, s, c); this.Cc.push(...col); } }
    for (let i = 0; i < n; i++) { const a = base + i * 2; this.I.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    for (const t of [-0.5, 0.5]) {
      const c0 = this.P.length / 3; this.P.push(cx + t * w, cy, cz); this.N.push(t * 2, 0, 0); this.Cc.push(...col);
      for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2; this.P.push(cx + t * w, cy + Math.sin(a) * r, cz + Math.cos(a) * r); this.N.push(t * 2, 0, 0); this.Cc.push(...col); }
      for (let i = 0; i < n; i++) { if (t > 0) this.I.push(c0, c0 + 1 + i, c0 + 2 + i); else this.I.push(c0, c0 + 2 + i, c0 + 1 + i); }
    }
  }
}

const m = new Mesh(), HW = 0.92;
const both = (f) => { f(1); f(-1); };
// ---- body ----
m.box(0, 0.5, 0, 1.78, 0.2, 5.2, C.black);                                             // chassis / sill
m.extrude([[1.25, 0.46], [2.5, 0.46], [2.6, 0.62], [2.6, 0.97], [2.32, 1.06], [1.3, 1.1], [1.25, 1.1]], -HW, HW, C.blue); // bonnet + front wings
m.extrude([[1.25, 0.46], [1.25, 1.12], [0.82, 1.72], [-0.3, 1.78], [-0.58, 1.66], [-0.6, 0.46]], -0.9, 0.9, C.blue);     // double cab
m.extrude([[0.78, 1.7], [-0.28, 1.76], [-0.5, 1.68], [-0.5, 1.72], [-0.28, 1.82], [0.8, 1.76]], -0.86, 0.86, C.white);    // white roof skin
m.extrude([[-0.6, 0.46], [-2.62, 0.46], [-2.62, 0.96], [-0.6, 0.96]], -HW, HW, C.blue);                                  // load bed shell
m.box(0, 0.72, -1.62, 1.66, 0.04, 2.0, C.steelDk);                                                                      // bed floor
both((s) => { m.box(s * (HW - 0.03), 1.0, -1.62, 0.06, 0.1, 2.04, C.white); });                                         // white belt stripe on the bed rails
// belt stripe on the cab/bonnet sides
both((s) => { m.box(s * (HW + 0.005), 0.98, 1.0, 0.02, 0.07, 3.1, C.white); m.box(s * (0.9 + 0.005), 1.1, 0.35, 0.02, 0.05, 1.8, C.white); });
// ---- glass ----
both((s) => {
  m.extrude([[1.1, 1.14], [0.5, 1.14], [0.5, 1.62], [0.84, 1.66]], s > 0 ? 0.895 : -0.915, s > 0 ? 0.915 : -0.895, C.glass);   // front door window
  m.extrude([[0.4, 1.14], [-0.46, 1.14], [-0.46, 1.58], [0.4, 1.64]], s > 0 ? 0.895 : -0.915, s > 0 ? 0.915 : -0.895, C.glass); // rear door window
});
m.quad([-0.8, 1.13, 1.23], [0.8, 1.13, 1.23], [0.8, 1.7, 0.83], [-0.8, 1.7, 0.83], [0, 0.55, 0.83], C.glass);               // windscreen
m.quad([-0.78, 1.16, -0.605], [0.78, 1.16, -0.605], [0.78, 1.62, -0.58], [-0.78, 1.62, -0.58], [0, 0, -1], C.glass);          // rear window
// ---- nose ----
m.box(0, 0.45, 2.64, 1.9, 0.2, 0.16, C.steelDk);                                                                           // front bumper
m.box(0, 0.62, 2.62, 1.2, 0.08, 0.04, C.steel);
m.box(0, 0.8, 2.615, 0.62, 0.2, 0.05, C.black); for (let i = -2; i <= 2; i++) m.box(i * 0.11, 0.8, 2.64, 0.05, 0.16, 0.02, C.steel); // grille
both((s) => { m.box(s * 0.66, 0.85, 2.6, 0.38, 0.15, 0.07, lit("#fff6d8")); m.box(s * 0.62, 0.64, 2.64, 0.12, 0.08, 0.04, lit("#ffd27a")); m.box(s * 0.84, 0.86, 2.6, 0.08, 0.12, 0.06, C.amber); });
// bull bar (black tube frame)
both((s) => { m.box(s * 0.58, 0.82, 2.76, 0.05, 0.62, 0.05, C.black); m.box(s * 0.58, 0.55, 2.7, 0.05, 0.05, 0.14, C.black); });
m.box(0, 1.14, 2.76, 1.21, 0.05, 0.05, C.black); m.box(0, 0.86, 2.76, 1.21, 0.05, 0.05, C.black); m.box(0, 0.98, 2.76, 0.05, 0.32, 0.05, C.black);
m.box(0, 0.5, 2.71, 0.34, 0.1, 0.02, C.plate); for (let i = -2; i <= 2; i++) m.box(i * 0.055, 0.5, 2.725, 0.03, 0.06, 0.01, C.black); // front plate
// ---- cab details ----
both((s) => {
  m.box(s * 1.01, 1.34, 0.98, 0.1, 0.14, 0.2, C.black); m.box(s * 0.95, 1.3, 1.0, 0.1, 0.04, 0.04, C.black);              // mirrors
  m.box(s * 0.925, 1.02, 0.45, 0.02, 0.03, 0.14, C.steel); m.box(s * 0.925, 1.02, -0.3, 0.02, 0.03, 0.14, C.steel);        // door handles
  m.box(s * 0.99, 0.5, 0.35, 0.12, 0.05, 1.6, C.steelDk);                                                                  // side steps
});
// ---- roof light bar housing (lenses blink live in the renderer) ----
m.box(0, 1.86, 0.28, 1.22, 0.06, 0.3, C.black); m.box(0, 1.9, 0.28, 1.14, 0.02, 0.26, C.steelDk);
m.box(0.55, 1.88, -0.15, 0.04, 0.2, 0.04, C.black); m.box(0.02, 2.0, -0.18, 0.02, 0.36, 0.02, C.black);                    // antenna
// ---- load bed cage ----
const cageTop = 1.78;
both((s) => { for (const z of [-0.62, -1.2, -1.8, -2.58]) m.box(s * (HW - 0.04), (0.96 + cageTop) / 2, z, 0.04, cageTop - 0.96, 0.04, C.black); });
for (const z of [-0.62, -1.2, -1.8, -2.58]) m.box(0, cageTop, z, 1.8, 0.04, 0.04, C.black);
both((s) => m.box(s * (HW - 0.04), cageTop, -1.6, 0.04, 0.04, 2.0, C.black));
for (let z = -0.8; z > -2.5; z -= 0.28) m.box(0, cageTop, z, 1.8, 0.02, 0.02, C.black);                                  // roof mesh bars
both((s) => { for (let z = -0.8; z > -2.5; z -= 0.3) m.box(s * (HW - 0.04), 1.37, z, 0.02, 0.8, 0.02, C.black); m.box(s * (HW - 0.04), 1.37, -1.6, 0.02, 0.03, 2.0, C.black); }); // side mesh
m.box(0, 0.92, -1.6, 1.3, 0.08, 0.5, C.seat);                                                                               // bench
// tailgate + rear
m.box(0, 0.45, -2.68, 1.9, 0.2, 0.14, C.steelDk);
both((s) => m.box(s * 0.8, 0.84, -2.66, 0.2, 0.16, 0.05, C.red));
m.box(0, 0.52, -2.77, 0.34, 0.1, 0.02, C.plate);
// ---- wheels ----
for (const sx of [1, -1]) for (const z of [1.55, -1.55]) {
  m.cylX(sx * (HW + 0.0), 0.38, z, 0.47, 0.012, 24, C.black);                                                              // dark arch
  m.cylX(sx * 0.8, 0.38, z, 0.38, 0.27, 24, C.tyre); m.cylX(sx * (0.8 + 0.1), 0.38, z, 0.22, 0.2, 16, C.hub); m.cylX(sx * 0.94, 0.38, z, 0.07, 0.03, 10, C.steelDk);
}
// ---- livery: POLICE lettering + crest ----
const G = { P: ["111", "101", "111", "100", "100"], O: ["111", "101", "101", "101", "111"], L: ["100", "100", "100", "100", "111"], I: ["111", "010", "010", "010", "111"], C: ["111", "100", "100", "100", "111"], E: ["111", "100", "111", "100", "111"] };
const px = 0.05;
function word(text, x, y, z0, dirZ) { // lettering on a side (x fixed), reading front-to-back as seen from outside
  let z = z0;
  for (const ch of text) { const g = G[ch]; for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if (g[r][c] === "1") m.box(x, y - r * px, z - dirZ * c * px, 0.014, px, px, C.white); z -= dirZ * 4 * px; }
}
word("POLICE", HW + 0.012, 0.8, 0.62, 1);    // right door reads toward the rear
word("POLICE", -HW - 0.012, 0.8, -0.62 - 0.0, -1); // left side mirrored so it reads correctly from outside
both((s) => { m.cylX(s * (0.9 + 0.01), 0.96, 0.95, 0.09, 0.014, 18, C.gold); m.cylX(s * (0.9 + 0.017), 0.96, 0.95, 0.055, 0.012, 14, C.blueDk); });
// tailgate lettering faces -z
{ let x = 0.55; for (const ch of "POLICE") { const g = G[ch]; for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if (g[r][c] === "1") m.box(x - c * px, 0.86 - r * px, -2.762, px, px, 0.012, C.white); x -= 4 * px; } }
m.box(0, 0.5, 0, 0.01, 0.01, 0.01, C.black);

// ---- write GLB ----
const OUT = "apps/web/public/assets/gate/gate_police_hilux.glb";
const n = m.P.length / 3; if (n > 65535) throw new Error("too many verts");
let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
for (let i = 0; i < n; i++) for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], m.P[i * 3 + a]); mx[a] = Math.max(mx[a], m.P[i * 3 + a]); }
const size = { w: +(mx[0] - mn[0]).toFixed(3), h: +(mx[1] - mn[1]).toFixed(3), d: +(mx[2] - mn[2]).toFixed(3) };
// normalise to a unit box centred at the origin on x/z with the wheels on y=-h/2.. the renderer scales by `size` (same convention as the gate kit): keep authored metres, shift to centre
const cx = (mx[0] + mn[0]) / 2, cz = (mx[2] + mn[2]) / 2, cy = (mx[1] + mn[1]) / 2;
for (let i = 0; i < n; i++) { m.P[i * 3] = (m.P[i * 3] - cx) / size.w; m.P[i * 3 + 1] = (m.P[i * 3 + 1] - cy) / size.h; m.P[i * 3 + 2] = (m.P[i * 3 + 2] - cz) / size.d; }
// normals under non-uniform scale: the renderer applies the same scale, so authored normals stay valid for a unit-box mesh
const pos = Buffer.from(new Float32Array(m.P).buffer), nor = Buffer.from(new Float32Array(m.N).buffer), col = Buffer.from(new Float32Array(m.Cc).buffer);
let idx = Buffer.from(new Uint16Array(m.I).buffer); const pad = (4 - (idx.length % 4)) % 4; if (pad) idx = Buffer.concat([idx, Buffer.alloc(pad)]);
const bin = Buffer.concat([pos, nor, col, idx]);
const json = {
  asset: { version: "2.0", generator: "campus police hilux (scripts/models/build-police-hilux.mjs)" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: "gate_police_hilux" }],
  meshes: [{ name: "gate_police_hilux", primitives: [{ attributes: { POSITION: 0, NORMAL: 1, COLOR_0: 2 }, indices: 3, mode: 4 }] }],
  accessors: [{ bufferView: 0, componentType: 5126, count: n, type: "VEC3", min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] }, { bufferView: 1, componentType: 5126, count: n, type: "VEC3" }, { bufferView: 2, componentType: 5126, count: n, type: "VEC3" }, { bufferView: 3, componentType: 5123, count: m.I.length, type: "SCALAR" }],
  bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: pos.length, target: 34962 }, { buffer: 0, byteOffset: pos.length, byteLength: nor.length, target: 34962 }, { buffer: 0, byteOffset: pos.length + nor.length, byteLength: col.length, target: 34962 }, { buffer: 0, byteOffset: pos.length + nor.length + col.length, byteLength: m.I.length * 2, target: 34963 }],
  buffers: [{ byteLength: bin.length }],
};
let js = Buffer.from(JSON.stringify(json)); js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
const total = 12 + 8 + js.length + 8 + bin.length, h = Buffer.alloc(12); h.write("glTF", 0); h.writeUInt32LE(2, 4); h.writeUInt32LE(total, 8);
const jh = Buffer.alloc(8); jh.writeUInt32LE(js.length, 0); jh.write("JSON", 4); const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.write("BIN\0", 4);
fs.writeFileSync(OUT, Buffer.concat([h, jh, js, bh, bin]));
const AP = "packages/domain/src/world-data/assets.json", A = JSON.parse(fs.readFileSync(AP, "utf8"));
const entry = { id: "gate_police_hilux", url: "/assets/gate/gate_police_hilux.glb", slot: "decor:gate_police_hilux", zones: ["main_gate", "gate_road"], maxBytes: Math.ceil((total * 1.15) / 1000) * 1000, maxTriangles: Math.ceil((m.I.length / 3) * 1.1 / 100) * 100, size, yOffset: 0 };
const i = A.assets.findIndex((e) => e.id === entry.id); if (i >= 0) A.assets[i] = entry; else A.assets.push(entry);
fs.writeFileSync(AP, JSON.stringify(A, null, 2) + "\n");
console.log(`gate_police_hilux: ${m.I.length / 3} tris, ${total} bytes, size ${JSON.stringify(size)}`);
