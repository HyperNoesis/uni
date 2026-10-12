// Tests for apps/web/lib/{glb,asset-loader}.ts. They live here because the web app has no unit-test runner
// and adding one would change the lockfile; both modules are pure (no DOM/WebGL).
import { describe, expect, it } from "vitest";
import { parseGlb, GlbError } from "../../../apps/web/lib/glb";
import { createAssetStreamer } from "../../../apps/web/lib/asset-loader";
import { parseAssetManifest } from "./assets";

/** Builds a GLB: one cube (12 tris, u16 indices), optional node rotation/scale and baseColor. */
function cubeGlb(opts: { node?: any; color?: number[]; mode?: number } = {}): ArrayBuffer {
  const v = [-1, -1, -1, 1, -1, -1, 1, 1, -1, -1, 1, -1, -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1];
  const idx = [0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 3, 2, 6, 3, 6, 7, 0, 3, 7, 0, 7, 4, 1, 5, 6, 1, 6, 2];
  const posBytes = new Float32Array(v).buffer, idxBytes = new Uint16Array(idx).buffer;
  const bin = new Uint8Array(posBytes.byteLength + idxBytes.byteLength); bin.set(new Uint8Array(posBytes), 0); bin.set(new Uint8Array(idxBytes), posBytes.byteLength);
  const json = {
    asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, ...(opts.node ?? {}) }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0, mode: opts.mode }] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: opts.color ?? [1, 0, 0, 1] } }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 8, type: "VEC3" }, { bufferView: 1, componentType: 5123, count: 36, type: "SCALAR" }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: posBytes.byteLength }, { buffer: 0, byteOffset: posBytes.byteLength, byteLength: idxBytes.byteLength }],
    buffers: [{ byteLength: bin.length }],
  };
  const pad = (b: Uint8Array, fill: number) => { const n = (4 - (b.length % 4)) % 4; const o = new Uint8Array(b.length + n).fill(fill); o.set(b); return o; };
  const j = pad(new TextEncoder().encode(JSON.stringify(json)), 0x20), b = pad(bin, 0);
  const out = new ArrayBuffer(12 + 8 + j.length + 8 + b.length), dv = new DataView(out), u8 = new Uint8Array(out);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, out.byteLength, true);
  dv.setUint32(12, j.length, true); dv.setUint32(16, 0x4e4f534a, true); u8.set(j, 20);
  const o2 = 20 + j.length; dv.setUint32(o2, b.length, true); dv.setUint32(o2 + 4, 0x004e4942, true); u8.set(b, o2 + 8);
  return out;
}

describe("glb parser", () => {
  it("parses a cube, normalises to a unit box with base at y=-.5 and bakes the material colour", () => {
    const m = parseGlb(cubeGlb(), { maxTriangles: 100 });
    expect(m.triangles).toBe(12);
    let lo = [9, 9, 9], hi = [-9, -9, -9];
    for (let i = 0; i < m.positions.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k]!, m.positions[i + k]!); hi[k] = Math.max(hi[k]!, m.positions[i + k]!); }
    expect(lo.map((n) => +n.toFixed(3))).toEqual([-0.5, -0.5, -0.5]);
    expect(hi.map((n) => +n.toFixed(3))).toEqual([0.5, 0.5, 0.5]);
    expect([m.colors[0], m.colors[1], m.colors[2]]).toEqual([1, 0, 0]);
    expect(m.normals).toHaveLength(m.positions.length);
    for (let i = 0; i < m.normals.length; i += 3) expect(Math.abs(Math.hypot(m.normals[i]!, m.normals[i + 1]!, m.normals[i + 2]!) - 1) < 1e-4).toBe(true);
  });
  it("applies node scale before normalising (tall thin model stays a unit box)", () => {
    const m = parseGlb(cubeGlb({ node: { scale: [1, 4, 1] } }), { maxTriangles: 100 });
    let max = 0; for (let i = 0; i < m.positions.length; i++) max = Math.max(max, Math.abs(m.positions[i]!));
    expect(+max.toFixed(3)).toBe(0.5);
  });
  it("enforces the triangle budget and rejects unsupported content", () => {
    expect(() => parseGlb(cubeGlb(), { maxTriangles: 11 })).toThrow(/budget/);
    expect(() => parseGlb(cubeGlb({ mode: 1 }), { maxTriangles: 100 })).toThrow(/triangle primitives/);
    expect(() => parseGlb(new ArrayBuffer(64), { maxTriangles: 100 })).toThrow(GlbError);
    const g = cubeGlb(); new DataView(g).setUint32(8, g.byteLength + 4, true);
    expect(() => parseGlb(g, { maxTriangles: 100 })).toThrow(/length/);
  });
  it("never reads outside the buffer", () => {
    const g = cubeGlb(); const cut = g.slice(0, g.byteLength - 40); new DataView(cut).setUint32(8, cut.byteLength, true);
    expect(() => parseGlb(cut, { maxTriangles: 100 })).toThrow();
  });
});

const manifest = (assets: any[], resident = { maxBytes: 100000, maxTriangles: 1000 }) =>
  parseAssetManifest({ schemaVersion: 1, defaults: { maxBytes: 50000, maxTriangles: 100 }, residentBudget: resident, assets }, ["library", "food_court", "main_gate"]);
