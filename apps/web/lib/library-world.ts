// Enterable 3D library: plaza -> grand stairs -> doors the avatar opens -> hall, gallery and basement archive.
// Self-contained Three.js scene (no dependency on the campus renderer). Walk, climb, pick books, sit and read.
import * as THREE from "three";
import type { Avatar } from "@campus/domain";
import { loadSkinnedCharacter, createCharacterAnimator, stepAnimation, CHARACTER_SETS, bodyKind, type CharacterAnimator, type AnimState } from "./skinned-character";
import { styleFor } from "./avatar-wardrobe";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { FIELDS, makeBook, type BookData } from "./library-content";

export type Lv = "out" | "landing" | "hall" | "gallery" | "base";
export interface UiAction { id: string; label: string }
export interface LibUi { level: Lv; levelName: string; actions: UiAction[]; picked: number; sitting: boolean; busy: boolean; toast: string; near: string }
export type LibAvatar = Avatar;
export interface LibraryApi {
  act(id: string): void; setStick(x: number, y: number): void; look(dx: number, dy: number): void; key(code: string, down: boolean): void;
  resize(w: number, h: number): void; dispose(): void; picked(): BookData[]; stats(): { books: number; fields: number };
  debugTeleport(level: Lv, x: number, z: number, yaw?: number, pitch?: number): void;
}

const NAMES: Record<Lv, string> = { out: "Library Plaza", landing: "Library Steps", hall: "Grand Reading Hall", gallery: "Upper Gallery", base: "Basement Archive" };
const Y: Record<Lv, number> = { out: 0, landing: 3.2, hall: 3.2, gallery: 9.2, base: 0 };
type AABB = [number, number, number, number, number]; // x0,x1,z0,z1,height above floor
interface Seat { x: number; z: number; yaw: number; lv: Lv }
interface Rec { x: number; y: number; z: number; w: number; h: number; fi: number; sn: number; gone: boolean }
interface LvBooks { mesh: THREE.InstancedMesh; recs: Rec[]; n: number }
type Step = { k: "walk"; x: number; z: number; y?: number; sp?: number } | { k: "wait"; t: number } | { k: "face"; h: number } | { k: "reach"; t: number } | { k: "fn"; f: () => void };

