// Minimal, dependency-free GLB (glTF 2.0 binary) reader for the raw-WebGL renderer.
// Merges every mesh primitive in the default scene into one triangle soup, applies node transforms,
// bakes material baseColorFactor / COLOR_0 into per-vertex colours, and normalises the result into a
// unit box centred on X/Z with its base at y=0 (so callers scale it like the built-in box mesh).
// Unsupported (rejected, never silently misrendered): non-triangle modes, sparse accessors, Draco/meshopt,
// external buffers. Textures are ignored in this version (flat/vertex colour only).

export interface GlbMesh { positions: Float32Array; normals: Float32Array; colors: Float32Array; triangles: number }
export class GlbError extends Error {}

const MAGIC = 0x46546c67, JSON_CHUNK = 0x4e4f534a, BIN_CHUNK = 0x004e4942;
const COMP: Record<number, { size: number; get: (v: DataView, o: number) => number }> = {
  5120: { size: 1, get: (v, o) => v.getInt8(o) }, 5121: { size: 1, get: (v, o) => v.getUint8(o) },
  5122: { size: 2, get: (v, o) => v.getInt16(o, true) }, 5123: { size: 2, get: (v, o) => v.getUint16(o, true) },
  5125: { size: 4, get: (v, o) => v.getUint32(o, true) }, 5126: { size: 4, get: (v, o) => v.getFloat32(o, true) },
};
const NCOMP: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
type Mat = number[];
const I: Mat = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const mul = (a: Mat, b: Mat): Mat => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r]! += a[k * 4 + r]! * b[c * 4 + k]!; return o; };
function trs(t: number[] = [0, 0, 0], q: number[] = [0, 0, 0, 1], s: number[] = [1, 1, 1]): Mat {
  const [x, y, z, w] = q as [number, number, number, number];
  const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
  return [(1 - 2 * (yy + zz)) * s[0]!, 2 * (xy + wz) * s[0]!, 2 * (xz - wy) * s[0]!, 0,
    2 * (xy - wz) * s[1]!, (1 - 2 * (xx + zz)) * s[1]!, 2 * (yz + wx) * s[1]!, 0,
    2 * (xz + wy) * s[2]!, 2 * (yz - wx) * s[2]!, (1 - 2 * (xx + yy)) * s[2]!, 0, t[0]!, t[1]!, t[2]!, 1];
}

