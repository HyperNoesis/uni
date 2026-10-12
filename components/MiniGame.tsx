"use client";
// Full-screen practice minigames: Beat Stage (rhythm) and Delivery Dash. Engines: lib/minigames.ts. Styles: .sg-* in phase6.css.
import { useEffect, useRef, useState } from "react";
import { DELIVERY, RHYTHM, deliveryStep, newDelivery, newRhythm, rhythmGrade, rhythmHit, rhythmStep, type DeliveryGame, type Mini, type RhythmGame } from "../lib/minigames";

const LANE_KEYS = [["d", "arrowleft"], ["f", "arrowdown"], ["j", "arrowup"], ["k", "arrowright"]];
const LANE_COL = ["#ff5d8f", "#ffb43a", "#3ad6c5", "#6a8cff"];
const TITLE: Record<Mini, string> = { rhythm: "Beat Stage", delivery: "Delivery Dash" };
const HELP: Record<Mini, string[]> = {
  rhythm: ["Hit notes as they reach the line", "Keys: D F J K (or arrow keys)", "Touch: tap the four lane buttons", "Perfect timing builds your combo"],
  delivery: ["Pick up orders, deliver to the glowing spot", "Move: WASD / arrows · Sprint: Shift", "Touch: stick + SPRINT", "Dodge students; each delivery adds time"],
};

