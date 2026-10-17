// Skinned character support for the raw-WebGL renderer: parse a skinned GLB (see scripts/models/build-character.py),
// sample/blend animation clips and skin on the CPU into the renderer's per-frame dynamic batch.
// CPU skinning is deliberate: the renderer has no skinning shader, and a ~2.4k-triangle body x a handful of
// nearby avatars is cheap. Everything here is dependency-free, never throws into the render loop (callers catch
// SkinnedGlbError at load time and keep the code-drawn box avatar), and is covered by tests/visual/skinned-glb.mjs.

export class SkinnedGlbError extends Error {}

export interface Track { joint: number; path: "translation" | "rotation" | "scale"; times: Float32Array; values: Float32Array; step: boolean }
export interface Clip { name: string; duration: number; tracks: Track[] }
export interface SkinnedModel {
  vertexCount: number; triangles: number; jointCount: number;
  positions: Float32Array; normals: Float32Array; joints: Uint8Array; weights: Float32Array; indices: Uint16Array;
  parents: Int16Array; restT: Float32Array; restR: Float32Array; restS: Float32Array; ibm: Float32Array;
  jointNames: string[]; clips: Record<string, Clip>; forward: [number, number, number]; jointRegion: number[]; height: number;
  /** Optional `_PAINT` attribute (4 bytes per vertex: material id, baked AO, 0, 0). Present on the painted character; absent on plain bodies. */
  paint: Uint8Array | null;
  /** Optional geometry groups (hood, skirt, backpack...) stored after the always-on base range; only skinned/drawn when asked for. */
  baseVertices: number; baseIndices: number; groups: Record<string, Group>;
  /** Planted-foot ground speed (m/s) of each locomotion clip as authored; used to match playback rate to real speed. */
  clipSpeed: Record<string, number>;
  /** Textured realistic characters: TEXCOORD_0 into one atlas (+ tint mask), see scripts/models/build-realistic.py. Null on painted/plain bodies. */
  uvs: Float32Array | null; atlas: AtlasInfo | null; baseUrl: string;
  /** Rendered height in metres requested by the asset (extras.campus.bodyHeight); 0 = use the game default. */
  bodyHeight: number;
}
export interface AtlasInfo { albedo: string; mask: string; skinRef: [number, number, number]; hairLuma: number; topLuma: number; topRect: number[]; botRect: number[]; shoeRect: number[]; botCut: number }
export interface Group { name: string; v0: number; vN: number; i0: number; iN: number }
export type Pose = { t: Float32Array; r: Float32Array; s: Float32Array };

const MAGIC = 0x46546c67, JSON_CHUNK = 0x4e4f534a, BIN_CHUNK = 0x004e4942;
const CT: Record<number, { size: number; ctor: any; get: (v: DataView, o: number) => number }> = {
  5121: { size: 1, ctor: Uint8Array, get: (v, o) => v.getUint8(o) }, 5123: { size: 2, ctor: Uint16Array, get: (v, o) => v.getUint16(o, true) },
  5126: { size: 4, ctor: Float32Array, get: (v, o) => v.getFloat32(o, true) },
};
const NC: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