const entry = (id: string, slot: string, zones: any, extra: any = {}) => ({ id, slot, zones, url: `/assets/${id}.glb`, ...extra });
const mkFetch = (files: Record<string, ArrayBuffer | number>, calls: string[] = []) => (async (url: string) => {
  calls.push(url); const f = files[url];
  if (f === undefined || typeof f === "number") return { ok: false, status: typeof f === "number" ? f : 404, headers: new Headers(), arrayBuffer: async () => new ArrayBuffer(0) } as any;
  return { ok: true, status: 200, headers: new Headers(), arrayBuffer: async () => f } as any;
}) as any;

describe("asset streamer", () => {
  it("loads per zone, evicts zones the player left, and keeps one previous zone", async () => {
    const added: string[] = [], removed: string[] = [], calls: string[] = [];
    const m = manifest([entry("lib", "prop:shelf", ["library"]), entry("food", "prop:counter", ["food_court"]), entry("gate", "prop:pillar", ["main_gate"]), entry("all", "prop:bench", "all")]);
    const g = cubeGlb();
    const s = createAssetStreamer({ manifest: m, sink: { add: (e) => added.push(e.id), remove: (id) => removed.push(id) }, fetchFn: mkFetch({ "/assets/lib.glb": g, "/assets/food.glb": g, "/assets/gate.glb": g, "/assets/all.glb": g }, calls) });
    s.setZone("library"); await s.settled();
    expect(added.sort()).toEqual(["all", "lib"]);
    s.setZone("food_court"); await s.settled();
    expect(removed).toEqual([]); // library kept as the previous zone
    s.setZone("main_gate"); await s.settled();
    expect(removed.sort()).toEqual(["lib"].sort()); // two zones back is evicted; "food" kept as previous
    expect(s.stats().loaded.sort()).toEqual(["all", "food", "gate"]);
    s.setZone("main_gate"); await s.settled();
    expect(calls.filter((c) => c === "/assets/all.glb")).toHaveLength(1); // cached, not refetched
  });
  it("also streams nearby zones so neighbours are ready before arrival, and evicts them when out of range", async () => {
    const added: string[] = [], removed: string[] = [];
    const m = manifest([entry("lib", "prop:shelf", ["library"]), entry("food", "prop:counter", ["food_court"]), entry("gate", "prop:pillar", ["main_gate"])]);
    const g = cubeGlb();
    const s = createAssetStreamer({ manifest: m, keepPrevious: 0, sink: { add: (e) => added.push(e.id), remove: (id) => removed.push(id) }, fetchFn: mkFetch({ "/assets/lib.glb": g, "/assets/food.glb": g, "/assets/gate.glb": g }) });
    s.setZone("library", ["food_court"]); await s.settled();
    expect(added.sort()).toEqual(["food", "lib"]);
    s.setZone("library", ["food_court"]); await s.settled(); // unchanged: no refetch
    expect(added).toHaveLength(2);
    s.setZone("main_gate", []); await s.settled();
    expect(removed.sort()).toEqual(["food", "lib"]);
    expect(s.stats().loaded).toEqual(["gate"]);
  });
  it("falls back silently on 404, oversize, bad GLB and triangle overrun; other assets still load", async () => {
    const m = manifest([entry("a", "prop:tree", "all"), entry("b", "prop:bench", "all"), entry("c", "prop:shelf", "all"), entry("d", "prop:stage", "all", { maxTriangles: 5 }), entry("ok", "prop:pillar", "all")]);
    const g = cubeGlb(); const added: string[] = [], statuses: string[] = [];
    const s = createAssetStreamer({ manifest: m, sink: { add: (e) => added.push(e.id), remove: () => {} }, onStatus: (x) => statuses.push(`${x.id}:${x.state}`), fetchFn: mkFetch({ "/assets/b.glb": new ArrayBuffer(10), "/assets/c.glb": new ArrayBuffer(60000), "/assets/d.glb": g, "/assets/ok.glb": g }) });
    s.setZone("library"); await s.settled();
    expect(added).toEqual(["ok"]);
    expect(Object.keys(s.stats().failed).sort()).toEqual(["a", "b", "c", "d"]);
    expect(statuses).toContain("a:failed");
  });
  it("enforces the resident budget by evicting old zones, and fails when nothing can be evicted", async () => {
    const g = cubeGlb(); const size = g.byteLength;
    const m = manifest([entry("lib", "prop:shelf", ["library"]), entry("food", "prop:counter", ["food_court"])], { maxBytes: size + 10, maxTriangles: 1000 });
    const removed: string[] = [];
    const s = createAssetStreamer({ manifest: m, keepPrevious: 1, sink: { add: () => {}, remove: (id) => removed.push(id) }, fetchFn: mkFetch({ "/assets/lib.glb": g, "/assets/food.glb": g }) });
    s.setZone("library"); await s.settled(); s.setZone("food_court"); await s.settled();
    expect(removed).toEqual(["lib"]);
    expect(s.stats().loaded).toEqual(["food"]);
  });
  it("destroy removes everything and stops loading", async () => {
    const removed: string[] = []; const g = cubeGlb();
    const s = createAssetStreamer({ manifest: manifest([entry("a", "prop:tree", "all")]), sink: { add: () => {}, remove: (id) => removed.push(id) }, fetchFn: mkFetch({ "/assets/a.glb": g }) });
    s.setZone("library"); await s.settled(); s.destroy(); s.setZone("food_court");
    expect(removed).toEqual(["a"]);
  });
});