export function createLibraryWorld(canvas: HTMLCanvasElement, av: LibAvatar, onUi: (u: LibUi) => void): LibraryApi {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  const lowEnd = (navigator.hardwareConcurrency ?? 8) <= 4 || Math.min(window.innerWidth, window.innerHeight) < 500;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowEnd ? 1.25 : 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 400);
  const skyC = document.createElement("canvas"); skyC.width = 4; skyC.height = 256;
  { const g = skyC.getContext("2d")!; const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, "#4f9be0"); gr.addColorStop(0.6, "#a9d4f5"); gr.addColorStop(1, "#eaf4fb"); g.fillStyle = gr; g.fillRect(0, 0, 4, 256); }
  const skyTex = new THREE.CanvasTexture(skyC); skyTex.colorSpace = THREE.SRGBColorSpace; scene.background = skyTex;
  scene.fog = new THREE.Fog(0xcfe6f5, 60, 220);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x8a7a5a, 0.9); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d6, 1.0); sun.position.set(-40, 80, 60); scene.add(sun);
  const lantern = new THREE.PointLight(0xffe2b0, 0.0, 18, 1.6); scene.add(lantern);

  // ---------- helpers ----------
  const mats = new Map<string, THREE.MeshLambertMaterial>();
  const M = (c: string): THREE.MeshLambertMaterial => { let m = mats.get(c); if (!m) { m = new THREE.MeshLambertMaterial({ color: c }); mats.set(c, m); } return m; };
  const emc = new Map<string, THREE.MeshBasicMaterial>(); const EM = (c: string): THREE.MeshBasicMaterial => { let m = emc.get(c); if (!m) { m = new THREE.MeshBasicMaterial({ color: c }); emc.set(c, m); } return m; };
  const GLASS = new THREE.MeshLambertMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false });
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const ext = new THREE.Group(), inter = new THREE.Group(), base = new THREE.Group();
  scene.add(ext, inter, base);
  const obs: Record<Lv, AABB[]> = { out: [], landing: [], hall: [], gallery: [], base: [] };
  const seats: Seat[] = [];
  // Static geometry is batched per (group, material) so the whole building costs a handful of draw calls.
  const batches = new Map<string, { g: THREE.Object3D; m: THREE.Material; geos: THREE.BufferGeometry[] }>();
  const addStatic = (g: THREE.Object3D, m: THREE.Material, geo: THREE.BufferGeometry) => { const k = g.uuid + m.uuid; let b = batches.get(k); if (!b) { b = { g, m, geos: [] }; batches.set(k, b); } b.geos.push(geo); };
  const flush = () => { for (const b of batches.values()) { const mg = mergeGeometries(b.geos, false); if (!mg) continue; const me = new THREE.Mesh(mg, b.m); me.matrixAutoUpdate = false; me.frustumCulled = false; b.g.add(me); b.geos.forEach((x) => x.dispose()); } batches.clear(); };
  const bx = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, m: THREE.Material, g: THREE.Object3D = ext): void => {
    const geo = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0); geo.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); addStatic(g, m, geo);
  };
  const bxm = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, m: THREE.Material, g: THREE.Object3D = ext): THREE.Mesh => {
    const me = new THREE.Mesh(unit, m); me.scale.set(x1 - x0, y1 - y0, z1 - z0); me.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); g.add(me); return me;
  };
  const solid = (lv: Lv, x0: number, x1: number, z0: number, z1: number, h = 4) => { obs[lv].push([x0, x1, z0, z1, h]); };
  const cyl = (x: number, z: number, y0: number, y1: number, r: number, m: THREE.Material, g: THREE.Object3D = ext, seg = 14): void => {
    const geo = new THREE.CylinderGeometry(r, r, y1 - y0, seg); geo.translate(x, (y0 + y1) / 2, z); addStatic(g, m, geo);
  };
  const canvasTex = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat?: [number, number]) => {
    const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d")!);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); } return t;
  };
  const sign = (text: string, w: number, h: number, bg: string, fg: string, px: number) => {
    const t = canvasTex(512, Math.round(512 * h / w), (g) => { g.fillStyle = bg; g.fillRect(0, 0, 512, 512); g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(8, 8, 496, Math.round(512 * h / w) - 16); g.fillStyle = fg; g.font = `700 ${px}px Georgia, serif`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, 256, Math.round(512 * h / w) / 2 + 2, 470); });
    const me = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide })); return me;
  };
  const parquet = (tint: string) => canvasTex(256, 256, (g) => { g.fillStyle = tint; g.fillRect(0, 0, 256, 256); for (let r = 0; r < 8; r++) { for (let c = 0; c < 4; c++) { const off = (r % 2) * 32; g.fillStyle = `rgba(${r * 7 % 40},${c * 9 % 30},0,${0.05 + ((r * 5 + c * 3) % 7) * 0.025})`; g.fillRect(c * 64 + off, r * 32, 64, 32); g.strokeStyle = "rgba(40,20,5,.35)"; g.strokeRect(c * 64 + off, r * 32, 64, 32); } } });
  const floorPlane = (x0: number, x1: number, z0: number, z1: number, y: number, m: THREE.Material, tile: number, g: THREE.Object3D = ext) => {
    const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0); geo.rotateX(-Math.PI / 2);
    const uv = geo.attributes.uv!; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (x1 - x0) / tile, uv.getY(i) * (z1 - z0) / tile);
    geo.translate((x0 + x1) / 2, y, (z0 + z1) / 2); addStatic(g, m, geo);
  };
  const stairs = (x0: number, x1: number, za: number, zb: number, ya: number, yb: number, n: number, m: THREE.Material, g: THREE.Object3D) => {
    const dz = (zb - za) / n, dy = (yb - ya) / n, floor = Math.min(ya, yb);
    for (let i = 0; i < n; i++) { const a = za + i * dz, b = za + (i + 1) * dz; bx(x0, x1, floor, ya + (i + 1) * dy, Math.min(a, b), Math.max(a, b), m, g); }
  };

  // ---------- materials ----------
  const STONE = M("#d8cdb3"), STONE_D = M("#a99c7e"), MARBLE = M("#efe9da"), WALL = M("#e7dcc4"), WOOD = M("#4a2f1c"), WOOD_L = M("#8b5a33"), GOLD = M("#d4a63a");
  const floorHall = new THREE.MeshLambertMaterial({ map: parquet("#9a6a3c") }), floorBase = new THREE.MeshLambertMaterial({ map: parquet("#6f5238") });
  const roofM = new THREE.MeshLambertMaterial({ color: 0x5f9a86, side: THREE.DoubleSide });
  const ceilM = new THREE.MeshLambertMaterial({ color: 0xe9dfc6, side: THREE.DoubleSide });

  // ---------- OUTSIDE: plaza, grass, trees, stairs, facade ----------
  { const g = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), M("#5b9a47")); g.rotation.x = -Math.PI / 2; g.position.y = -0.05; ext.add(g); }
  floorPlane(-42, 42, 14, 64, 0.02, new THREE.MeshLambertMaterial({ map: canvasTex(128, 128, (g) => { g.fillStyle = "#cfc6b0"; g.fillRect(0, 0, 128, 128); g.strokeStyle = "rgba(90,80,60,.4)"; g.lineWidth = 2; g.strokeRect(0, 0, 128, 128); g.strokeRect(0, 0, 64, 64); g.strokeRect(64, 64, 64, 64); }) }), 6);
  floorPlane(-9, 9, 5.55, 14.2, 0.021, M("#b9ad92"), 4); // landing carpet strip foot
  solid("out", -4.5, 4.5, 34, 42, 1.2); cyl(0, 38, 0, 1.0, 4.2, STONE, ext, 28); cyl(0, 38, 1.0, 1.1, 3.8, M("#4aa3d8"), ext, 28); cyl(0, 38, 1.1, 2.6, 0.5, STONE_D); cyl(0, 38, 2.6, 2.7, 1.4, M("#4aa3d8"));
  for (const sx of [-1, 1]) for (const z of [20, 32, 46, 58]) { cyl(sx * 9, z, 0, 5, 0.1, M("#2b2b2b"), ext, 6); const b = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), EM("#fff2b0")); b.position.set(sx * 9, 5.1, z); ext.add(b); solid("out", sx * 9 - .3, sx * 9 + .3, z - .3, z + .3, 5); }
  for (const sx of [-1, 1]) for (const z of [24, 40, 56]) { bx(sx * 19 - 1.2, sx * 19 + 1.2, 0.35, 0.5, z - 0.4, z + 0.4, WOOD_L); bx(sx * 19 - 1.2, sx * 19 + 1.2, 0.8, 1.2, z + 0.4, z + 0.5, WOOD_L); solid("out", sx * 19 - 1.3, sx * 19 + 1.3, z - .5, z + .6, 1); bx(sx * 19 - 1.2, sx * 19 - 1.0, 0, 0.35, z - 0.4, z + 0.4, WOOD); bx(sx * 19 + 1.0, sx * 19 + 1.2, 0, 0.35, z - 0.4, z + 0.4, WOOD); }
  for (const sx of [-1, 1]) { bx(sx * 30 - 0.8, sx * 30 + 0.8, 0, 1.1, 18, 60, M("#3f7f3c")); solid("out", sx * 30 - 0.9, sx * 30 + 0.9, 17.9, 60.1, 1.1); }
  { // trees (instanced)
    const n = 46, trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.35, 0.5, 4, 6), M("#6b4a2b"), n), crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(3, 0), M("#3f8f3f"), n);
    const d = new THREE.Object3D(); let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < n; i++) { const side = i % 2 ? 1 : -1, x = side * (46 + rnd() * 50), z = -30 + rnd() * 130, s = 0.8 + rnd() * 0.9; d.position.set(x, 2 * s, z); d.scale.set(s, s, s); d.rotation.set(0, 0, 0); d.updateMatrix(); trunk.setMatrixAt(i, d.matrix); d.position.set(x, 5.2 * s, z); d.scale.set(s * 1.1, s, s * 1.1); d.updateMatrix(); crown.setMatrixAt(i, d.matrix); }
    ext.add(trunk, crown);
  }
  stairs(-7, 7, 14, 5.55, 0, 3.2, 13, STONE, ext);
  for (const sx of [-1, 1]) { bx(sx * 7 - (sx > 0 ? -0.0 : 1.0), sx * 7 + (sx > 0 ? 1.0 : 0), 0, 4.2, 5.55, 14.2, STONE_D); bx(sx * 7.2 - 0.3, sx * 7.2 + 0.3, 4.2, 4.5, 5.55, 14.2, MARBLE); }
  bx(-16, 16, 0, 3.2, 0, 5.55, STONE_D); bx(-16, 16, 3.2, 3.32, 0, 5.55, STONE);
  floorPlane(-3, 3, 0.1, 5.55, 3.33, M("#7a1f2b"), 4);
  // walls (full height, hollow inside; basement is inside the raised base)
  const WH = 17.5;
  bx(-31, -30, 0, WH, -59, 0, WALL); bx(30, 31, 0, WH, -59, 0, WALL); bx(-31, 31, 0, WH, -59, -58, WALL);
  bx(-31, 31, 0, 3.2, -1, 0, STONE_D); bx(-31, -3.5, 3.2, WH, -1, 0, WALL); bx(3.5, 31, 3.2, WH, -1, 0, WALL); bx(-3.5, 3.5, 10.6, WH, -1, 0, WALL);
  bx(-31.5, -31, 0, 3.2, -59.5, 0.5, STONE_D); bx(31, 31.5, 0, 3.2, -59.5, 0.5, STONE_D); bx(-31.5, 31.5, 0, 3.2, -59.5, -59, STONE_D); bx(-31.5, 31.5, 0, 3.2, 0, 0.5, STONE_D);
  bx(-31.6, 31.6, 3.1, 3.4, -59.6, 0.6, MARBLE); // string course
  // portico columns, entablature, pediment, lettering
  for (const x of [-13.5, -9.5, -5.5, 5.5, 9.5, 13.5]) { cyl(x, 3.6, 3.32, 15.2, 0.75, MARBLE, ext, 16); bx(x - 1, x + 1, 3.32, 3.9, 2.6, 4.6, STONE); bx(x - 1, x + 1, 14.8, 15.4, 2.6, 4.6, STONE); solid("landing", x - .8, x + .8, 2.8, 4.4, 12); }
  bx(-15.5, 15.5, 15.2, 16.9, 0, 4.8, STONE); bx(-15.5, 15.5, 16.9, 17.2, -0.5, 5.2, MARBLE);
  { const sh = new THREE.Shape(); sh.moveTo(-16.2, 0); sh.lineTo(16.2, 0); sh.lineTo(0, 4.2); sh.closePath(); const pg = new THREE.ExtrudeGeometry(sh, { depth: 4.8, bevelEnabled: false }); const pe = new THREE.Mesh(pg, STONE); pe.position.set(0, 17.2, 0); ext.add(pe); }
  { const t = sign("CAMPUS CENTRAL LIBRARY", 24, 1.3, "#e9dfc6", "#3a2a14", 54); t.position.set(0, 16.05, 4.85); ext.add(t); }
  { const t = sign("KNOWLEDGE · RESEARCH · TRUTH", 12, 0.9, "#7a1f2b", "#f1d27a", 40); t.position.set(0, 11.3, 0.03); ext.add(t); }
  // clerestory + front windows (emissive glass with mullions)
  const winM = new THREE.MeshBasicMaterial({ color: 0xbfe3ff, side: THREE.DoubleSide });
  const win = (cx: number, cy: number, w: number, h: number, axis: "x" | "z", at: number, gm: THREE.Object3D = ext) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), winM); if (axis === "x") { p.rotation.y = Math.PI / 2; p.position.set(at, cy, cx); } else p.position.set(cx, cy, at); p.matrixAutoUpdate = false; p.updateMatrix(); gm.add(p);
    const fr = M("#5a4a38"); if (axis === "x") { bx(at - 0.06, at + 0.06, cy - h / 2, cy + h / 2, cx - 0.05, cx + 0.05, fr, gm); bx(at - 0.06, at + 0.06, cy - 0.05, cy + 0.05, cx - w / 2, cx + w / 2, fr, gm); } else { bx(cx - 0.05, cx + 0.05, cy - h / 2, cy + h / 2, at - 0.06, at + 0.06, fr, gm); bx(cx - w / 2, cx + w / 2, cy - 0.05, cy + 0.05, at - 0.06, at + 0.06, fr, gm); }
  };
  for (let i = 0; i < 8; i++) { const z = -6 - i * 7; for (const [at, o] of [[-30.03, 0], [-31.03, 0], [30.03, 0], [31.03, 0]] as [number, number][]) win(z, 13.6 + o, 3.2, 6, "x", at); }
  for (const x of [-18, -10, 10, 18]) { win(x, 7.5, 3, 5.4, "z", 0.04); win(x, 7.5, 3, 5.4, "z", -1.04); }
  { const rose = new THREE.Mesh(new THREE.CircleGeometry(5.2, 40), new THREE.MeshBasicMaterial({ color: 0xf3d58a })); rose.position.set(0, 11.5, -57.9); inter.add(rose); const ring = new THREE.Mesh(new THREE.TorusGeometry(5.2, 0.25, 8, 40), WOOD); ring.position.set(0, 11.5, -57.85); inter.add(ring); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; const sp = bxm(-0.06, 0.06, 0, 5.2, -57.88, -57.8, WOOD, inter); sp.position.set(Math.sin(a) * 2.6, 11.5 + Math.cos(a) * 2.6, -57.82); sp.rotation.z = -a; } }
  // vaulted roof (+ gables, ribs)
  { const R = 31, rise = 0.3, vg = new THREE.CylinderGeometry(R, R, 59.5, 40, 1, true, Math.PI / 2, Math.PI); vg.rotateX(Math.PI / 2); const v = new THREE.Mesh(vg, roofM); v.scale.set(1, rise, 1); v.position.set(0, WH, -29.5); ext.add(v);
    const gs = new THREE.Shape(); gs.absellipse(0, 0, R, R * rise, 0, Math.PI, false, 0); gs.closePath(); const gg = new THREE.ShapeGeometry(gs, 30);
    for (const z of [-0.5, -58.5]) { const m = new THREE.Mesh(gg, WALL.clone()); m.material.side = THREE.DoubleSide; m.position.set(0, WH, z); ext.add(m); }
    for (let z = -4; z > -58; z -= 9) { const rb = new THREE.Mesh(new THREE.TorusGeometry(R - 0.3, 0.45, 6, 40, Math.PI), M("#c9b98f")); rb.scale.set(1, rise, 1); rb.position.set(0, WH, z); ext.add(rb); }
  }
  // ---------- floors / slab / rails ----------
  floorPlane(-30, 30, -58, -1, 0.02, floorBase, 4, base); bx(-30, 30, 2.8, 3.0, -58, -1, M("#d9cdb1"), base);
  // hall slab (with stairwell hole x[-3.5,3.5] z[-16,-6])
  const slabM = M("#d9cdb1");
  bx(-31, 31, 2.8, 3.2, -59, -16, slabM); bx(-31, 31, 2.8, 3.2, -6, 0, slabM); bx(-31, -3.5, 2.8, 3.2, -16, -6, slabM); bx(3.5, 31, 2.8, 3.2, -16, -6, slabM);
  { const hf = new THREE.MeshLambertMaterial({ map: parquet("#a2733f") }); const part = (x0: number, x1: number, z0: number, z1: number) => floorPlane(x0, x1, z0, z1, 3.205, hf, 4, inter); part(-30, 30, -58, -16); part(-30, 30, -6, -1); part(-30, -3.5, -16, -6); part(3.5, 30, -16, -6); }
  floorPlane(-3, 3, -58, -1, 3.215, M("#7a1f2b"), 4, inter); 
  stairs(-3.5, 3.5, -6, -16, 3.2, 0, 13, M("#cdbf9e"), inter);
  solid("hall", -3.8, 3.8, -16.2, -5.6, 1.2); solid("base", -3.8, 3.8, -16.2, -5.8, 4);
  for (const [x0, x1, z0, z1] of [[-3.6, -3.4, -16.1, -6], [3.4, 3.6, -16.1, -6], [-3.6, 3.6, -16.2, -16]] as number[][]) { bx(x0!, x1!, 3.2, 4.3, z0!, z1!, GLASS, inter); bx(x0! - .04, x1! + .04, 4.25, 4.35, z0! - .04, z1! + .04, WOOD, inter); }
  // gallery slabs, rails, stairs up (left/right)
  const galP = new THREE.MeshLambertMaterial({ map: parquet("#a2733f") });
  for (const sx of [-1, 1]) {
    const a = sx < 0 ? -31 : 18, b = sx < 0 ? -18 : 31;
    bx(a, b, 8.8, 9.2, -59, -20, slabM, inter); floorPlane(a + (sx < 0 ? 1 : 0), b - (sx < 0 ? 0 : 1), -58, -20, 9.205, galP, 4, inter);
    bx(sx * 18 - 0.06, sx * 18 + 0.06, 9.2, 10.3, -50, -20, GLASS, inter); bx(sx * 18 - 0.1, sx * 18 + 0.1, 10.25, 10.4, -50, -20, WOOD, inter);
    for (let z = -50; z <= -20; z += 3) bx(sx * 18 - 0.12, sx * 18 + 0.12, 9.2, 10.4, z - 0.07, z + 0.07, WOOD, inter);
    bx(sx > 0 ? 18 : -25.4, sx > 0 ? 25.4 : -18, 9.2, 10.4, -20.1, -19.9, GLASS, inter); bx(sx > 0 ? 18 : -25.4, sx > 0 ? 25.4 : -18, 10.25, 10.4, -20.1, -19.9, WOOD, inter);
    stairs(sx * 27.5 - 1.8, sx * 27.5 + 1.8, -8, -20, 3.2, 9.2, 24, M("#cdbf9e"), inter);
    bx(sx * 27.5 - 2.0, sx * 27.5 - 1.8, 3.2, 4.4, -20, -8, GLASS, inter); bx(sx * 27.5 + 1.8, sx * 27.5 + 2.0, 3.2, 4.4, -20, -8, GLASS, inter);
    solid("hall", sx * 27.5 - 2.2, sx * 27.5 + 2.2, -20.2, -7.6, 8); solid("gallery", sx * 27.5 - 2.2, sx * 27.5 + 2.2, -20.3, -19.6, 1);
  }
  bx(-18, 18, 8.8, 9.2, -59, -50, slabM, inter); floorPlane(-18, 18, -58, -50, 9.205, galP, 4, inter);
  bx(-18, 18, 9.2, 10.3, -50.06, -49.94, GLASS, inter); bx(-18, 18, 10.25, 10.4, -50.1, -49.9, WOOD, inter);
  for (const sx of [-1, 1]) for (let z = -58; z <= -20; z += 7.6) { const col = cyl(sx * 18, z - (z < -57 ? -0.9 : 0), 3.2, 17.2, 0.6, MARBLE, inter, 12); void col; if (z > -58) solid("hall", sx * 18 - .7, sx * 18 + .7, z - .7, z + .7, 14); }
  // chandeliers
  for (const z of [-22, -36, -50]) { const r = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.12, 6, 24), M("#b8902f")); r.rotation.x = Math.PI / 2; r.position.set(0, 12.5, z); inter.add(r); for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; const l = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 4), EM("#fff0b8")); l.position.set(Math.cos(a) * 2.2, 12.5, z + Math.sin(a) * 2.2); inter.add(l); } cyl(0, z, 12.5, 18, 0.04, M("#555"), inter, 4); }

  // ---------- furniture ----------
  const table = (lv: Lv, cx: number, cz: number, len: number, g: THREE.Object3D) => {
    const y = Y[lv]; bx(cx - len / 2, cx + len / 2, y + 0.74, y + 0.8, cz - 0.7, cz + 0.7, WOOD_L, g); bx(cx - len / 2 + 0.2, cx - len / 2 + 0.35, y, y + 0.74, cz - 0.55, cz + 0.55, WOOD, g); bx(cx + len / 2 - 0.35, cx + len / 2 - 0.2, y, y + 0.74, cz - 0.55, cz + 0.55, WOOD, g);
    solid(lv, cx - len / 2, cx + len / 2, cz - 0.7, cz + 0.7, 0.9);
    for (const lx of [-len / 4, len / 4]) { bx(cx + lx - 0.18, cx + lx + 0.18, y + 0.8, y + 0.85, cz - 0.12, cz + 0.12, M("#1d5a3a"), g); bx(cx + lx - 0.14, cx + lx + 0.14, y + 0.85, y + 1.05, cz - 0.1, cz + 0.1, EM("#ffe8a0"), g); }
    const n = Math.max(2, Math.floor(len / 2.1));
    for (let i = 0; i < n; i++) { const x = cx - len / 2 + (i + 0.5) * len / n; for (const s of [-1, 1]) { const z = cz + s * 1.2; bx(x - 0.28, x + 0.28, y + 0.42, y + 0.48, z - 0.28, z + 0.28, WOOD, g); bx(x - 0.28, x + 0.28, y + 0.48, y + 1.0, z + s * 0.24, z + s * 0.3, WOOD, g); for (const [ox, oz] of [[-0.24, -0.24], [0.24, -0.24], [-0.24, 0.24], [0.24, 0.24]] as number[][]) bx(x + ox! - .03, x + ox! + .03, y, y + 0.42, z + oz! - .03, z + oz! + .03, WOOD, g); seats.push({ x, z: z + s * 0.02, yaw: s > 0 ? Math.PI : 0, lv }); } }
  };
  for (const z of [-26, -33.5, -41, -48.5]) table("hall", 0, z, 7, inter);
  for (const x of [-10, 0, 10]) table("gallery", x, -54, 6, inter);
  for (const z of [-26, -35, -44, -53]) table("base", 0, z, 7, base);
  { const d = (x0: number, x1: number, z0: number, z1: number) => { bx(x0, x1, 3.2, 4.3, z0, z1, WOOD, inter); bx(x0 - .1, x1 + .1, 4.3, 4.4, z0 - .1, z1 + .1, WOOD_L, inter); solid("hall", x0 - .1, x1 + .1, z0 - .1, z1 + .1, 1.2); };
    d(8, 16, -8.6, -7.4); const s = sign("INFORMATION", 5, 0.8, "#7a1f2b", "#f1d27a", 70); s.position.set(12, 5.2, -8); inter.add(s); }

  // ---------- books (instanced) ----------
  const lvBooks: Partial<Record<Lv, LvBooks>> = {};
  const stackDefs: { lv: Lv; axis: "x" | "z"; cx: number; cz: number; len: number; fi: number; dbl: boolean; wallDir: number; rows: number; rowH: number }[] = [];
  const hallF = [0, 0, 1, 1, 2, 3, 3, 4, 5, 5];
  [-26.5, -33, -39.5, -46, -52.5].forEach((z, i) => { stackDefs.push({ lv: "hall", axis: "x", cx: -19.5, cz: z, len: 15, fi: hallF[i]!, dbl: true, wallDir: 0, rows: 5, rowH: 0.62 }); stackDefs.push({ lv: "hall", axis: "x", cx: 19.5, cz: z, len: 15, fi: hallF[5 + i]!, dbl: true, wallDir: 0, rows: 5, rowH: 0.62 }); });
  stackDefs.push({ lv: "gallery", axis: "z", cx: -23.8, cz: -37, len: 26, fi: 6, dbl: true, wallDir: 0, rows: 5, rowH: 0.62 }, { lv: "gallery", axis: "z", cx: -29.45, cz: -40, len: 32, fi: 7, dbl: false, wallDir: 1, rows: 5, rowH: 0.62 }, { lv: "gallery", axis: "z", cx: 23.8, cz: -37, len: 26, fi: 8, dbl: true, wallDir: 0, rows: 5, rowH: 0.62 }, { lv: "gallery", axis: "z", cx: 29.45, cz: -40, len: 32, fi: 9, dbl: false, wallDir: -1, rows: 5, rowH: 0.62 });
  [-22, -27.5, -33, -38.5, -44, -49.5, -55].forEach((z, i) => { const f = 10 + Math.min(3, Math.floor(i * 4 / 7)); stackDefs.push({ lv: "base", axis: "x", cx: -19.5, cz: z, len: 15, fi: f, dbl: true, wallDir: 0, rows: 5, rowH: 0.5 }); stackDefs.push({ lv: "base", axis: "x", cx: 19.5, cz: z, len: 15, fi: 10 + Math.min(3, Math.floor((i + 0.5) * 4 / 7)), dbl: true, wallDir: 0, rows: 5, rowH: 0.5 }); });
  const spacing = lowEnd ? 1.8 : 1.3;
  const placeBooks = (lv: Lv) => {
    const defs = stackDefs.filter((s) => s.lv === lv), recs: Rec[] = [], cols: THREE.Color[] = [], out: number[][] = [];
    let seed = 1234 + lv.length * 97; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const serial = new Map<number, number>();
    const parent = lv === "base" ? base : inter;
    for (const s of defs) {
      const f = FIELDS[s.fi]!, hue = f.hue, y0 = Y[lv], D = s.dbl ? 1.34 : 0.62, top = y0 + 0.12 + s.rows * s.rowH + 0.1;
      const ax = s.axis === "x";
      // frame
      const wx = (u: number, v: number) => (ax ? s.cx + u : s.cx + v), wz = (u: number, v: number) => (ax ? s.cz + v : s.cz + u);
      const box = (u0: number, u1: number, v0: number, v1: number, ya: number, yb: number, m: THREE.Material) => { const xs = [wx(u0, v0), wx(u1, v1)], zs = [wz(u0, v0), wz(u1, v1)]; return bx(Math.min(xs[0]!, xs[1]!), Math.max(xs[0]!, xs[1]!), ya, yb, Math.min(zs[0]!, zs[1]!), Math.max(zs[0]!, zs[1]!), m, parent); };
      const v0 = s.dbl ? -D / 2 : 0, v1 = s.dbl ? D / 2 : D * s.wallDir;
      const vlo = Math.min(v0, v1), vhi = Math.max(v0, v1);
      box(-s.len / 2, s.len / 2, s.dbl ? -0.03 : (s.wallDir > 0 ? -0.04 : 0), s.dbl ? 0.03 : (s.wallDir > 0 ? 0 : 0.04), y0, top, WOOD);
      for (let r = 0; r <= s.rows; r++) { const yy = y0 + 0.1 + r * s.rowH; box(-s.len / 2, s.len / 2, vlo, vhi, yy - 0.025, yy + 0.025, WOOD_L); }
      for (let u = -s.len / 2; u <= s.len / 2 + 0.01; u += 3.75) box(u - 0.04, u + 0.04, vlo, vhi, y0, top, WOOD);
      box(-s.len / 2 - 0.1, s.len / 2 + 0.1, vlo - 0.02, vhi + 0.02, top, top + 0.08, WOOD);
      const hw = ax ? s.len / 2 : D / 2 + 0.1, hd = ax ? D / 2 + 0.1 : s.len / 2;
      if (s.dbl) solid(lv, s.cx - hw, s.cx + hw, s.cz - hd, s.cz + hd, top - y0 + 0.1); else solid(lv, ax ? s.cx - s.len / 2 : s.cx + Math.min(0, D * s.wallDir) - 0.1, ax ? s.cx + s.len / 2 : s.cx + Math.max(0, D * s.wallDir) + 0.1, ax ? s.cz - 0.1 : s.cz - s.len / 2, ax ? s.cz + D : s.cz + s.len / 2, top - y0 + 0.1);
      // books
      const faces = s.dbl ? [-1, 1] : [s.wallDir];
      let sn = serial.get(s.fi) ?? 0;
      for (const fs of faces) for (let r = 0; r < s.rows; r++) {
        let u = -s.len / 2 + 0.08; const rowY = y0 + 0.125 + r * s.rowH;
        while (true) {
          const t = (0.06 + rnd() * 0.07) * spacing; if (u + t > s.len / 2 - 0.05) break;
          const h = (s.rowH - 0.1) * (0.72 + rnd() * 0.28), dep = 0.34 + rnd() * 0.12, vc = (s.dbl ? 0.06 : 0.04) * fs + fs * dep / 2 + (s.dbl ? 0 : 0);
          const x = wx(u + t / 2, vc), z = wz(u + t / 2, vc), w = ax ? t * 0.94 : dep, d = ax ? dep : t * 0.94;
          const c = new THREE.Color().setHSL((hue + (rnd() - 0.5) * 0.09 + 1) % 1, 0.35 + rnd() * 0.4, 0.28 + rnd() * 0.3);
          cols.push(c); out.push([x, rowY + h / 2, z, w, h, d]); recs.push({ x, y: rowY + h / 2, z, w, h, fi: s.fi, sn: sn++, gone: false });
          u += t + 0.004;
        }
      }
      serial.set(s.fi, sn);
      // aisle-end label
      for (const e of [-1, 1]) { const lb = sign(f.name.toUpperCase(), 2.8, 0.55, "#2a1a0e", "#f1d27a", 54); lb.position.set(wx(e * (s.len / 2 + 0.2), 0), top + 0.4, wz(e * (s.len / 2 + 0.2), 0)); lb.rotation.y = ax ? (e > 0 ? Math.PI / 2 : -Math.PI / 2) : (e > 0 ? 0 : Math.PI); parent.add(lb); }
    }
    const mesh = new THREE.InstancedMesh(unit, new THREE.MeshLambertMaterial({ color: 0xffffff }), Math.max(1, out.length)); const d = new THREE.Object3D();
    out.forEach((o, i) => { d.position.set(o[0]!, o[1]!, o[2]!); d.scale.set(o[3]!, o[4]!, o[5]!); d.updateMatrix(); mesh.setMatrixAt(i, d.matrix); mesh.setColorAt(i, cols[i]!); recs[i]!.w = o[3]!; recs[i]!.h = o[4]!; });
    mesh.frustumCulled = false; parent.add(mesh); lvBooks[lv] = { mesh, recs, n: out.length };
  };
  placeBooks("hall"); placeBooks("gallery"); placeBooks("base"); flush();
  const totalBooks = (["hall", "gallery", "base"] as Lv[]).reduce((a, l) => a + (lvBooks[l]?.n ?? 0), 0);
  // hanging field banners over the hall nave
  FIELDS.slice(0, 6).forEach((f, i) => { const s = sign(f.name.toUpperCase(), 4.4, 0.9, "#1f2a44", "#f1d27a", 64); s.position.set(i % 2 ? 9 : -9, 7.4, -22 - Math.floor(i / 2) * 14); s.rotation.y = Math.PI / 2 * (i % 2 ? -1 : 1) * 0; inter.add(s); });

  // restore picked books
  const pickedIds: { f: number; s: number }[] = [];
  const hideRec = (lv: Lv, r: Rec, idx: number) => { const b = lvBooks[lv]!; const d = new THREE.Object3D(); d.position.set(r.x, -50, r.z); d.scale.setScalar(0.0001); d.updateMatrix(); b.mesh.setMatrixAt(idx, d.matrix); b.mesh.instanceMatrix.needsUpdate = true; r.gone = true; };
  try { const raw = localStorage.getItem("campus.library.picked"); if (raw) { const arr = JSON.parse(raw) as { f: number; s: number }[]; for (const p of arr) for (const lv of ["hall", "gallery", "base"] as Lv[]) { const b = lvBooks[lv]!; const idx = b.recs.findIndex((r) => r.fi === p.f && r.sn === p.s); if (idx >= 0) { hideRec(lv, b.recs[idx]!, idx); pickedIds.push(p); } } } } catch { /* storage blocked: start with an empty bag */ }

  // ---------- avatar ----------
  const hero = new THREE.Group(); scene.add(hero);
  const skinM = M(av.skin), outM = M(av.outfit), hairM = M(av.hairColor), pantsM = M(({ jeans: "#2b4a7a", chinos: "#b59a6a", joggers: "#3a3f4a", shorts: "#2b4a7a" } as Record<string, string>)[av.bottom ?? ""] ?? "#1d2740");
  const shoeC = av.shoes === "black_sneakers" ? "#1c2030" : av.shoes === "red_sneakers" ? "#e8443a" : av.shoes === "boots" ? "#6b4423" : av.shoes === "sandals" ? "#c98a4d" : "#f4f6fa";
  const kaf = av.top === "kaftan";
  const mk = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, p: THREE.Object3D) => { const me = new THREE.Mesh(unit, m); me.scale.set(w, h, d); me.position.set(x, y, z); p.add(me); return me; };
  const torso = new THREE.Group(); torso.position.y = 0.92; hero.add(torso);
  mk(0.5, 0.62, 0.28, outM, 0, 0.31, 0, torso); if (kaf) mk(0.54, 0.7, 0.32, outM, 0, -0.32, 0, torso);
  if (av.backpack === "backpack") mk(0.4, 0.5, 0.18, M("#1d4fd8"), 0, 0.33, -0.23, torso);
  const head = new THREE.Group(); head.position.set(0, 0.86, 0); torso.add(head);
  { const h = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 12), skinM); head.add(h);
    for (const sx of [-1, 1]) mk(0.045, 0.06, 0.03, M("#16120f"), sx * 0.075, 0.02, 0.19, head);
    if (av.accessory === "glasses" || av.accessory === "sunglasses") mk(0.28, 0.05, 0.03, M(av.accessory === "sunglasses" ? "#0c0c0c" : "#3a3a3a"), 0, 0.025, 0.2, head);
    if (av.hair === "afro") { const a = new THREE.Mesh(new THREE.SphereGeometry(0.29, 12, 10), hairM); a.position.set(0, 0.06, -0.03); head.add(a); }
    else if (av.hair !== "bald") { const cap = new THREE.Mesh(new THREE.SphereGeometry(0.215, 14, 10, 0, Math.PI * 2, 0, av.hair === "fade" ? Math.PI * 0.42 : Math.PI * 0.55), av.hair === "cap" ? outM : hairM); cap.position.y = 0.01; head.add(cap); if (av.hair === "cap") mk(0.26, 0.03, 0.18, outM, 0, 0.1, 0.2, head); if (av.hair === "braids") for (let i = -3; i <= 3; i++) mk(0.04, 0.3, 0.04, hairM, i * 0.06, -0.12, -0.17, head); } }
  const limb = (x: number, y: number, top: THREE.Material, bot: THREE.Material, len: number, w: number) => { const g = new THREE.Group(); g.position.set(x, y, 0); mk(w, len * 0.5, w, top, 0, -len * 0.25, 0, g); mk(w * 0.92, len * 0.5, w * 0.92, bot, 0, -len * 0.75, 0, g); return g; };
  const armL = limb(-0.34, 0.58, outM, skinM, 0.56, 0.14), armR = limb(0.34, 0.58, outM, skinM, 0.56, 0.14); torso.add(armL, armR);
  const legL = limb(-0.13, 0, pantsM, pantsM, 0.92, 0.2), legR = limb(0.13, 0, pantsM, pantsM, 0.92, 0.2); legL.position.y = legR.position.y = 0.92; hero.add(legL, legR);
  for (const l of [legL, legR]) mk(0.22, 0.1, 0.32, M(shoeC), 0, -0.9, 0.05, l);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.4, 14), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28 })); shadow.rotation.x = -Math.PI / 2; scene.add(shadow);

  // ---------- dynamic (realistic, textured, skinned) avatar: same body, wardrobe and animation clips as the campus ----------
  interface Real { an: CharacterAnimator; st: AnimState; groups: string[]; yawOff: number; pos: THREE.BufferAttribute; nor: THREE.BufferAttribute; uvs: THREE.BufferAttribute; geo: THREE.BufferGeometry; mat: THREE.ShaderMaterial; out: { p: number[]; n: number[]; u: number[] } }
  let real: Real | null = null, disposed = false;
  const AV_VERT = `varying vec3 vN; varying vec3 vW; varying vec2 vUv; void main(){ vUv=uv; vN=mat3(modelMatrix)*normal; vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`;
  const AV_FRAG = `precision highp float; uniform sampler2D uTexA; uniform sampler2D uTexM; uniform vec3 uSkinT; uniform vec3 uHairC; uniform vec3 uTopC; uniform float uHairL; uniform float uTopL;
uniform vec4 uTopRect; uniform vec4 uBotRect; uniform vec4 uShoeRect; uniform float uTopPat; uniform vec3 uTopAcc; uniform float uBotKind; uniform float uBotCut; uniform float uShoeKind; uniform vec3 uShoeC;
uniform vec3 uLight; uniform float uSun; uniform float uAmb; uniform vec3 uFogC; uniform float uFogN; uniform float uFogF;
varying vec3 vN; varying vec3 vW; varying vec2 vUv;
float inR(vec4 r){ return step(r.x,vUv.x)*step(vUv.x,r.z)*step(r.y,vUv.y)*step(vUv.y,r.w); }
float h2(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float vn2(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h2(i),h2(i+vec2(1.0,0.0)),f.x),mix(h2(i+vec2(0.0,1.0)),h2(i+vec2(1.0,1.0)),f.x),f.y); }
void main(){
 vec4 a=texture2D(uTexA,vUv); if(a.a<.5) discard;
 vec3 m=texture2D(uTexM,vUv).rgb; vec3 c=a.rgb; float L=dot(c,vec3(.299,.587,.114));
 float inTop=inR(uTopRect), inBot=inR(uBotRect), inShoe=inR(uShoeRect);
 vec2 lt=(vUv-uTopRect.xy)/(uTopRect.zw-uTopRect.xy), lb=(vUv-uBotRect.xy)/(uBotRect.zw-uBotRect.xy);
 if(inBot>.5){ if(uBotKind>2.5&&lb.y>uBotCut) discard; if(uBotKind>.5&&uBotKind<1.5) c=vec3(.66,.55,.38)*(.45+1.0*L); else if(uBotKind>1.5&&uBotKind<2.5) c=vec3(.17,.18,.2)*(.55+.9*L); }
 if(inShoe>.5&&uShoeKind>.5) c=uShoeC*(.4+1.15*L);
 vec3 skinC=c*uSkinT, hairC=uHairC*clamp(L/uHairL,0.0,1.5), topC=uTopC*clamp(L/uTopL,0.0,1.6), topF=topC;
 if(inTop>.5&&uTopPat>.5){
  if(uTopPat<1.5){ float st=step(.5,fract(lt.y*16.0)); topF=mix(topC,uTopAcc*(.45+L),st*.85); }
  else if(uTopPat<2.5){ vec2 p=fract(lt*vec2(7.0,9.0))-.5; float r=length(p); float ring=step(.30,r)-step(.38,r); float dt=1.0-step(.12,r); float dg=step(.5,fract((lt.x+lt.y)*14.0)); topF=mix(topC,uTopAcc,dg*.55); topF=mix(topF,vec3(.95,.72,.15),ring); topF=mix(topF,vec3(.96,.94,.9),dt); topF*=(.62+.75*L); }
  else if(uTopPat<3.5){ float n1=vn2(lt*14.0), n2=vn2(lt*14.0+7.3), n3=vn2(lt*26.0+2.0); vec3 cc=vec3(.55,.5,.33); cc=mix(cc,vec3(.30,.34,.20),step(.5,n1)); cc=mix(cc,vec3(.33,.24,.14),step(.58,n2)*.9); cc=mix(cc,vec3(.10,.12,.09),step(.62,n3)); topF=cc*(.55+.9*L); }
  else if(uTopPat<4.5){ topF=topC*(.9+.2*vn2(lt*220.0)); }
  else { float st=step(.5,fract(lt.x*9.0)); topF=mix(topC,uTopAcc*(.45+L),st*.8); }
 }
 c=mix(c,skinC,m.r); c=mix(c,hairC,m.g); c=mix(c,topF,m.b*.92);
 vec3 n=normalize(vN); vec3 Ld=normalize(uLight); vec3 albedo=pow(clamp(c,0.0,1.0),vec3(2.2));
 float ndl=dot(n,Ld); float d=max(ndl,0.0); float wrapL=clamp((ndl+.45)/1.45,0.0,1.0); float hemi=n.y*.5+.5;
 vec3 amb=mix(vec3(.40,.34,.26),vec3(.62,.72,.95),hemi)*uAmb; vec3 direct=vec3(1.0,.93,.8)*uSun*mix(d,wrapL,m.r*.5);
 vec3 col=albedo*(direct+amb); col=col/(1.0+col*.28); col=pow(col,vec3(1.0/2.2));
 float dist=length(cameraPosition-vW); col=mix(col,uFogC,smoothstep(uFogN,uFogF,dist)*.9);
 gl_FragColor=vec4(col,1.0);
}`;
  const hx = (h: string): [number, number, number] => { const n = parseInt(String(h).replace("#", ""), 16) || 0; return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
  void (async () => {
    try {
      const model = await loadSkinnedCharacter(CHARACTER_SETS[bodyKind(av)].url);
      if (!model || !model.uvs || !model.atlas || disposed) return;
      const an = createCharacterAnimator(model), at = model.atlas, loader = new THREE.TextureLoader();
      const tex = (n: string) => new Promise<THREE.Texture>((res, rej) => loader.load((model.baseUrl || "") + n, (t) => { t.colorSpace = THREE.NoColorSpace; t.flipY = false; t.anisotropy = 4; res(t); }, undefined, rej));
      const [ta, tm] = await Promise.all([tex(at.albedo), tex(at.mask)]); if (disposed) return;
      const st = styleFor(av), sk = hx(av.skin), R = at.skinRef, V3 = (a: number[]) => new THREE.Vector3(a[0], a[1], a[2]), V4 = (a: number[]) => new THREE.Vector4(a[0], a[1], a[2], a[3]);
      const mat = new THREE.ShaderMaterial({ vertexShader: AV_VERT, fragmentShader: AV_FRAG, side: THREE.DoubleSide, uniforms: {
        uTexA: { value: ta }, uTexM: { value: tm }, uSkinT: { value: new THREE.Vector3(Math.min(1.7, sk[0] / Math.max(0.05, R[0])), Math.min(1.7, sk[1] / Math.max(0.05, R[1])), Math.min(1.7, sk[2] / Math.max(0.05, R[2]))) },
        uHairC: { value: V3(hx(av.hairColor)) }, uTopC: { value: V3(hx(av.outfit)) }, uHairL: { value: Math.max(0.05, at.hairLuma) }, uTopL: { value: Math.max(0.05, at.topLuma) },
        uTopRect: { value: V4(at.topRect) }, uBotRect: { value: V4(at.botRect) }, uShoeRect: { value: V4(at.shoeRect) }, uTopPat: { value: st.topPat }, uTopAcc: { value: V3(st.topAcc) },
        uBotKind: { value: st.botKind }, uBotCut: { value: at.botCut }, uShoeKind: { value: st.shoeKind }, uShoeC: { value: V3(st.shoeColor) },
        uLight: { value: new THREE.Vector3(-0.4, 0.8, 0.5) }, uSun: { value: 1.6 }, uAmb: { value: 1.0 }, uFogC: { value: new THREE.Color(0xcfe6f5) }, uFogN: { value: 60 }, uFogF: { value: 220 } } });
      const groups = an.groups(av), maxV = model.indices.length + 6000, geo = new THREE.BufferGeometry();
      const pos = new THREE.BufferAttribute(new Float32Array(maxV * 3), 3).setUsage(THREE.DynamicDrawUsage), nor = new THREE.BufferAttribute(new Float32Array(maxV * 3), 3).setUsage(THREE.DynamicDrawUsage), uvs = new THREE.BufferAttribute(new Float32Array(maxV * 2), 2).setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute("position", pos); geo.setAttribute("normal", nor); geo.setAttribute("uv", uvs); geo.setDrawRange(0, 0);
      const me = new THREE.Mesh(geo, mat); me.frustumCulled = false; hero.add(me);
      const f = model.forward; const yawOff = -Math.atan2(f[0], f[2]); me.rotation.y = yawOff;
      real = { an, st: an.create(), groups, yawOff, pos, nor, uvs, geo, mat, out: { p: [], n: [], u: [] } };
      torso.visible = false; legL.visible = false; legR.visible = false;
    } catch { /* keep the simple avatar */ }
  })();

  // ---------- doors ----------
  const leafL = new THREE.Group(), leafR = new THREE.Group(); leafL.position.set(-3.5, 3.2, -0.5); leafR.position.set(3.5, 3.2, -0.5); ext.add(leafL, leafR);
  for (const [lf, dir] of [[leafL, 1], [leafR, -1]] as [THREE.Group, number][]) { const w = 3.5; mk(w, 7.4, 0.28, M("#5a3a22"), dir * w / 2, 3.7, 0, lf); for (const [py, ph] of [[2.1, 2.4], [5.3, 2.6]] as number[][]) mk(w - 0.7, ph!, 0.34, M("#744a2c"), dir * w / 2, py!, 0, lf); mk(0.1, 0.6, 0.4, GOLD, dir * (w - 0.3), 3.6, 0, lf); }
  let doorOpen = 0, doorTarget = 0;

  // ---------- state ----------
  let lv: Lv = "out"; const pos = new THREE.Vector3(0, 0, 46); let heading = Math.PI, camYaw = Math.PI, camPitch = 0.38; const camDist = 6.2;
  let sitting: Seat | null = null, seq: Step[] | null = null, seqT = 0, seqFrom: { x: number; z: number; y: number } | null = null, seqLen = 0, reach = 0, walkPh = 0, speedNow = 0, pickT = 0;
  const stick = { x: 0, y: 0 }; const keys = new Set<string>(); let toast = "", toastUntil = 0, sprint = false; let lastUi = "", uiT = 0;
  let nearBook: { lv: Lv; i: number } | null = null; const bagRef = pickedIds;
  const hl = new THREE.Mesh(unit, new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.55, depthTest: false })); hl.visible = false; hl.renderOrder = 10; scene.add(hl);
  const say = (m: string, ms = 4200) => { toast = m; toastUntil = performance.now() + ms; };
  const inb = (x: number, z: number, a: number[]) => x >= a[0]! && x <= a[1]! && z >= a[2]! && z <= a[3]!;
  const walkable = (l: Lv, x: number, z: number): boolean => {
    switch (l) {
      case "out": return inb(x, z, [-40, 40, 14.8, 62]);
      case "landing": return inb(x, z, [-14, 14, 0.7, 5.2]);
      case "hall": case "base": return inb(x, z, [-29.6, 29.6, -57.6, -1.4]);
      case "gallery": return inb(x, z, [-29.6, -18.4, -57.6, -20.6]) || inb(x, z, [18.4, 29.6, -57.6, -20.6]) || inb(x, z, [-18.4, 18.4, -57.6, -50.6]);
    }
  };
  const blocked = (l: Lv, x: number, z: number): boolean => {
    if (!walkable(l, x, z)) return true; const R = 0.38;
    for (const o of obs[l]) if (x > o[0] - R && x < o[1] + R && z > o[2] - R && z < o[3] + R) return true; return false;
  };
  const setLevel = (n: Lv) => {
    lv = n; ext.visible = true; inter.visible = n === "landing" || n === "hall" || n === "gallery"; base.visible = n === "base";
    if (n === "out") inter.visible = false;
  };
  setLevel("out");

  // ---------- scripted movement (stairs, doors) ----------
  const run = (steps: Step[]) => { seq = steps.slice(); seqT = 0; seqFrom = null; keys.clear(); sitting = null; };
  const climbOutside = () => run([{ k: "walk", x: 0, z: 15.4 }, { k: "walk", x: 0, z: 5.2, y: 3.2, sp: 2.4 }, { k: "fn", f: () => { setLevel("landing"); say("You're at the library entrance. Press Enter the library."); } }]);
  const downOutside = () => run([{ k: "walk", x: 0, z: 5.0 }, { k: "walk", x: 0, z: 15.4, y: 0, sp: 2.6 }, { k: "fn", f: () => { setLevel("out"); } }]);
  const enterLib = () => run([{ k: "walk", x: 0, z: 3.0 }, { k: "face", h: Math.PI }, { k: "reach", t: 0.6 }, { k: "fn", f: () => { doorTarget = 1; setLevel("landing"); inter.visible = true; } }, { k: "wait", t: 1.0 }, { k: "walk", x: 0, z: -2.0, sp: 2.0 }, { k: "walk", x: 0, z: -4.5 }, { k: "fn", f: () => { doorTarget = 0; setLevel("hall"); say("Welcome to the Central Library. Find a shelf, Pick a book, then sit and read.", 6500); } }]);
  const exitLib = () => run([{ k: "walk", x: 0, z: -2.0 }, { k: "reach", t: 0.5 }, { k: "fn", f: () => { doorTarget = 1; } }, { k: "wait", t: 0.9 }, { k: "walk", x: 0, z: 3.2, sp: 2.0 }, { k: "fn", f: () => { doorTarget = 0; setLevel("landing"); } }, { k: "walk", x: 0, z: 4.6 }]);
  const upGallery = (sx: number) => run([{ k: "walk", x: sx * 27.5, z: -7.2 }, { k: "walk", x: sx * 27.5, z: -20.8, y: 9.2, sp: 2.3 }, { k: "fn", f: () => { setLevel("gallery"); say("Upper Gallery: Engineering, Law, Business and Psychology."); } }]);
  const downGallery = (sx: number) => run([{ k: "walk", x: sx * 27.5, z: -20.8 }, { k: "walk", x: sx * 27.5, z: -7.2, y: 3.2, sp: 2.4 }, { k: "fn", f: () => { setLevel("hall"); } }]);
  const downBase = () => run([{ k: "walk", x: 0, z: -4.8 }, { k: "fn", f: () => { base.visible = true; } }, { k: "walk", x: 0, z: -17.2, y: 0, sp: 2.4 }, { k: "fn", f: () => { setLevel("base"); say("Basement Archive: History, Literature, Philosophy and Arts."); } }]);
  const upBase = () => run([{ k: "walk", x: 0, z: -17.2 }, { k: "fn", f: () => { inter.visible = true; } }, { k: "walk", x: 0, z: -4.8, y: 3.2, sp: 2.4 }, { k: "fn", f: () => { setLevel("hall"); } }]);

  // ---------- actions available now ----------
  const d2 = (x: number, z: number, px: number, pz: number) => Math.hypot(x - px, z - pz);
  const seatNear = (): Seat | null => { let best: Seat | null = null, bd = 2.3; for (const s of seats) if (s.lv === lv) { const d = d2(pos.x, pos.z, s.x, s.z); if (d < bd) { bd = d; best = s; } } return best; };
  const actions = (): UiAction[] => {
    if (seq) return [];
    if (sitting) return [{ id: "stand", label: "Stand up" }, { id: "read", label: "Open my books" }];
    const a: UiAction[] = [];
    if (lv === "out" && pos.z < 19.5 && Math.abs(pos.x) < 8) a.push({ id: "climbOut", label: "Climb the steps" });
    if (lv === "landing") { if (pos.z > 4.0) a.push({ id: "downOut", label: "Climb down" }); if (Math.abs(pos.x) < 7) a.push({ id: "enter", label: "Enter the library" }); }
    if (lv === "hall") {
      if (pos.z > -5.0 && Math.abs(pos.x) < 6) a.push({ id: "exit", label: "Leave the library" });
      if (d2(pos.x, pos.z, 0, -4.4) < 3.4) a.push({ id: "down", label: "Go downstairs" });
      for (const sx of [-1, 1]) if (d2(pos.x, pos.z, sx * 27.5, -6.6) < 3.6) a.push({ id: sx < 0 ? "upL" : "upR", label: "Climb to the gallery" });
    }
    if (lv === "gallery") for (const sx of [-1, 1]) if (d2(pos.x, pos.z, sx * 27.5, -21.6) < 3.4) a.push({ id: sx < 0 ? "dnL" : "dnR", label: "Climb down" });
    if (lv === "base" && d2(pos.x, pos.z, 0, -17.8) < 3.4) a.push({ id: "upBase", label: "Climb up" });
    if (nearBook) { const b = lvBooks[nearBook.lv]!.recs[nearBook.i]!; const bk = makeBook(FIELDS[b.fi]!, b.sn); a.push({ id: "pick", label: `Pick: ${bk.title}` }); }
    if (seatNear()) a.push({ id: "sit", label: "Sit and read" });
    return a;
  };
  const api: LibraryApi = {
    act(id) {
      if (seq) return;
      if (id === "climbOut") climbOutside(); else if (id === "downOut") downOutside(); else if (id === "enter") enterLib(); else if (id === "exit") exitLib();
      else if (id === "down") downBase(); else if (id === "upBase") upBase(); else if (id === "upL") upGallery(-1); else if (id === "upR") upGallery(1); else if (id === "dnL") downGallery(-1); else if (id === "dnR") downGallery(1);
      else if (id === "pick" && nearBook) {
        const nb = nearBook, b = lvBooks[nb.lv]!, r = b.recs[nb.i]!; if (r.gone) return; hideRec(nb.lv, r, nb.i); bagRef.push({ f: r.fi, s: r.sn }); pickT = 0.6; nearBook = null; hl.visible = false;
        try { localStorage.setItem("campus.library.picked", JSON.stringify(bagRef)); } catch { /* ignore */ }
        const bk = makeBook(FIELDS[r.fi]!, r.sn); say(`You picked "${bk.title}". Go and sit down to read it, or pick more books.`, 6000);
      } else if (id === "sit") { const s = seatNear(); if (s) { sitting = s; pos.set(s.x, Y[lv], s.z); heading = s.yaw; say(bagRef.length ? "Open your books and start reading." : "You have no books yet. Stand up and pick one from the shelves.", 5000); } }
      else if (id === "stand") { if (sitting) { pos.x += Math.sin(sitting.yaw + Math.PI) * 0.8; pos.z += Math.cos(sitting.yaw + Math.PI) * 0.8; sitting = null; } }
    },
    setStick(x, y) { stick.x = x; stick.y = y; },
    look(dx, dy) { camYaw += dx * 0.006; camPitch = Math.max(0.04, Math.min(1.25, camPitch + dy * 0.005)); },
    key(code, down) { if (down) keys.add(code); else keys.delete(code); sprint = keys.has("ShiftLeft") || keys.has("ShiftRight"); },
    resize(w, h) { renderer.setSize(w, h, false); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix(); },
    dispose() { disposed = true; cancelAnimationFrame(raf); renderer.dispose(); },
    picked() { return bagRef.map((p) => makeBook(FIELDS[p.f]!, p.s)); },
    stats() { return { books: totalBooks, fields: FIELDS.length }; },
    debugTeleport(l, x, z, yaw, pitch) { seq = null; sitting = null; setLevel(l); pos.set(x, Y[l], z); if (yaw !== undefined) { camYaw = yaw; heading = yaw; } if (pitch !== undefined) camPitch = pitch; doorOpen = doorTarget = l === "hall" ? 0 : doorTarget; },
  };

  // ---------- frame ----------
  const camPos = new THREE.Vector3(), tgt = new THREE.Vector3();
  const ceilAt = (l: Lv, x: number, z: number) => l === "base" ? 2.65 : l === "hall" ? ((Math.abs(x) > 18 && z < -20) ? 8.6 : 24) : l === "gallery" ? 24 : 80;
  const camBlocked = (p: THREE.Vector3): boolean => {
    const fy = Y[lv];
    if (p.y > ceilAt(lv, p.x, p.z) - 0.2 || p.y < fy + 0.25) return true;
    if (lv === "hall" || lv === "gallery" || lv === "base") { if (p.x < -30.4 || p.x > 30.4 || p.z < -58.4 || p.z > -0.3) return true; }
    if (lv === "landing" && p.z < -0.3 && doorOpen < 0.5) return true;
    if (lv === "out" && p.x > -31.6 && p.x < 31.6 && p.z > -60 && p.z < 0.6 && p.y < 30) return true;
    for (const o of obs[lv]) if (p.x > o[0] && p.x < o[1] && p.z > o[2] && p.z < o[3] && p.y < fy + o[4]) return true;
    return false;
  };
  const clock = new THREE.Clock(); let raf = 0; const tmp = new THREE.Vector3();
  const frame = () => {
    raf = requestAnimationFrame(frame); const dt = Math.min(0.05, clock.getDelta()), now = performance.now();
    // movement
    let mv = 0;
    if (seq) {
      const st = seq[0];
      if (!st) { seq = null; } else if (st.k === "walk") {
        if (!seqFrom) { seqFrom = { x: pos.x, z: pos.z, y: pos.y }; seqLen = Math.hypot(st.x - pos.x, st.z - pos.z); seqT = 0; }
        const sp = st.sp ?? 2.8; seqT += dt * sp; const f = seqLen < 0.01 ? 1 : Math.min(1, seqT / seqLen);
        pos.x = seqFrom.x + (st.x - seqFrom.x) * f; pos.z = seqFrom.z + (st.z - seqFrom.z) * f; if (st.y !== undefined) pos.y = seqFrom.y + (st.y - seqFrom.y) * f;
        if (seqLen > 0.01) heading = Math.atan2(st.x - seqFrom.x, st.z - seqFrom.z); mv = sp;
        if (f >= 1) { seq.shift(); seqFrom = null; }
      } else if (st.k === "wait") { seqT += dt; if (seqT >= st.t) { seq.shift(); seqT = 0; } }
      else if (st.k === "face") { heading = st.h; seq.shift(); }
      else if (st.k === "reach") { reach = 1; seqT += dt; if (seqT >= st.t) { seq.shift(); seqT = 0; } }
      else { st.f(); seq.shift(); }
      if (seq && seq.length === 0) seq = null;
    } else if (!sitting) {
      let ix = stick.x, iy = stick.y; if (keys.has("KeyW") || keys.has("ArrowUp")) iy += 1; if (keys.has("KeyS") || keys.has("ArrowDown")) iy -= 1; if (keys.has("KeyD") || keys.has("ArrowRight")) ix += 1; if (keys.has("KeyA") || keys.has("ArrowLeft")) ix -= 1;
      const mag = Math.hypot(ix, iy);
      if (mag > 0.08) {
        const m = Math.min(1, mag); ix /= mag; iy /= mag; const fx = Math.sin(camYaw), fz = Math.cos(camYaw), rx = -Math.cos(camYaw), rz = Math.sin(camYaw);
        const dx = (fx * iy + rx * ix), dz = (fz * iy + rz * ix); const sp = (sprint ? 6.2 : 3.6) * m; mv = sp;
        const nx = pos.x + dx * sp * dt, nz = pos.z + dz * sp * dt;
        if (!blocked(lv, nx, pos.z)) pos.x = nx; if (!blocked(lv, pos.x, nz)) pos.z = nz;
        heading = Math.atan2(dx, dz);
      }
    }
    speedNow += (mv - speedNow) * Math.min(1, dt * 10);
    // avatar pose
    hero.position.set(pos.x, pos.y, pos.z);
    let dh = heading - hero.rotation.y; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); hero.rotation.y += dh * Math.min(1, dt * 12);
    walkPh += dt * (3 + speedNow * 2.2); const sw = Math.sin(walkPh) * Math.min(1, speedNow / 2.5) * 0.85;
    if (sitting) { hero.position.y = Y[lv] - 0.4; legL.rotation.x = legR.rotation.x = -Math.PI / 2; armL.rotation.x = armR.rotation.x = -0.7; torso.rotation.x = 0.05; head.rotation.x = 0.35; hero.rotation.y = sitting.yaw; }
    else { legL.rotation.x = sw; legR.rotation.x = -sw; armL.rotation.x = -sw * 0.9; armR.rotation.x = sw * 0.9; torso.rotation.x = 0; head.rotation.x = 0; hero.position.y = pos.y + Math.abs(Math.sin(walkPh)) * 0.03 * Math.min(1, speedNow / 2.5); }
    if (reach > 0) { armR.rotation.x = -1.45 + Math.sin(now / 90) * 0.06; reach = seq && seq[0]?.k === "reach" ? 1 : 0; }
    if (pickT > 0) { pickT -= dt; armR.rotation.x = -1.3; }
    if (real) {
      const r = real, emote = sitting ? "sit" : (seq && seq[0]?.k === "reach") || pickT > 0 ? "wave" : null;
      stepAnimation(r.an.model, r.st, sitting ? 0 : speedNow, emote, dt);
      r.out.p.length = 0; r.out.n.length = 0; r.out.u.length = 0;
      const info = r.an.emitTextured(r.st, { x: 0, z: 0, yaw: 0 }, r.out, r.groups); const nv = Math.min(info.tris * 3, r.pos.count);
      (r.pos.array as Float32Array).set(r.out.p.length > nv * 3 ? r.out.p.slice(0, nv * 3) : r.out.p); (r.nor.array as Float32Array).set(r.out.n.length > nv * 3 ? r.out.n.slice(0, nv * 3) : r.out.n); (r.uvs.array as Float32Array).set(r.out.u.length > nv * 2 ? r.out.u.slice(0, nv * 2) : r.out.u);
      r.pos.needsUpdate = r.nor.needsUpdate = r.uvs.needsUpdate = true; r.geo.setDrawRange(0, nv);
      const U = r.mat.uniforms; U.uSun!.value = sun.intensity * 1.7 + 0.05; U.uAmb!.value = hemi.intensity * 1.05 + lantern.intensity * 0.35; (U.uLight!.value as THREE.Vector3).copy(sun.position).normalize();
      (U.uFogC!.value as THREE.Color).copy((scene.fog as THREE.Fog).color); U.uFogN!.value = (scene.fog as THREE.Fog).near; U.uFogF!.value = (scene.fog as THREE.Fog).far;
      if (sitting) hero.position.y = Y[lv];
    }
    shadow.position.set(pos.x, Y[lv] + 0.04, pos.z); if (lv === "out" || lv === "landing") shadow.position.y = pos.y + 0.04;
    // doors
    doorOpen += (doorTarget - doorOpen) * Math.min(1, dt * 2.4); leafL.rotation.y = doorOpen * 1.75; leafR.rotation.y = -doorOpen * 1.75;
    // light/fog by place
    const indoor = lv === "hall" || lv === "gallery" || lv === "base" || (lv === "landing" && pos.z < -0.2); const tH = indoor ? 0.95 : 0.95, tS = indoor ? 0.12 : 1.0;
    hemi.intensity += (tH - hemi.intensity) * Math.min(1, dt * 3); sun.intensity += (tS - sun.intensity) * Math.min(1, dt * 3);
    lantern.intensity += ((indoor ? 1.1 : 0) - lantern.intensity) * Math.min(1, dt * 3); lantern.position.set(pos.x, pos.y + 3.2, pos.z);
    const fg = scene.fog as THREE.Fog; fg.near = indoor ? 40 : 60; fg.far = indoor ? (lv === "base" ? 70 : 160) : 220; fg.color.set(indoor ? (lv === "base" ? "#3a2c1e" : "#d9c9a8") : "#cfe6f5");
    hemi.color.set(indoor ? "#fff0d6" : "#ffffff");
    // camera
    const cy = Y[lv] === pos.y || sitting ? pos.y : pos.y; tgt.set(pos.x, cy + (sitting ? 0.9 : 1.55), pos.z);
    const dist = sitting ? 3.6 : lv === "base" ? 4.0 : indoor ? 5.0 : camDist, cp = sitting ? 0.5 : lv === "base" ? Math.min(camPitch, 0.1) : camPitch; const cx = -Math.sin(camYaw) * Math.cos(cp), cz = -Math.cos(camYaw) * Math.cos(cp), cyv = Math.sin(cp);
    const wantY = Math.min(tgt.y + cyv * dist, ceilAt(lv, tgt.x + cx * dist, tgt.z + cz * dist) - 0.35), wantX = tgt.x + cx * dist, wantZ = tgt.z + cz * dist;
    let good = 0.4; const tot = Math.hypot(wantX - tgt.x, wantY - tgt.y, wantZ - tgt.z) || 1;
    for (let i = 1; i <= 14; i++) { const f = i / 14; tmp.set(tgt.x + (wantX - tgt.x) * f, tgt.y + (wantY - tgt.y) * f, tgt.z + (wantZ - tgt.z) * f); if (camBlocked(tmp)) break; good = tot * f; }
    { const k = good / tot; camPos.set(tgt.x + (wantX - tgt.x) * k, tgt.y + (wantY - tgt.y) * k, tgt.z + (wantZ - tgt.z) * k); } camera.position.lerp(camPos, Math.min(1, dt * 14)); camera.lookAt(tgt);
    // interaction scan + ui (10Hz)
    uiT += dt;
    if (uiT > 0.1) {
      uiT = 0; nearBook = null;
      if (!seq && !sitting && (lv === "hall" || lv === "gallery" || lv === "base")) {
        const b = lvBooks[lv]!; let bd = 5.5, bi = -1; const cyv2 = Y[lv] + 1.25;
        for (let i = 0; i < b.recs.length; i++) { const r = b.recs[i]!; if (r.gone) continue; const dx = r.x - pos.x; if (dx > 2.6 || dx < -2.6) continue; const dz = r.z - pos.z; if (dz > 2.6 || dz < -2.6) continue; const dy = (r.y - cyv2) * 0.6; const d = dx * dx + dz * dz + dy * dy; if (d < bd && Math.abs(r.y - cyv2) < 1.9) { bd = d; bi = i; } }
        if (bi >= 0) nearBook = { lv, i: bi };
      }
      if (nearBook) { const r = lvBooks[nearBook.lv]!.recs[nearBook.i]!; hl.visible = true; hl.position.set(r.x, r.y, r.z); hl.scale.set(r.w * 1.35 + 0.05, r.h + 0.06, 0.5); if (Math.abs(r.z - Math.round(r.z * 100) / 100) >= 0) hl.rotation.y = 0; } else hl.visible = false;
      const ui: LibUi = { level: lv, levelName: NAMES[lv], actions: actions(), picked: bagRef.length, sitting: !!sitting, busy: !!seq, toast: now < toastUntil ? toast : "", near: nearBook ? makeBook(FIELDS[lvBooks[nearBook.lv]!.recs[nearBook.i]!.fi]!, lvBooks[nearBook.lv]!.recs[nearBook.i]!.sn).title : "" };
      const js = JSON.stringify(ui); if (js !== lastUi) { lastUi = js; onUi(ui); }
    }
    renderer.render(scene, camera);
  };
  camera.position.set(0, 4, 54); raf = requestAnimationFrame(frame);
  return api;
}