export function parseSkinnedGlb(buf: ArrayBuffer, limits: { maxTriangles: number; maxJoints: number }): SkinnedModel {
  if (buf.byteLength < 28) throw new SkinnedGlbError("file too small");
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== MAGIC) throw new SkinnedGlbError("not a GLB file");
  if (dv.getUint32(4, true) !== 2) throw new SkinnedGlbError("only glTF 2.0 is supported");
  if (dv.getUint32(8, true) !== buf.byteLength) throw new SkinnedGlbError("GLB length mismatch");
  let json: any, bin: DataView | undefined;
  for (let o = 12; o + 8 <= buf.byteLength;) {
    const len = dv.getUint32(o, true), type = dv.getUint32(o + 4, true), start = o + 8;
    if (start + len > buf.byteLength) throw new SkinnedGlbError("chunk overruns file");
    if (type === JSON_CHUNK && !json) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, start, len)));
    else if (type === BIN_CHUNK && !bin) bin = new DataView(buf, start, len);
    o = start + ((len + 3) & ~3);
  }
  if (!json || !bin) throw new SkinnedGlbError("missing JSON or BIN chunk");
  if (json.extensionsRequired?.length) throw new SkinnedGlbError(`unsupported extensions: ${json.extensionsRequired.join(",")}`);
  if (json.buffers?.some((b: any) => b.uri)) throw new SkinnedGlbError("external buffers are not allowed");
  const B = bin;
  const read = (idx: number, want?: string): { data: any; n: number; count: number } => {
    const a = json.accessors?.[idx]; if (!a) throw new SkinnedGlbError("bad accessor");
    const c = CT[a.componentType], nc = NC[a.type];
    if (a.sparse || !c || !nc || (want && a.type !== want)) throw new SkinnedGlbError("unsupported accessor layout");
    const bv = json.bufferViews?.[a.bufferView]; if (!bv) throw new SkinnedGlbError("accessor without bufferView");
    const stride = bv.byteStride || c.size * nc, base = (bv.byteOffset || 0) + (a.byteOffset || 0);
    if (a.count > limits.maxTriangles * 3 + 64) throw new SkinnedGlbError("accessor exceeds budget");
    if (a.count > 0 && base + (a.count - 1) * stride + c.size * nc > B.byteLength) throw new SkinnedGlbError("accessor overruns buffer");
    const out = new c.ctor(a.count * nc);
    for (let i = 0; i < a.count; i++) for (let k = 0; k < nc; k++) out[i * nc + k] = c.get(B, base + i * stride + k * c.size);
    return { data: out, n: nc, count: a.count };
  };

  const skin = json.skins?.[0], mesh = json.meshes?.[0]?.primitives?.[0];
  if (!skin || !mesh) throw new SkinnedGlbError("no skin or mesh");
  if (json.meshes[0].primitives.length !== 1) throw new SkinnedGlbError("expected exactly one primitive");
  const K = skin.joints.length;
  if (K < 1 || K > limits.maxJoints) throw new SkinnedGlbError(`joint count ${K} out of range`);
  const at = mesh.attributes ?? {};
  for (const k of ["POSITION", "NORMAL", "JOINTS_0", "WEIGHTS_0"]) if (at[k] === undefined) throw new SkinnedGlbError(`missing ${k}`);
  const pos = read(at.POSITION, "VEC3"), nrm = read(at.NORMAL, "VEC3"), jnt = read(at.JOINTS_0, "VEC4"), wgt = read(at.WEIGHTS_0, "VEC4");
  const idx = read(mesh.indices, "SCALAR");
  const V = pos.count;
  if (nrm.count !== V || jnt.count !== V || wgt.count !== V) throw new SkinnedGlbError("attribute counts differ");
  if (idx.count % 3) throw new SkinnedGlbError("index count not a multiple of 3");
  if (idx.count / 3 > limits.maxTriangles) throw new SkinnedGlbError("exceeds triangle budget");
  for (let i = 0; i < idx.count; i++) if (idx.data[i] >= V) throw new SkinnedGlbError("index out of range");
  for (let i = 0; i < jnt.data.length; i++) if (jnt.data[i] >= K) throw new SkinnedGlbError("joint index out of range");

  // joints: node index -> slot; parents (parent slot must precede child so FK runs in one pass)
  const slot = new Map<number, number>(); skin.joints.forEach((nj: number, i: number) => slot.set(nj, i));
  const parents = new Int16Array(K).fill(-1);
  const restT = new Float32Array(K * 3), restR = new Float32Array(K * 4), restS = new Float32Array(K * 3);
  skin.joints.forEach((nj: number, i: number) => {
    const n = json.nodes[nj]; if (!n) throw new SkinnedGlbError("bad joint node");
    if (n.matrix) throw new SkinnedGlbError("joint matrices unsupported (use TRS)");
    restT.set(n.translation ?? [0, 0, 0], i * 3); restR.set(n.rotation ?? [0, 0, 0, 1], i * 4); restS.set(n.scale ?? [1, 1, 1], i * 3);
    for (const c of n.children ?? []) { const cs = slot.get(c); if (cs !== undefined) { if (cs <= i) throw new SkinnedGlbError("joints must be ordered parent-before-child"); parents[cs] = i; } }
  });
  const ibm = read(skin.inverseBindMatrices, "MAT4"); if (ibm.count !== K) throw new SkinnedGlbError("inverse bind matrix count mismatch");

  const clips: Record<string, Clip> = {};
  for (const an of json.animations ?? []) {
    const tracks: Track[] = []; let duration = 0;
    for (const ch of an.channels ?? []) {
      const js = slot.get(ch.target?.node); const path = ch.target?.path; if (js === undefined || !["translation", "rotation", "scale"].includes(path)) continue;
      const s = an.samplers[ch.sampler]; if (s.interpolation === "CUBICSPLINE") throw new SkinnedGlbError("cubic spline animation unsupported");
      const t = read(s.input, "SCALAR"), v = read(s.output, path === "rotation" ? "VEC4" : "VEC3");
      if (t.count !== v.count || t.count < 1) throw new SkinnedGlbError("sampler size mismatch");
      tracks.push({ joint: js, path, times: t.data, values: v.data, step: s.interpolation === "STEP" });
      duration = Math.max(duration, t.data[t.count - 1]);
    }
    clips[an.name] = { name: an.name, duration, tracks };
  }
  const meta = json.extras?.campus ?? {};
  let paint: Uint8Array | null = null;
  if (at._PAINT !== undefined) { const pa = read(at._PAINT, "VEC4"); if (pa.count !== V) throw new SkinnedGlbError("paint count differs"); paint = Uint8Array.from(pa.data as ArrayLike<number>); }
  const groups: Record<string, Group> = {};
  for (const g of Array.isArray(meta.groups) ? meta.groups : []) {
    const ok = [g?.v0, g?.vN, g?.i0, g?.iN].every((n: unknown) => Number.isInteger(n) && (n as number) >= 0);
    if (!ok || typeof g.name !== "string" || g.v0 + g.vN > V || g.i0 + g.iN > idx.count || g.iN % 3) throw new SkinnedGlbError("bad geometry group");
    for (let i = g.i0; i < g.i0 + g.iN; i++) if (idx.data[i] < g.v0 || idx.data[i] >= g.v0 + g.vN) throw new SkinnedGlbError("group index outside its vertex range");
    groups[g.name] = { name: g.name, v0: g.v0, vN: g.vN, i0: g.i0, iN: g.iN };
  }
  const firstGroup = Object.values(groups).sort((a, b) => a.v0 - b.v0)[0];
  const baseVertices = firstGroup ? firstGroup.v0 : V, baseIndices = firstGroup ? firstGroup.i0 : idx.count;
  const rect = (r: unknown): number[] => (Array.isArray(r) && r.length === 4 && r.every((v) => Number.isFinite(v)) ? r.map(Number) : [2, 2, 3, 3]); // [2,2,3,3] = matches nothing
  let uvs: Float32Array | null = null, atlas: AtlasInfo | null = null;
  if (at.TEXCOORD_0 !== undefined) {
    const uv = read(at.TEXCOORD_0, "VEC2"); if (uv.count !== V) throw new SkinnedGlbError("uv count differs");
    for (let i = 0; i < uv.data.length; i++) if (!Number.isFinite(uv.data[i])) throw new SkinnedGlbError("bad uv");
    const a = meta.atlas;
    if (a && typeof a.albedo === "string" && typeof a.mask === "string" && /^[\w.-]+$/.test(a.albedo) && /^[\w.-]+$/.test(a.mask) && Array.isArray(a.skinRef) && a.skinRef.length === 3) {
      uvs = Float32Array.from(uv.data as ArrayLike<number>);
      atlas = { albedo: a.albedo, mask: a.mask, skinRef: [Number(a.skinRef[0]), Number(a.skinRef[1]), Number(a.skinRef[2])], hairLuma: Number(a.hairLuma) || .3, topLuma: Number(a.topLuma) || .4,
        topRect: rect(a.topRect), botRect: rect(a.botRect), shoeRect: rect(a.shoeRect), botCut: Number.isFinite(a.botCut) ? a.botCut : .5 };
    }
  }
  const fwd: [number, number, number] = Array.isArray(meta.forward) && meta.forward.length === 3 ? meta.forward : [0, 0, 1];
  let lo = Infinity, hi = -Infinity; for (let i = 1; i < pos.data.length; i += 3) { lo = Math.min(lo, pos.data[i]); hi = Math.max(hi, pos.data[i]); }
  const model: SkinnedModel = {
    vertexCount: V, triangles: idx.count / 3, jointCount: K, positions: pos.data, normals: nrm.data, joints: jnt.data, weights: wgt.data, indices: idx.data,
    parents, restT, restR, restS, ibm: ibm.data, jointNames: skin.joints.map((nj: number) => String(json.nodes[nj].name ?? nj)), clips, forward: fwd, jointRegion: Array.isArray(meta.jointRegion) ? meta.jointRegion : new Array(K).fill(0), height: hi - lo, clipSpeed: {},
    paint, baseVertices, baseIndices, groups, uvs, atlas, baseUrl: "", bodyHeight: Number.isFinite(meta.bodyHeight) && meta.bodyHeight > 1.2 && meta.bodyHeight < 2.2 ? meta.bodyHeight : 0,
  };
  for (const n of ["Walk_Loop", "Jog_Fwd_Loop", "Sprint_Loop"]) if (clips[n]) model.clipSpeed[n] = estimateLocomotionSpeed(model, clips[n]);
  return model;
}