export function parseGlb(buf: ArrayBuffer, limits: { maxTriangles: number }): GlbMesh {
  if (buf.byteLength < 20) throw new GlbError("file too small");
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== MAGIC) throw new GlbError("not a GLB file");
  if (dv.getUint32(4, true) !== 2) throw new GlbError("only glTF 2.0 is supported");
  if (dv.getUint32(8, true) !== buf.byteLength) throw new GlbError("GLB length mismatch");
  let json: any, bin: DataView | undefined;
  for (let o = 12; o + 8 <= buf.byteLength;) {
    const len = dv.getUint32(o, true), type = dv.getUint32(o + 4, true), start = o + 8;
    if (start + len > buf.byteLength) throw new GlbError("chunk overruns file");
    if (type === JSON_CHUNK && !json) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, start, len)));
    else if (type === BIN_CHUNK && !bin) bin = new DataView(buf, start, len);
    o = start + ((len + 3) & ~3);
  }
  if (!json) throw new GlbError("missing JSON chunk");
  if (json.extensionsRequired?.length) throw new GlbError(`unsupported extensions: ${json.extensionsRequired.join(",")}`);
  if (json.buffers?.some((b: any) => b.uri)) throw new GlbError("external buffers are not allowed");
  if (!bin) throw new GlbError("missing BIN chunk");

  const read = (idx: number, wantType: string): { data: number[]; n: number; normalized: boolean; comp: number } => {
    const a = json.accessors?.[idx]; if (!a) throw new GlbError("bad accessor");
    if (a.sparse) throw new GlbError("sparse accessors unsupported");
    const c = COMP[a.componentType], nc = NCOMP[a.type];
    if (!c || !nc || (wantType && a.type !== wantType)) throw new GlbError("unsupported accessor layout");
    const bv = json.bufferViews?.[a.bufferView]; if (!bv) throw new GlbError("accessor without bufferView");
    const stride = bv.byteStride || c.size * nc, base = (bv.byteOffset || 0) + (a.byteOffset || 0);
    if (a.count > limits.maxTriangles * 3 + 3) throw new GlbError("accessor exceeds triangle budget");
    if (base + (a.count - 1) * stride + c.size * nc > bin!.byteLength) throw new GlbError("accessor overruns buffer");
    const data: number[] = [];
    for (let i = 0; i < a.count; i++) for (let k = 0; k < nc; k++) data.push(c.get(bin!, base + i * stride + k * c.size));
    return { data, n: nc, normalized: !!a.normalized, comp: a.componentType };
  };
  const norm = (v: number, comp: number) => comp === 5121 ? v / 255 : comp === 5123 ? v / 65535 : v;

  const P: number[] = [], N: number[] = [], C: number[] = [];
  const visit = (ni: number, parent: Mat, depth: number) => {
    if (depth > 32) throw new GlbError("node tree too deep");
    const node = json.nodes?.[ni]; if (!node) throw new GlbError("bad node");
    const m = mul(parent, node.matrix ?? trs(node.translation, node.rotation, node.scale));
    if (node.mesh !== undefined) for (const prim of json.meshes[node.mesh].primitives) {
      if ((prim.mode ?? 4) !== 4) throw new GlbError("only triangle primitives supported");
      if (prim.extensions) throw new GlbError("primitive extensions unsupported");
      const pos = read(prim.attributes.POSITION, "VEC3").data;
      const nrm = prim.attributes.NORMAL !== undefined ? read(prim.attributes.NORMAL, "VEC3").data : null;
      const col = prim.attributes.COLOR_0 !== undefined ? read(prim.attributes.COLOR_0, "") : null;
      const bc: number[] = json.materials?.[prim.material]?.pbrMetallicRoughness?.baseColorFactor ?? [1, 1, 1, 1];
      const idx = prim.indices !== undefined ? read(prim.indices, "SCALAR").data : Array.from({ length: pos.length / 3 }, (_, i) => i);
      if (idx.length % 3) throw new GlbError("index count not a multiple of 3");
      if (P.length / 9 + idx.length / 3 > limits.maxTriangles) throw new GlbError("exceeds triangle budget");
      const tp = (i: number) => { const x = pos[i * 3]!, y = pos[i * 3 + 1]!, z = pos[i * 3 + 2]!; return [m[0]! * x + m[4]! * y + m[8]! * z + m[12]!, m[1]! * x + m[5]! * y + m[9]! * z + m[13]!, m[2]! * x + m[6]! * y + m[10]! * z + m[14]!]; };
      const tn = (i: number) => { const x = nrm![i * 3]!, y = nrm![i * 3 + 1]!, z = nrm![i * 3 + 2]!; const v = [m[0]! * x + m[4]! * y + m[8]! * z, m[1]! * x + m[5]! * y + m[9]! * z, m[2]! * x + m[6]! * y + m[10]! * z]; const l = Math.hypot(v[0]!, v[1]!, v[2]!) || 1; return [v[0]! / l, v[1]! / l, v[2]! / l]; };
      for (let t = 0; t < idx.length; t += 3) {
        const ids = [idx[t]!, idx[t + 1]!, idx[t + 2]!];
        if (ids.some((i) => i * 3 + 2 >= pos.length)) throw new GlbError("index out of range");
        const v = ids.map(tp);
        let fn = [0, 1, 0];
        if (!nrm) { const a = v[0]!, b = v[1]!, c = v[2]!; const u = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!], w = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!]; const n = [u[1]! * w[2]! - u[2]! * w[1]!, u[2]! * w[0]! - u[0]! * w[2]!, u[0]! * w[1]! - u[1]! * w[0]!]; const l = Math.hypot(n[0]!, n[1]!, n[2]!) || 1; fn = [n[0]! / l, n[1]! / l, n[2]! / l]; }
        for (let k = 0; k < 3; k++) {
          P.push(...v[k]!); N.push(...(nrm ? tn(ids[k]!) : fn));
          if (col) C.push(norm(col.data[ids[k]! * col.n]!, col.comp) * bc[0]!, norm(col.data[ids[k]! * col.n + 1]!, col.comp) * bc[1]!, norm(col.data[ids[k]! * col.n + 2]!, col.comp) * bc[2]!);
          else C.push(bc[0]!, bc[1]!, bc[2]!);
        }
      }
    }
    for (const c of node.children ?? []) visit(c, m, depth + 1);
  };
  const scene = json.scenes?.[json.scene ?? 0];
  for (const r of scene?.nodes ?? []) visit(r, I, 0);
  if (!P.length) throw new GlbError("no triangles found");

  // Normalise: centre X/Z, base at y=0, scale so the largest extent is 1 per axis independently (unit box).
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k]!, P[i + k]!); hi[k] = Math.max(hi[k]!, P[i + k]!); }
  const ext = [0, 1, 2].map((k) => Math.max(hi[k]! - lo[k]!, 1e-6));
  const positions = new Float32Array(P.length);
  for (let i = 0; i < P.length; i += 3) {
    positions[i] = (P[i]! - (lo[0]! + hi[0]!) / 2) / ext[0]!;
    positions[i + 1] = (P[i + 1]! - lo[1]!) / ext[1]! - 0.5; // y in [-.5,.5] like the box mesh; draw() lifts by h/2
    positions[i + 2] = (P[i + 2]! - (lo[2]! + hi[2]!) / 2) / ext[2]!;
  }
  // Non-uniform scaling: normals transform by the inverse scale.
  const normals = new Float32Array(N.length);
  for (let i = 0; i < N.length; i += 3) { const x = N[i]! / ext[0]!, y = N[i + 1]! / ext[1]!, z = N[i + 2]! / ext[2]!; const l = Math.hypot(x, y, z) || 1; normals[i] = x / l; normals[i + 1] = y / l; normals[i + 2] = z / l; }
  return { positions, normals, colors: new Float32Array(C), triangles: P.length / 9 };
}
