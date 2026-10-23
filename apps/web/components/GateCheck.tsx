"use client";
import { useEffect, useRef, useState } from "react";
import { CAMPUSES, type PlayerProfile } from "@campus/domain";
import logo from "../lib/brand-logo.json";

export type GateState = { gx: number; gy: number; open: number };
export const GATE_POST = { x: 54.8, y: 72.6 };
export const passNumber = (id: string) => "CMP-" + id.replace(/[^a-z0-9]/gi, "").slice(0, 8).toUpperCase().padEnd(8, "0");
type Stage = "intro" | "approach" | "inspect" | "opening";
const ease = (t: number) => t * t * (3 - 2 * t);

/** Main Gate entry: the officer walks to the player, checks the player's campus pass, then the gates swing open.
 *  Ceremonial and client-side (no server enforcement yet): movement is frozen by the page while this is mounted. */
export function GateCheck({ profile, player, gate, onDone }: { profile: PlayerProfile; player: { current: { x: number; y: number } }; gate: { current: GateState }; onDone: () => void }) {
  const [stage, setStage] = useState<Stage>("intro");
  const t0 = useRef(0);
  useEffect(() => {
    if (stage === "intro") return;
    t0.current = performance.now();
    const dur = stage === "approach" ? 2200 : stage === "inspect" ? 1800 : 2600;
    let raf = 0;
    const tick = () => {
      const t = Math.min(1, (performance.now() - t0.current) / dur), g = gate.current;
      const tx = player.current.x - 1.1, ty = player.current.y + .1;
      if (stage === "approach") { g.gx = GATE_POST.x + (tx - GATE_POST.x) * ease(t); g.gy = GATE_POST.y + (ty - GATE_POST.y) * ease(t); }
      else if (stage === "inspect") { g.gx = tx; g.gy = ty; }
      else { g.open = ease(t); g.gx = tx + (GATE_POST.x - tx) * ease(t); g.gy = ty + (GATE_POST.y - ty) * ease(t); }
      if (t >= 1) { if (stage === "approach") setStage("inspect"); else if (stage === "inspect") setStage("opening"); else { g.open = 1; onDone(); return; } return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [stage, gate, player, onDone]);
  const campus = CAMPUSES[profile.campus]?.name ?? "CAMPUS";
  return (
    <div className="gate-overlay" role="dialog" aria-label="Campus gate check">
      <div className="gate-card">
        <small className="gate-eyebrow">Grand Gate · Security</small>
        {stage === "intro" && <><h3>Welcome, {profile.displayName}</h3><p>Entry needs your Campus Pass. An officer will come to you.</p>
          <button className="btn big accent" onClick={() => setStage("approach")}>Show my pass</button></>}
        {stage === "approach" && <><h3>Officer approaching…</h3><p>Hold your pass ready.</p></>}
        {(stage === "inspect" || stage === "opening") && <>
          <PassCard profile={profile} campus={campus} verified={stage === "opening"} />
          <p className="gate-line">{stage === "inspect" ? "Checking pass…" : "Pass verified. Opening the gate. Enjoy campus!"}</p></>}
      </div>
    </div>
  );
}

export function BrandMark({ size = 28 }: { size?: number }) {
  const b = logo.glyphBounds, L = logo.layers as Record<string, { color: string; path: string }>;
  return (<svg width={size} height={size} viewBox={`${b.x0} ${-b.y1} ${b.x1 - b.x0} ${b.y1 - b.y0}`} aria-hidden="true" style={{ flex: "none" }}><g transform="scale(1,-1)">{["glyphWhite", "glyphBlue"].map((k) => L[k] && <path key={k} d={L[k].path} fill={L[k].color} />)}</g></svg>);
}

export function PassCard({ profile, campus, verified = true }: { profile: PlayerProfile; campus?: string; verified?: boolean }) {
  const c = campus ?? CAMPUSES[profile.campus]?.name ?? "CAMPUS";
  return (
    <div className={`pass ${verified ? "ok" : ""}`} style={{ ["--pass" as string]: CAMPUSES[profile.campus]?.color ?? "#2f6bff" }}>
      <div className="pass-top"><b style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><BrandMark size={18} />CAMPUS PASS</b><span>{verified ? "VERIFIED" : "CHECKING"}</span></div>
      <div className="pass-body"><div className="pass-photo" style={{ background: profile.avatar.skin }} aria-hidden="true"><i style={{ background: profile.avatar.outfit }} /></div>
        <div><h4>{profile.displayName}</h4><p>{c}</p><code>{passNumber(profile.id)}</code></div></div>
      <div className="pass-bar" aria-hidden="true">{Array.from({ length: 28 }, (_, i) => <i key={i} style={{ width: 1 + ((i * 7) % 3) }} />)}</div>
    </div>
  );
}