// ---------- pose sampling & blending ----------
export const newPose = (m: SkinnedModel): Pose => ({ t: new Float32Array(m.restT), r: new Float32Array(m.restR), s: new Float32Array(m.restS) });
export const resetPose = (m: SkinnedModel, p: Pose) => { p.t.set(m.restT); p.r.set(m.restR); p.s.set(m.restS); };

function slerpInto(out: Float32Array, o: number, a: Float32Array, ao: number, b: Float32Array, bo: number, k: number) {
  let bx = b[bo], by = b[bo + 1], bz = b[bo + 2], bw = b[bo + 3];
  let d = a[ao] * bx + a[ao + 1] * by + a[ao + 2] * bz + a[ao + 3] * bw;
  if (d < 0) { d = -d; bx = -bx; by = -by; bz = -bz; bw = -bw; }
  let ka: number, kb: number;
  if (d > 0.9995) { ka = 1 - k; kb = k; } else { const th = Math.acos(d), s = Math.sin(th); ka = Math.sin((1 - k) * th) / s; kb = Math.sin(k * th) / s; }
  const x = a[ao] * ka + bx * kb, y = a[ao + 1] * ka + by * kb, z = a[ao + 2] * ka + bz * kb, w = a[ao + 3] * ka + bw * kb;
  const l = Math.hypot(x, y, z, w) || 1; out[o] = x / l; out[o + 1] = y / l; out[o + 2] = z / l; out[o + 3] = w / l;
}

