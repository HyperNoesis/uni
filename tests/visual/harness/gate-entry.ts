// Gate scene harness: drives the REAL renderer + the REAL gate controller through scripted moments and lets run.mjs screenshot each. Test-only.
import { createWorld3DRenderer } from "../../../apps/web/lib/world-3d-render";
import { loadSkinnedCharacter, CHARACTER_SETS } from "../../../apps/web/lib/skinned-character";
import manifest from "../../../packages/domain/src/world-data/assets.json";
import { parseGlb } from "../../../apps/web/lib/glb";
import { createGateSecurity } from "../../../apps/web/lib/gate-security";
import { gateEntities, gestureView } from "../../../apps/web/lib/gate-entities";
import { DEFAULT_AVATAR, SPAWN, GATE } from "@campus/domain";

type Spec = { name: string; reset?: boolean; until?: { phase: string; pt?: number }; tap?: boolean; walkTo?: [number, number]; cam?: { eye?: number[]; target?: number[]; fov: number; follow?: "lead" | "car" | "wicket" | "player" | "mid"; off?: number[]; look?: number[] }; maxT?: number; hold?: number };
const mulberry = (a: number) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const S: any = { };
(window as any).__spawn = SPAWN;
(window as any).__run = async (cfg: any) => {
  const canvas = document.getElementById("c") as HTMLCanvasElement, labels = document.getElementById("l") as HTMLCanvasElement;
  canvas.style.width = labels.style.width = cfg.width + "px"; canvas.style.height = labels.style.height = cfg.height + "px"; labels.width = cfg.width; labels.height = cfg.height;
  console.log('run: start'); const r = createWorld3DRenderer(canvas) as any; S.r = r; S.cfg = cfg; S.ctx = labels.getContext("2d");
  const entries = await Promise.all(Object.entries(CHARACTER_SETS).map(async ([kind, set]: any) => { const [model, lod] = await Promise.all([loadSkinnedCharacter(set.url), loadSkinnedCharacter(set.lod)]); return [kind, { model, lod }] as const; }));
  await r.setSkinnedCharacters(Object.fromEntries(entries.filter(([, v]) => v.model)));
  console.log('run: characters loaded'); const failed: string[] = [];
  for (const e of (manifest as any).assets) { try { const res = await fetch(e.url); if (!res.ok) throw new Error("HTTP " + res.status); r.registerMesh(e.id, parseGlb(await res.arrayBuffer(), { maxTriangles: e.maxTriangles ?? 6000 }), e.slot, e); } catch (err) { failed.push(e.id); } }
  console.log('run: assets registered, failed=' + failed.length);
  await new Promise((res) => setTimeout(res, 1500));
  reset();
  return { failed, sets: entries.map(([k, v]) => k + ":" + !!v.model) };
};
function reset() {
  S.t = 0; S.px = SPAWN.x; S.py = SPAWN.y; S.hd = Math.PI; S.gs = createGateSecurity({ rng: mulberry(S.cfg.seed ?? 7) }); S.sn = S.gs.snapshot();
}
const me = () => ({ id: "me", name: "You", x: S.px, y: S.py, avatar: { ...DEFAULT_AVATAR, skin: "#8a5a3b", outfit: "#2f6bff", hair: "fade" }, tagColor: "#2f6bff", ...gestureView(S.sn.playerGesture) });
function frame(spec: Spec, dt: number) {
  const ents: any[] = [...gateEntities(S.sn), me()];
  if (spec.cam?.follow === "mid") { // perpendicular side view of the player and the lead (their hands meet in the middle)
    const l = S.sn.guards.find((g: any) => g.id === S.sn.leadId) ?? S.sn.guards[0], mx = (S.px + l.x) / 2, mz = (S.py + l.y) / 2, ax = l.x - S.px, az = l.y - S.py, al = Math.hypot(ax, az) || 1;
    let px = az / al, pz = -ax / al; if (pz < 0) { px = -px; pz = -pz; } const o = spec.cam.off ?? [2.6, 1.45, 0], lk = spec.cam.look ?? [0, 1.25, 0];
    spec.cam.eye = [mx + px * o[0], o[1], mz + pz * o[0]]; spec.cam.target = [mx + lk[0], lk[1], mz + lk[2]];
  } else if (spec.cam?.follow) { const c = spec.cam, f = c.follow === "lead" ? S.sn.guards.find((g: any) => g.id === S.sn.leadId) ?? S.sn.guards[0] : c.follow === "car" ? { x: S.sn.car.x, y: S.sn.car.y } : c.follow === "wicket" ? { x: 68.8, y: 132 } : { x: S.px, y: S.py }, o = c.off ?? [0, 1.6, 3]; c.eye = [f.x + o[0], o[1], f.y + o[2]]; const l = c.look ?? [0, 1.3, 0]; c.target = [f.x + l[0], l[1], f.y + l[2]]; }
  const free = spec.cam ? { camMode: "free", camEye: spec.cam.eye, camTarget: spec.cam.target, camFov: (spec.cam.fov * Math.PI) / 180 } : { camMode: "chase" };
  S.t += dt;
  return S.r.render({ width: S.cfg.width, height: S.cfg.height, time: S.t, camX: S.px, camY: S.py, ...free, camHeading: S.hd, camLook: 0, camBob: 0, camYaw: 0, camPitch: 0, zoom: 1, meId: "me", entities: ents, quality: S.cfg.quality ?? "medium", lighting: "day", activeHuntPointId: null, gateOpen: 1,
    gate: { wicket: S.sn.wicket, pass: S.sn.pass, car: S.sn.car, lead: S.sn.leadId, quiet: !S.sn.passed || S.sn.lock }, passSkin: "#8a5a3b", passOutfit: "#2f6bff" }, S.ctx);
}
function step(dt: number, walkTo: [number, number]) {
  S.gs.update(dt, { x: S.px, y: S.py }); S.sn = S.gs.snapshot();
  if (S.sn.faceHeading != null) S.hd += Math.atan2(Math.sin(S.sn.faceHeading - S.hd), Math.cos(S.sn.faceHeading - S.hd)) * Math.min(1, dt * 6);
  if (!S.sn.lock) { const dx = walkTo[0] - S.px, dy = walkTo[1] - S.py, d = Math.hypot(dx, dy); if (d > 0.1) { const v = Math.min(d, 3.4 * dt); S.px += (dx / d) * v; S.py += (dy / d) * v; S.hd = Math.atan2(dx, dy); } }
}
(window as any).__shot = (spec: Spec) => {
  if (spec.reset) reset();
  const dt = 1 / 30, target: [number, number] = spec.walkTo ?? [68.2, 124];
  let tapped = false; const maxT = spec.maxT ?? 40; let tt = 0; const u = spec.until;
  const met = () => !u || (S.sn.phase === u.phase && (S.gs as any).phaseTime?.() >= (u.pt ?? 0));
  // phase-local time is not exported: track it here
  let lastPhase = S.sn.phase, pt = 0;
  while (u && tt < maxT) {
    step(dt, target); tt += dt; if (S.sn.phase !== lastPhase) { lastPhase = S.sn.phase; pt = 0; } else pt += dt;
    if (spec.tap && S.sn.tapReady && pt > 0.9 && !tapped) { S.gs.tapPass(); tapped = true; }
    if (S.sn.phase === u.phase && pt >= (u.pt ?? 0)) break;
  }
  void met;
  console.log('shot ' + spec.name + ' sim done phase=' + S.sn.phase); let st: any = null; const n = S.cfg.frames ?? 6;
  for (let i = 0; i < n; i++) { if (u && !spec.hold) { /* freeze sim: render the same moment */ } else if (spec.hold) step(dt, target); st = frame(spec, i === 0 ? 0.3 : dt); console.log('  frame ' + i); }
  const ld = S.sn.guards.find((g: any) => g.id === S.sn.leadId); return { lead: ld ? [+ld.x.toFixed(2), +ld.y.toFixed(2), +ld.face.toFixed(2), ld.gesture?.kind ?? null] : null, ring: S.sn.guards.filter((g: any) => g.kit === 'guard').map((g: any) => g.id + ':' + g.x.toFixed(1) + ',' + g.y.toFixed(1)), phase: S.sn.phase, at: [+S.px.toFixed(2), +S.py.toFixed(2)], guards: S.sn.guards.length, surround: S.sn.surround, wicket: +S.sn.wicket.toFixed(2), pass: S.sn.pass?.state ?? null, say: S.sn.guards.map((g: any) => g.say).filter(Boolean), drawn: st?.drawn, probes: st?.probes ?? null, tris: st?.tris, calls: st?.calls };
};
void GATE;
