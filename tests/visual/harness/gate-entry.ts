// TEST-ONLY browser entry for the Grand Gate: real renderer + real skinned bodies + gate kit + guards. Cfg is JSON from run.mjs.
import { createWorld3DRenderer } from "../../../apps/web/lib/world-3d-render";
import { loadSkinnedCharacter, CHARACTER_SETS } from "../../../apps/web/lib/skinned-character";
import manifest from "../../../packages/domain/src/world-data/assets.json";
import { parseGlb } from "../../../apps/web/lib/glb";
import { DEFAULT_AVATAR, ZONES, ZONE_DEFS, BUILDINGS } from "@campus/domain";
import { createGateSecurity } from "../../../apps/web/lib/gate-security";
import { gateEntities, gestureView } from "../../../apps/web/lib/gate-entities";
import kit from "../../../docs/evidence/grand-gate-kit.json";
import placements from "../../../docs/evidence/grand-gate-placements.json";

(window as any).__run = async (cfg: any) => {
  const canvas = document.getElementById("c") as HTMLCanvasElement, labels = document.getElementById("l") as HTMLCanvasElement;
  canvas.style.width = labels.style.width = cfg.width + "px"; canvas.style.height = labels.style.height = cfg.height + "px"; labels.width = cfg.width; labels.height = cfg.height;
  // Mirror the user's local zone edits (not in the zip): Grand Gate v2.1 decor in gate_road, and the four buildings removed from the gate lane.
  const gd: any = (ZONE_DEFS as any[]).find((z) => z.id === "gate_road"), gz: any = (ZONES as any[]).find((z) => z.id === "gate_road");
  const drop = new Set(["hostel_19_village_common_roo", "hostel_20_village_porter_s_l", "market_15_print_copy_centre", "market_16_bank_branch"]);
  for (const z of ZONE_DEFS as any[]) z.buildings = z.buildings.filter((b: any) => !drop.has(b.id));
  for (let i = (BUILDINGS as any[]).length - 1; i >= 0; i--) if (drop.has((BUILDINGS as any[])[i].id)) (BUILDINGS as any[]).splice(i, 1);
  if (cfg.kit !== false) { const dec = (placements as any).newGateAreaPlacements.map((p: any) => ({ model: p.model, x: p.x, y: p.y, ...(p.rot ? { rot: p.rot } : {}) })); gd.decor = dec; if (gz) gz.decor = dec; }
  const r = createWorld3DRenderer(canvas) as any;
  const sets: any = {};
  for (const [kind, set] of Object.entries(CHARACTER_SETS)) { const [model, lod] = await Promise.all([loadSkinnedCharacter((set as any).url), loadSkinnedCharacter((set as any).lod)]); if (model) sets[kind] = { model, lod }; }
  if (cfg.character !== false) await r.setSkinnedCharacters(sets);
  const failed: string[] = [], list: any[] = [...(manifest as any).assets];
  for (const k of (kit as any).report) list.push({ id: k.name, url: `/assets/gate/${k.name}.glb`, slot: `decor:${k.name}`, zones: ["gate_road"], maxBytes: k.bytes + 1000, maxTriangles: k.tris + 50, size: k.size, yOffset: k.yOffset });
  list.push({ id: "gate_pier", url: "/assets/gate/gate_pier.glb", slot: "decor:gate_pier", zones: ["gate_road"], maxBytes: 200000, maxTriangles: 2000, size: { w: 3.74, h: 6.6, d: 5.32 }, yOffset: 0 });
  for (const e of list) { try { const res = await fetch(e.url); if (!res.ok) throw new Error("HTTP " + res.status); r.registerMesh(e.id, parseGlb(await res.arrayBuffer(), { maxTriangles: e.maxTriangles ?? 6000 }), e.slot, e); } catch (err: any) { failed.push(e.id + ":" + err.message); } }
  await new Promise((res) => setTimeout(res, 1200));
  const ctx = labels.getContext("2d")!, av = cfg.avatar ?? DEFAULT_AVATAR;
  const gs = createGateSecurity({ rng: () => 0.4, player: { name: "Daniel", campus: "Unity Heights" } });
  let t = 0, last: any = null, x = cfg.me.x, y = cfg.me.y; const dt = cfg.dt ?? 1 / 30;
  const shots: Record<string, string> = {};
  for (let f = 0; f < cfg.frames; f++) {
    t += dt; const w = cfg.walk; if (w) { x += (w.vx ?? 0) * dt; y += (w.vy ?? 0) * dt; }
    gs.update(dt, { x, y }); const sn = gs.snapshot();
    const ents: any[] = [{ id: "me", name: "Daniel", x, y, avatar: av, tagColor: "#2f6bff", ...gestureView(sn.playerGesture) }, ...(cfg.guards === false ? [] : gateEntities(sn))];
    last = r.render({ width: cfg.width, height: cfg.height, time: t, camX: x, camY: y, camMode: cfg.camMode ?? "chase", camHeading: cfg.me.heading, camLook: cfg.look ?? 0, camBob: 0, camYaw: cfg.yaw ?? 0, camPitch: 0, zoom: cfg.zoom ?? 1, meId: "me", entities: ents, quality: cfg.quality ?? "medium", lighting: "day", gateOpen: 1, ...(cfg.camEye ? { camEye: cfg.camEye, camTarget: cfg.camTarget, camFov: cfg.camFov ?? 1 } : {}), gate: { wicket: sn.wicket, pass: sn.pass, car: sn.car, quiet: sn.lock } }, ctx);
  }
  return { stats: { drawn: last.drawn, culled: last.culled, calls: last.calls, tris: last.tris, gov: last.gov }, failed, phase: gs.phase };
};