/** Writes the clip's pose at `time` into `pose` (joints the clip never animates keep their rest value). */
export function sampleClip(m: SkinnedModel, clip: Clip, time: number, loop: boolean, pose: Pose): void {
  resetPose(m, pose);
  const d = clip.duration, t = d <= 0 ? 0 : loop ? ((time % d) + d) % d : Math.min(Math.max(time, 0), d);
  for (const tr of clip.tracks) {
    const ts = tr.times, n = ts.length, nc = tr.path === "rotation" ? 4 : 3;
    let i = 0; if (n > 1) { let lo = 0, hi = n - 1; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (ts[mid] <= t) lo = mid; else hi = mid; } i = lo; }
    const j = Math.min(i + 1, n - 1), span = ts[j] - ts[i], k = tr.step || span <= 1e-9 ? 0 : Math.min(Math.max((t - ts[i]) / span, 0), 1);
    const dst = tr.path === "rotation" ? pose.r : tr.path === "translation" ? pose.t : pose.s, o = tr.joint * nc, a = i * nc, b = j * nc;
    if (tr.path === "rotation") { if (k === 0) { for (let c = 0; c < 4; c++) dst[o + c] = tr.values[a + c]; } else slerpInto(dst, o, tr.values, a, tr.values, b, k); }
    else for (let c = 0; c < 3; c++) dst[o + c] = tr.values[a + c] + (tr.values[b + c] - tr.values[a + c]) * k;
  }
}

