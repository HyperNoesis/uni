// Browser harness entry: drives the REAL production renderer (+ optional skinned character) in headless Chromium. Test-only.
import { createWorld3DRenderer } from "../../../apps/web/lib/world-3d-render";
import { loadSkinnedCharacter } from "../../../apps/web/lib/skinned-character";
import manifest from "../../../packages/domain/src/world-data/assets.json";
import { parseGlb } from "../../../apps/web/lib/glb";
import { DEFAULT_AVATAR, SPAWN, AVATAR_PRESETS } from "@campus/domain";

type Cfg = { width: number; height: number; quality: "low" | "medium" | "high"; character: boolean; frames: number; dt?: number; assets?: "manifest"; override?: Record<string, { url: string; size?: { w: number; h: number; d: number } }>; me: { x: number; y: number; heading: number }; camMode?: string; zoom?: number; lod?: boolean; walkers?: number; extras?: { x: number; y: number; vx: number; vy: number; emote?: string; preset?: number }[] };
(window as any).__spawn = SPAWN;
(window as any).__run = async (cfg: Cfg) => {
  if ((cfg as any).nobevel) (globalThis as any).__campusBevelMin = 99;
  const canvas = document.getElementById("c") as HTMLCanvasElement, labels = document.getElementById("l") as HTMLCanvasElement;
  canvas.style.width = labels.style.width = cfg.width + "px"; canvas.style.height = labels.style.height = cfg.height + "px";
  labels.width = cfg.width; labels.height = cfg.height;
  const r = createWorld3DRenderer(canvas) as any;
  let model = null as any;
  if (cfg.character) { model = await loadSkinnedCharacter("/assets/characters/campus_body.glb"); if (!model) throw new Error("character failed to load"); const lod = cfg.lod ? await loadSkinnedCharacter("/assets/characters/campus_body_lod.glb") : null; r.setSkinnedCharacter(model, lod); }
  const loaded: string[] = [], failed: string[] = [];
  if (cfg.assets === "manifest") for (let e of (manifest as any).assets) {
    if (String(e.slot).startsWith("avatar:") && (cfg as any).avatarParts === false) continue; // avatar part props (hair/face/accessory) load like the live game unless explicitly disabled
    const ov = cfg.override?.[e.id], url = ov?.url ?? e.url; if (ov?.size) e = { ...e, size: ov.size };
    try { const res = await fetch(url); if (!res.ok) throw new Error("HTTP " + res.status); r.registerMesh(e.id, parseGlb(await res.arrayBuffer(), { maxTriangles: e.maxTriangles ?? 6000 }), e.slot, e); loaded.push(e.id); } catch (err) { failed.push(e.id + ": " + (err as Error).message); }
  }
  const ctx = labels.getContext("2d")!;
  const dt = cfg.dt ?? 1 / 60; let t = 0, last: any = null; const times: number[] = [];
  const mk = (id: string, name: string, x: number, y: number, preset: number, emote?: string) => ({ id, name, x, y, avatar: AVATAR_PRESETS[preset % AVATAR_PRESETS.length]!.avatar ?? DEFAULT_AVATAR, tagColor: "#2f6bff", ...(emote ? { emote } : {}) });
  await new Promise((res) => setTimeout(res, 1500)); // let the async detail textures finish loading
  for (let f = 0; f < cfg.frames; f++) {
    t += dt;
    const ents: any[] = [mk("me", "You", cfg.me.x, cfg.me.y, 0)];
    (cfg.extras ?? []).forEach((e, i) => { const k = ((t * 1) % 6); ents.push(mk("p" + i, "Player " + (i + 1), e.x + e.vx * ((t) % 6) , e.y + e.vy * ((t) % 6), e.preset ?? i + 1, e.emote)); void k; });
    const t0 = performance.now();
    last = r.render({ width: cfg.width, height: cfg.height, time: t, camX: cfg.me.x, camY: cfg.me.y, camMode: cfg.camMode ?? "chase", camHeading: cfg.me.heading, camLook: 0, camBob: 0, camYaw: 0, camPitch: 0, zoom: cfg.zoom ?? 1, meId: "me", entities: ents, quality: cfg.quality, lighting: "day", activeHuntPointId: null, gateOpen: 0 }, ctx);
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  return { stats: { gov: last.gov, drawn: last.drawn, calls: last.calls, tris: last.tris, culled: last.culled, topTris: Object.entries(last.byShape || {}).filter(([k]) => k.startsWith("t:")).sort((a, b) => b[1] - a[1]).slice(0, 60) }, cpuMs: { p50: times[Math.floor(times.length / 2)], p95: times[Math.floor(times.length * .95)] }, assets: { loaded: loaded.length, failed }, model: model ? { tris: model.triangles, joints: model.jointCount } : null };
};