export default function MiniGame({ kind, onExit }: { kind: Mini; onExit: () => void }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const R = useRef<RhythmGame>(newRhythm(Date.now() & 0xffff));
  const D = useRef<DeliveryGame>(newDelivery(Date.now() & 0xffff));
  const keys = useRef(new Set<string>()); const stick = useRef({ x: 0, y: 0 }); const paused = useRef(false); const started = useRef(false);
  const [ui, setUi] = useState({ score: 0, combo: 0, t: 0, msg: "", over: false, grade: "", extra: "", paused: false });
  const [help, setHelp] = useState(true);
  const lastJudge = useRef("");

  const hit = (lane: number) => { if (!started.current || paused.current) return; lastJudge.current = rhythmHit(R.current, lane); };
  const restart = () => { R.current = newRhythm(Date.now() & 0xffff); D.current = newDelivery(Date.now() & 0xffff); paused.current = false; lastJudge.current = ""; };

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
      if (e.repeat) return;
      started.current = true; setHelp(false);
      if (k === "escape" || k === "p") { paused.current = !paused.current; setUi((u) => ({ ...u, paused: paused.current })); return; }
      if (kind === "rhythm") { const lane = LANE_KEYS.findIndex((l) => l.includes(k)); if (lane >= 0) hit(lane); } else keys.current.add(k);
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    const vis = () => { if (document.hidden) { paused.current = true; setUi((u) => ({ ...u, paused: true })); } };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up); document.addEventListener("visibilitychange", vis);
    let raf = 0, last = performance.now(), acc = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame); const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (started.current && !paused.current) {
        if (kind === "rhythm") rhythmStep(R.current, dt);
        else { const k = keys.current; deliveryStep(D.current, (k.has("d") || k.has("arrowright") ? 1 : 0) - (k.has("a") || k.has("arrowleft") ? 1 : 0) + stick.current.x, (k.has("s") || k.has("arrowdown") ? 1 : 0) - (k.has("w") || k.has("arrowup") ? 1 : 0) + stick.current.y, k.has("shift") || k.has("sprint"), dt); }
      }
      if (kind === "rhythm") drawRhythm(cv.current, R.current, lastJudge.current); else drawDelivery(cv.current, D.current);
      acc += dt;
      if (acc > 0.1) {
        acc = 0;
        if (kind === "rhythm") { const g = R.current; setUi({ score: Math.round(g.score), combo: g.combo, t: Math.max(0, Math.ceil(RHYTHM.duration - g.time)), msg: lastJudge.current === "none" ? "" : lastJudge.current.toUpperCase(), over: g.over, grade: g.over ? rhythmGrade(g) : "", extra: `${g.perfect} perfect · ${g.good} good · ${g.miss} miss · best combo ${g.best}`, paused: paused.current }); }
        else { const g = D.current; setUi({ score: g.score, combo: g.delivered, t: Math.ceil(g.t), msg: g.msg, over: g.over, grade: "", extra: `${g.delivered} orders delivered`, paused: paused.current }); }
      }
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); document.removeEventListener("visibilitychange", vis); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onStick = (e: React.PointerEvent<HTMLDivElement>) => { const r = e.currentTarget.getBoundingClientRect(); const dx = (e.clientX - r.left - r.width / 2) / (r.width / 2), dy = (e.clientY - r.top - r.height / 2) / (r.height / 2); const m = Math.hypot(dx, dy) || 1; stick.current = { x: m > 1 ? dx / m : dx, y: m > 1 ? dy / m : dy }; };

  return (
    <div className="sg-root" role="dialog" aria-label={TITLE[kind]}>
      <canvas ref={cv} className="sg-canvas" />
      <div className="sg-top">
        <button className="btn ghost" onClick={onExit}>✕ Leave</button>
        <div className="sg-score"><b>{ui.score}</b><span>{kind === "rhythm" ? `x${ui.combo}` : `📦 ${ui.combo}`}</span><b>{ui.t}s</b></div>
        <button className="btn ghost" onClick={() => { paused.current = !paused.current; setUi((u) => ({ ...u, paused: paused.current })); }}>{ui.paused ? "▶" : "⏸"}</button>
      </div>
      {ui.msg && !ui.over && <div className="sg-msg" style={{ fontSize: 30 }}>{ui.msg}</div>}
      {help && <div className="sg-help" onClick={() => { started.current = true; setHelp(false); }}><h3>{TITLE[kind]}</h3>{HELP[kind].map((l) => <p key={l}>{l}</p>)}<button className="btn accent">Start</button></div>}
      {ui.paused && !ui.over && <div className="sg-help"><h3>Paused</h3><button className="btn accent" onClick={() => { paused.current = false; setUi((u) => ({ ...u, paused: false })); }}>Resume</button><button className="btn" onClick={onExit}>Leave game</button></div>}
      {ui.over && <div className="sg-help"><h3>{kind === "rhythm" ? `Grade ${ui.grade}` : ui.msg}</h3><p>Score {ui.score}</p><p>{ui.extra}</p><button className="btn accent" onClick={restart}>Play again</button><button className="btn" onClick={onExit}>Back to campus</button></div>}
      <div className="sg-touch">
        {kind === "rhythm" ? (
          <div style={{ display: "flex", gap: 8, width: "100%", pointerEvents: "auto" }}>{[0, 1, 2, 3].map((i) => <button key={i} className="sg-b big" style={{ flex: 1, gridColumn: "auto", height: 110, background: LANE_COL[i] + "88" }} onPointerDown={() => { started.current = true; setHelp(false); hit(i); }}>{["D", "F", "J", "K"][i]}</button>)}</div>
        ) : (<>
          <div className="sg-stick" onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); started.current = true; setHelp(false); onStick(e); }} onPointerMove={(e) => { if (e.buttons || e.pointerType === "touch") onStick(e); }} onPointerUp={() => { stick.current = { x: 0, y: 0 }; }} onPointerCancel={() => { stick.current = { x: 0, y: 0 }; }}><i /></div>
          <div className="sg-btns"><button className="sg-b big" onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); keys.current.add("sprint"); }} onPointerUp={() => keys.current.delete("sprint")} onPointerCancel={() => keys.current.delete("sprint")}>SPRINT</button></div>
        </>)}
      </div>
    </div>
  );
}

function setup(c: HTMLCanvasElement | null) {
  if (!c) return null; const dpr = Math.min(2, window.devicePixelRatio || 1); const W = c.clientWidth, H = c.clientHeight;
  if (c.width !== W * dpr || c.height !== H * dpr) { c.width = W * dpr; c.height = H * dpr; }
  const ctx = c.getContext("2d")!; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); return { ctx, W, H };
}