/** dst = lerp(a, b, k) (slerp for rotations). dst may alias a. */
export function blendPose(m: SkinnedModel, dst: Pose, a: Pose, b: Pose, k: number): void {
  for (let i = 0; i < m.jointCount * 3; i++) { dst.t[i] = a.t[i] + (b.t[i] - a.t[i]) * k; dst.s[i] = a.s[i] + (b.s[i] - a.s[i]) * k; }
  for (let i = 0; i < m.jointCount; i++) slerpInto(dst.r, i * 4, a.r, i * 4, b.r, i * 4, k);
}

/** Forward kinematics: world joint matrices (column-major, 16 floats per joint). */
export function worldMatrices(m: SkinnedModel, pose: Pose, out: Float32Array): void {
  for (let i = 0; i < m.jointCount; i++) {
    const x = pose.r[i * 4], y = pose.r[i * 4 + 1], z = pose.r[i * 4 + 2], w = pose.r[i * 4 + 3];
    const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
    const sx = pose.s[i * 3], sy = pose.s[i * 3 + 1], sz = pose.s[i * 3 + 2], o = i * 16, p = m.parents[i];
    const l = [(1 - 2 * (yy + zz)) * sx, 2 * (xy + wz) * sx, 2 * (xz - wy) * sx, 0, 2 * (xy - wz) * sy, (1 - 2 * (xx + zz)) * sy, 2 * (yz + wx) * sy, 0, 2 * (xz + wy) * sz, 2 * (yz - wx) * sz, (1 - 2 * (xx + yy)) * sz, 0, pose.t[i * 3], pose.t[i * 3 + 1], pose.t[i * 3 + 2], 1];
    if (p < 0) { for (let c = 0; c < 16; c++) out[o + c] = l[c]; continue; }
    const po = p * 16;
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) out[o + c * 4 + r] = out[po + r] * l[c * 4] + out[po + 4 + r] * l[c * 4 + 1] + out[po + 8 + r] * l[c * 4 + 2] + out[po + 12 + r] * l[c * 4 + 3];
  }
}

/** Skin matrices = world * inverseBind, written into `skinOut` (jointCount*16). `world` is scratch of the same size. */
export function skinMatrices(m: SkinnedModel, pose: Pose, world: Float32Array, skinOut: Float32Array): void {
  worldMatrices(m, pose, world);
  for (let i = 0; i < m.jointCount; i++) {
    const o = i * 16;
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) skinOut[o + c * 4 + r] = world[o + r] * m.ibm[o + c * 4] + world[o + 4 + r] * m.ibm[o + c * 4 + 1] + world[o + 8 + r] * m.ibm[o + c * 4 + 2] + world[o + 12 + r] * m.ibm[o + c * 4 + 3];
  }
}

/**
 * Linear-blend skin all vertices, then place the body in the world: rotate about Y by `yaw` (so model-forward points along the
 * entity heading), scale uniformly, translate. Outputs unindexed triangle soup into dstP/dstN (3 floats per vertex).
 * Returns the number of vertices written (triangles*3).
 */
