"use client";
import { useEffect, useRef, useState } from "react";
import type { Avatar } from "@campus/domain";
import { startAvatarStage, STAGE_POSES, STAGE_SETTINGS } from "../lib/avatar-stage";
import { drawAvatar } from "../lib/avatar";

/** Front-view "lobby" preview of the player's own character, walking in place. Falls back to the 2D portrait when WebGL is unavailable. */
export function AvatarStage({ value }: { value: Avatar }) {
  const canvas = useRef<HTMLCanvasElement>(null), flat = useRef<HTMLCanvasElement>(null), stage = useRef<any>(null), latest = useRef(value);
  const [pose, setPose] = useState("walk"), [setting, setSetting] = useState("lobby"), [mode, setMode] = useState<"loading" | "3d" | "2d">("loading");
  latest.current = value;
  useEffect(() => {
    let dead = false, s: any = null;
    const c = canvas.current;
    if (!c) return;
    startAvatarStage(c, { avatar: latest.current }).then((st: any) => { if (dead) { st?.destroy(); return; } s = st; stage.current = st; setMode(st ? "3d" : "2d"); }).catch(() => !dead && setMode("2d"));
    return () => { dead = true; s?.destroy(); stage.current = null; };
  }, []);
  useEffect(() => { stage.current?.setAvatar(value); }, [value, mode]);
  useEffect(() => { stage.current?.setPose(pose); }, [pose, mode]);
  useEffect(() => { stage.current?.setSetting(setting); }, [setting, mode]);
  useEffect(() => {
    if (mode !== "2d") return;
    const c = flat.current, ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = 160 * dpr; c.height = 180 * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, 160, 180); drawAvatar(ctx, value, 80, 160, 3.2);
  }, [value, mode]);
  const set = STAGE_SETTINGS.find((s) => s.id === setting) ?? STAGE_SETTINGS[0]!;
  return (
    <div className="card stage" style={{ background: `linear-gradient(180deg, ${set.sky[0]}, ${set.sky[1]})`, position: "relative", overflow: "hidden", padding: 0 }}>
      <div aria-hidden style={{ position: "absolute", inset: 0, background: `radial-gradient(60% 55% at 50% 55%, ${set.glow}, transparent 70%)` }} />
      <canvas ref={canvas} aria-label="Your character, front view" style={{ position: "relative", width: "100%", height: 340, display: mode === "2d" ? "none" : "block", touchAction: "pan-y", cursor: "grab" }} />
      {mode === "2d" && <canvas ref={flat} aria-label="Avatar preview" style={{ position: "relative", display: "block", margin: "0 auto", height: 340 }} />}
      {mode === "3d" && <span style={{ position: "absolute", left: 10, top: 8, fontSize: 11, color: "rgba(255,255,255,.7)" }}>Drag to turn</span>}
      <div style={{ position: "relative", display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center", padding: "8px 8px 4px" }} role="group" aria-label="Pose">
        {STAGE_POSES.map((p) => <button key={p.id} type="button" className="chip" aria-pressed={pose === p.id} onClick={() => setPose(p.id)}>{p.label}</button>)}
      </div>
      <div style={{ position: "relative", display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center", padding: "0 8px 10px" }} role="group" aria-label="Setting">
        {STAGE_SETTINGS.map((s) => <button key={s.id} type="button" className="chip" aria-pressed={setting === s.id} onClick={() => setSetting(s.id)}>{s.label}</button>)}
      </div>
    </div>
  );
}
