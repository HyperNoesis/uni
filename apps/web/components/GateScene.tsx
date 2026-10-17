"use client";
import { useEffect, useRef, useState } from "react";
import { ASSET_MANIFEST, AVATAR_PRESETS, DEFAULT_AVATAR } from "@campus/domain";
import { createWorld3DRenderer } from "../lib/world-3d-render";
import { parseGlb } from "../lib/glb";
import { loadSkinnedCharacter, CHARACTER_SETS } from "../lib/skinned-character";
import { lagosSky, type LagosSky } from "../lib/lagos-time";

/** The real Grand Gate, rendered live by the game's own renderer, lit by the real Lagos sun. Visual only: no networking, no input to the world. */
export function GateScene({ dim = false, onReady }: { dim?: boolean; onReady?: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [ok, setOk] = useState(true);
  useEffect(() => {
    const canvas = ref.current!; let raf = 0, dead = false, r: ReturnType<typeof createWorld3DRenderer> | null = null;
    const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ptr = { x: 0, y: 0 };
    const onMove = (e: PointerEvent) => { ptr.x = e.clientX / innerWidth - 0.5; ptr.y = e.clientY / innerHeight - 0.5; };
    addEventListener("pointermove", onMove);
    (async () => {
      try {
        r = createWorld3DRenderer(canvas) as ReturnType<typeof createWorld3DRenderer>;
        const R = r as any, ctx = document.createElement("canvas").getContext("2d")!;
        try { const entries = await Promise.all(Object.entries(CHARACTER_SETS).map(async ([kind, set]) => { const [model, lod] = await Promise.all([loadSkinnedCharacter(set.url), loadSkinnedCharacter(set.lod)]); return [kind, { model, lod }] as const; })); const sets = Object.fromEntries(entries.filter(([, v]) => v.model)); if (Object.keys(sets).length) await R.setSkinnedCharacters(sets); } catch { /* boxes are fine */ }
        const want = (ASSET_MANIFEST as any).assets.filter((e: any) => e.zones === "all" || (Array.isArray(e.zones) && e.zones.includes("gate_road")));
        await Promise.all(want.map(async (e: any) => { try { const res = await fetch(e.url); if (!res.ok) return; R.registerMesh(e.id, parseGlb(await res.arrayBuffer(), { maxTriangles: e.maxTriangles ?? 6000 }), e.slot, e); } catch { /* slot keeps its code-drawn fallback */ } }));
        if (dead) return; onReady?.();
        let first = true, sky: LagosSky = lagosSky(), lastSky = 0; const t0 = performance.now(), mobile = innerWidth < 700;
        const walkers = [0, 1, 2, 3, 4, 5].map((i) => ({ i, x: 53 + i * 2.8, z: 146 - ((i * 7) % 5), v: 0.9 + (i % 3) * 0.25, dir: i % 2 ? -1 : 1 }));
        const frame = (now: number) => {
          if (dead) return; const t = (now - t0) / 1000;
          if (now - lastSky > 1000) { sky = lagosSky(); lastSky = now; }
          const u = reduce ? 0 : (Math.sin(t / 14) + 1) / 2, eye = [55 + u * 5 + ptr.x * 2.2, 5.4 + u * 1.0 - ptr.y * 0.6, (mobile ? 153.5 : 152) - u * 3], target = [mobile ? 60 : 64 + ptr.x * 1.5, 6.4, 128];
          const ents = walkers.map((w) => { const zz = 150 - ((t * w.v + w.i * 9) % 22); return { id: "w" + w.i, name: "", x: 56 + (w.i % 3) * 4 + Math.sin(w.i) * 1.5, y: zz, avatar: AVATAR_PRESETS[(w.i + 1) % AVATAR_PRESETS.length]!.avatar ?? DEFAULT_AVATAR, tagColor: "#2f6bff", npc: true, vx: 0, vy: -w.v, moving: true }; });
          R.render({ width: canvas.clientWidth || innerWidth, height: canvas.clientHeight || innerHeight, time: t, camX: 60, camY: 138, camMode: "free", camEye: eye, camTarget: target, camFov: mobile ? 1.35 : 0.92, camHeading: Math.PI, entities: ents, meId: "none", quality: mobile ? "low" : "medium", lighting: "day", nightBlend: sky.night, warmth: sky.warmth, sunElevation: sky.elevation, activeHuntPointId: null, gateOpen: 0, snapLight: first }, ctx); first = false;
          if (!reduce || t < 1.2) raf = requestAnimationFrame(frame);
        };
        raf = requestAnimationFrame(frame);
      } catch { setOk(false); }
    })();
    return () => { dead = true; cancelAnimationFrame(raf); removeEventListener("pointermove", onMove); try { (r as any)?.destroy?.(); } catch { /* ignore */ } };
  }, [onReady]);
  return <canvas ref={ref} className={"gate-scene" + (dim ? " dim" : "")} aria-hidden="true" style={{ display: ok ? "block" : "none" }} />;
}