export function skinToSoup(m: SkinnedModel, skin: Float32Array, place: { x: number; y: number; z: number; yaw: number; scale: number }, scratchP: Float32Array, scratchN: Float32Array, dstP: number[], dstN: number[], groups?: readonly string[], dstUv?: number[]): number {
  const cy = Math.cos(place.yaw), sy = Math.sin(place.yaw), sc = place.scale;
  const skinRange = (v0: number, v1: number) => {
    for (let v = v0; v < v1; v++) {
      let px = 0, py = 0, pz = 0, nx = 0, ny = 0, nz = 0;
      const ox = m.positions[v * 3], oy = m.positions[v * 3 + 1], oz = m.positions[v * 3 + 2], onx = m.normals[v * 3], ony = m.normals[v * 3 + 1], onz = m.normals[v * 3 + 2];
      for (let k = 0; k < 4; k++) {
        const w = m.weights[v * 4 + k]; if (w <= 0) continue; const o = m.joints[v * 4 + k] * 16;
        px += w * (skin[o] * ox + skin[o + 4] * oy + skin[o + 8] * oz + skin[o + 12]);
        py += w * (skin[o + 1] * ox + skin[o + 5] * oy + skin[o + 9] * oz + skin[o + 13]);
        pz += w * (skin[o + 2] * ox + skin[o + 6] * oy + skin[o + 10] * oz + skin[o + 14]);
        nx += w * (skin[o] * onx + skin[o + 4] * ony + skin[o + 8] * onz);
        ny += w * (skin[o + 1] * onx + skin[o + 5] * ony + skin[o + 9] * onz);
        nz += w * (skin[o + 2] * onx + skin[o + 6] * ony + skin[o + 10] * onz);
      }
      const nl = Math.hypot(nx, ny, nz) || 1;
      scratchP[v * 3] = place.x + (px * cy + pz * sy) * sc; scratchP[v * 3 + 1] = place.y + py * sc; scratchP[v * 3 + 2] = place.z + (-px * sy + pz * cy) * sc;
      scratchN[v * 3] = (nx * cy + nz * sy) / nl; scratchN[v * 3 + 1] = ny / nl; scratchN[v * 3 + 2] = (-nx * sy + nz * cy) / nl;
    }
  };
  const I = m.indices; let written = 0;
  const emit = (i0: number, i1: number) => {
    for (let i = i0; i < i1; i++) { const v = I[i]!; dstP.push(scratchP[v * 3]!, scratchP[v * 3 + 1]!, scratchP[v * 3 + 2]!); dstN.push(scratchN[v * 3]!, scratchN[v * 3 + 1]!, scratchN[v * 3 + 2]!); if (dstUv && m.uvs) dstUv.push(m.uvs[v * 2]!, m.uvs[v * 2 + 1]!); }
    written += i1 - i0;
  };
  skinRange(0, m.baseVertices); emit(0, m.baseIndices);
  for (const name of groups ?? []) { const g = m.groups[name]; if (!g) continue; skinRange(g.v0, g.v0 + g.vN); emit(g.i0, g.i0 + g.iN); }
  return written;
}

/** Per-vertex colours from the player's customisation: blends region colours by skin weight (smooth transitions at seams). */
export function regionVertexColors(m: SkinnedModel, palette: [number, number, number][]): Float32Array {
  const out = new Float32Array(m.vertexCount * 3);
  for (let v = 0; v < m.vertexCount; v++) {
    let r = 0, g = 0, b = 0, ws = 0;
    for (let k = 0; k < 4; k++) { const w = m.weights[v * 4 + k]; if (w <= 0) continue; const c = palette[m.jointRegion[m.joints[v * 4 + k]] ?? 0] ?? palette[0]; r += c[0] * w; g += c[1] * w; b += c[2] * w; ws += w; }
    ws = ws || 1; out[v * 3] = r / ws; out[v * 3 + 1] = g / ws; out[v * 3 + 2] = b / ws;
  }
  return out;
}

/** Ground speed (m/s) a locomotion clip was authored for: mean horizontal speed of the planted (lower) foot relative to the hips. */
export function estimateLocomotionSpeed(m: SkinnedModel, clip: Clip): number {
  const names = m.jointNames, fl = names.indexOf("foot.L"), fr = names.indexOf("foot.R"), hp = names.indexOf("hips");
  if (fl < 0 || fr < 0 || hp < 0 || clip.duration <= 0) return 0;
  const pose = newPose(m), world = new Float32Array(m.jointCount * 16), N = 48, dt = clip.duration / N;
  const f = m.forward; let prev: { l: number; r: number; ly: number; ry: number } | null = null, sum = 0, cnt = 0;
  for (let s = 0; s <= N; s++) {
    sampleClip(m, clip, s * dt, true, pose); worldMatrices(m, pose, world);
    const rel = (j: number) => { const o = j * 16, h = hp * 16; return (world[o + 12] - world[h + 12]) * f[0] + (world[o + 14] - world[h + 14]) * f[2]; };
    const cur = { l: rel(fl), r: rel(fr), ly: world[fl * 16 + 13], ry: world[fr * 16 + 13] };
    if (prev) { const planted = prev.ly < prev.ry ? Math.abs(cur.l - prev.l) : Math.abs(cur.r - prev.r); sum += planted / dt; cnt++; }
    prev = cur;
  }
  return cnt ? sum / cnt : 0;
}