function drawRhythm(c: HTMLCanvasElement | null, g: RhythmGame, judge: string) {
  const s = setup(c); if (!s) return; const { ctx, W, H } = s;
  const g0 = ctx.createLinearGradient(0, 0, 0, H); g0.addColorStop(0, "#1a1038"); g0.addColorStop(1, "#0f1b2d"); ctx.fillStyle = g0; ctx.fillRect(0, 0, W, H);
  const laneW = Math.min(90, (W - 20) / 4); const x0 = (W - laneW * 4) / 2; const hitY = H - 190; const top = 70; const speed = (hitY - top) / RHYTHM.lead;
  for (let i = 0; i < 4; i++) { ctx.fillStyle = i % 2 ? "rgba(255,255,255,.05)" : "rgba(255,255,255,.09)"; ctx.fillRect(x0 + i * laneW, top, laneW, hitY - top + 60); }
  ctx.fillStyle = "#fff"; ctx.fillRect(x0, hitY - 2, laneW * 4, 4);
  for (const n of g.notes) {
    if (n.state !== "pending") continue; const y = hitY - (n.t - g.time) * speed; if (y < top - 20 || y > H) continue;
    ctx.fillStyle = LANE_COL[n.lane]!; ctx.beginPath(); ctx.roundRect(x0 + n.lane * laneW + 6, y - 11, laneW - 12, 22, 8); ctx.fill();
  }
  for (const f of g.flash) { const a = 1 - (g.time - f.at) / 0.35; ctx.fillStyle = `rgba(255,255,255,${a * 0.6})`; ctx.fillRect(x0 + f.lane * laneW, hitY - 30, laneW, 60); }
  void judge;
}

function drawDelivery(c: HTMLCanvasElement | null, g: DeliveryGame) {
  const s = setup(c); if (!s) return; const { ctx, W, H } = s;
  const sc = Math.min((W - 10) / DELIVERY.w, (H - 260) / DELIVERY.h); const ox = (W - DELIVERY.w * sc) / 2, oy = 70;
  const X = (x: number) => ox + x * sc, Y = (y: number) => oy + y * sc;
  ctx.fillStyle = "#0f1b2d"; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#b9ab7c"; ctx.fillRect(X(0), Y(0), DELIVERY.w * sc, DELIVERY.h * sc);
  ctx.fillStyle = "rgba(0,0,0,.06)"; for (let i = 0; i < DELIVERY.w; i += 2) ctx.fillRect(X(i), Y(0), sc, DELIVERY.h * sc);
  const pulse = 0.6 + Math.sin(performance.now() / 180) * 0.25;
  const spot = (p: { x: number; y: number; name: string }, col: string, on: boolean, icon: string) => {
    ctx.fillStyle = on ? col : "rgba(0,0,0,.25)"; ctx.globalAlpha = on ? pulse : 1; ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), 1.2 * sc, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    ctx.fillStyle = "#fff"; ctx.font = `${Math.round(sc * 0.9)}px sans-serif`; ctx.textAlign = "center"; ctx.fillText(icon, X(p.x), Y(p.y) + sc * 0.3);
    ctx.font = `${Math.round(sc * 0.55)}px sans-serif`; ctx.fillText(p.name, X(p.x), Y(p.y) - 1.4 * sc);
  };
  g.kitchens.forEach((k, i) => spot(k, "#ff9d2e", !g.carrying && i === g.kitchen, "🍲"));
  g.customers.forEach((k, i) => spot(k, "#3ad67a", g.carrying && i === g.customer, "🧑‍🎓"));
  for (const w of g.walkers) { ctx.fillStyle = "#6a5acd"; ctx.beginPath(); ctx.arc(X(w.x), Y(w.y), .5 * sc, 0, 7); ctx.fill(); }
  ctx.fillStyle = g.stun > 0 ? "#ff6b6b" : "#2f7bff"; ctx.beginPath(); ctx.arc(X(g.x), Y(g.y), .55 * sc, 0, 7); ctx.fill();
  if (g.carrying) { ctx.fillStyle = "#fff"; ctx.fillRect(X(g.x) - 5, Y(g.y) - .55 * sc - 10, 10, 10); }
  ctx.fillStyle = "rgba(255,255,255,.25)"; ctx.fillRect(X(0), Y(DELIVERY.h) + 8, DELIVERY.w * sc, 8); ctx.fillStyle = "#4cd37a"; ctx.fillRect(X(0), Y(DELIVERY.h) + 8, DELIVERY.w * sc * g.stamina, 8);
}
