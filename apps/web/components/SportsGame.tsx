"use client";
// Full-screen game mode for CAMPUS football and basketball (practice vs AI). Engine: lib/sports-game.ts.
import { useEffect, useRef, useState } from "react";
import { COURTS, hoopX, idleInput, newGame, step, threeLine, type Game, type Sport } from "../lib/sports-game";

const HELP: Record<Sport, string[]> = {
  football: ["Move: WASD / arrows", "Sprint: Shift", "Shoot: hold Space or J, release", "Pass: K", "Switch player: Q"],
  basketball: ["Move: WASD / arrows", "Sprint: Shift", "Shoot: hold Space or J, release near the top of the meter", "Pass: K", "Steal: L"],
};

export default function SportsGame({ sport, onExit }: { sport: Sport; onExit: () => void }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const game = useRef<Game>(newGame(sport, (Date.now() & 0xffff) + 1));
  const keys = useRef(new Set<string>());
  const stick = useRef({ x: 0, y: 0 });
  const charge = useRef({ on: false, v: 0 });
  const pending = useRef({ shoot: 0, pass: false, steal: false, sw: false });
  const paused = useRef(false);
  const [hud, setHud] = useState({ s0: 0, s1: 0, t: 120, msg: "", over: false, charge: 0, paused: false });
  const [showHelp, setShowHelp] = useState(true);
  const court = COURTS[sport];

  useEffect(() => {
    const rel = () => { if (charge.current.on) { pending.current.shoot = -Math.max(0.05, charge.current.v); charge.current = { on: false, v: 0 }; } };
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
      if (e.repeat) return;
      setShowHelp(false);
      if (k === "escape" || k === "p") { paused.current = !paused.current; setHud((h) => ({ ...h, paused: paused.current })); return; }
      if (k === " " || k === "j") charge.current = { on: true, v: 0 };
      else if (k === "k") pending.current.pass = true;
      else if (k === "l") pending.current.steal = true;
      else if (k === "q") pending.current.sw = true;
      else keys.current.add(k);
    };
    const up = (e: KeyboardEvent) => { const k = e.key.toLowerCase(); if (k === " " || k === "j") rel(); else keys.current.delete(k); };
    const vis = () => { if (document.hidden) { paused.current = true; setHud((h) => ({ ...h, paused: true })); } };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up); document.addEventListener("visibilitychange", vis);
    let raf = 0, last = performance.now(), acc = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const g = game.current;
      if (!paused.current) {
        const k = keys.current; const inp = idleInput();
        inp.mx = (k.has("d") || k.has("arrowright") ? 1 : 0) - (k.has("a") || k.has("arrowleft") ? 1 : 0) + stick.current.x;
        inp.my = (k.has("s") || k.has("arrowdown") ? 1 : 0) - (k.has("w") || k.has("arrowup") ? 1 : 0) + stick.current.y;
        inp.sprint = k.has("shift") || k.has("sprint");
        if (charge.current.on) charge.current.v = Math.min(1, charge.current.v + dt / 0.9);
        inp.shoot = pending.current.shoot; inp.pass = pending.current.pass; inp.action2 = pending.current.steal; inp.switchP = pending.current.sw;
        pending.current = { shoot: 0, pass: false, steal: false, sw: false };
        step(g, inp, dt);
      }
      draw(cv.current, g, charge.current.on ? charge.current.v : 0);
      acc += dt;
      if (acc > 0.1) { acc = 0; setHud({ s0: g.score[0], s1: g.score[1], t: Math.ceil(g.t), msg: g.msg, over: g.phase === "over", charge: charge.current.on ? charge.current.v : 0, paused: paused.current }); }
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); document.removeEventListener("visibilitychange", vis); };
  }, []);

  const onStick = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect(); const dx = (e.clientX - r.left - r.width / 2) / (r.width / 2), dy = (e.clientY - r.top - r.height / 2) / (r.height / 2); const m = Math.hypot(dx, dy) || 1;
    stick.current = { x: m > 1 ? dx / m : dx, y: m > 1 ? dy / m : dy };
  };
  const hold = (name: string) => ({ onPointerDown: (e: React.PointerEvent) => { (e.target as Element).setPointerCapture?.(e.pointerId); keys.current.add(name); }, onPointerUp: () => keys.current.delete(name), onPointerCancel: () => keys.current.delete(name) });
  const rematch = () => { game.current = newGame(sport, (Date.now() & 0xffff) + 1); paused.current = false; };
  const mm = String(Math.floor(hud.t / 60)); const ss = String(hud.t % 60).padStart(2, "0");

  return (
    <div className="sg-root" role="dialog" aria-label={`${court.label} game`}>
      <canvas ref={cv} className="sg-canvas" />
      <div className="sg-top">
        <button className="btn ghost" onClick={onExit}>✕ Leave</button>
        <div className="sg-score"><b>You {hud.s0}</b><span>{mm}:{ss}</span><b>{hud.s1} CPU</b></div>
        <button className="btn ghost" onClick={() => { paused.current = !paused.current; setHud((h) => ({ ...h, paused: paused.current })); }}>{hud.paused ? "▶" : "⏸"}</button>
      </div>
      {hud.msg && !hud.over && <div className="sg-msg">{hud.msg}</div>}
      {hud.charge > 0 && <div className="sg-meter" aria-hidden><i style={{ width: `${hud.charge * 100}%` }} />{sport === "basketball" && <u />}</div>}
      {showHelp && <div className="sg-help" onClick={() => setShowHelp(false)}><h3>{court.label} · {court.maxPlayers}v{court.maxPlayers}</h3>{HELP[sport].map((l) => <p key={l}>{l}</p>)}<p>Touch: stick + buttons. Tap to start.</p></div>}
      {hud.paused && !hud.over && <div className="sg-help"><h3>Paused</h3><button className="btn accent" onClick={() => { paused.current = false; setHud((h) => ({ ...h, paused: false })); }}>Resume</button><button className="btn" onClick={onExit}>Leave game</button></div>}
      {hud.over && <div className="sg-help"><h3>{hud.msg}</h3><p>{hud.s0} – {hud.s1}</p><button className="btn accent" onClick={rematch}>Rematch</button><button className="btn" onClick={onExit}>Back to campus</button></div>}
      <div className="sg-touch">
        <div className="sg-stick" onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setShowHelp(false); onStick(e); }} onPointerMove={(e) => { if (e.buttons || e.pointerType === "touch") onStick(e); }} onPointerUp={() => { stick.current = { x: 0, y: 0 }; }} onPointerCancel={() => { stick.current = { x: 0, y: 0 }; }}><i /></div>
        <div className="sg-btns">
          <button className="sg-b big" onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); charge.current = { on: true, v: 0 }; setShowHelp(false); }} onPointerUp={() => { if (charge.current.on) { pending.current.shoot = -Math.max(0.05, charge.current.v); charge.current = { on: false, v: 0 }; } }}>SHOOT</button>
          <button className="sg-b" onPointerDown={() => { pending.current.pass = true; }}>PASS</button>
          <button className="sg-b" {...hold("sprint")}>SPRINT</button>
          <button className="sg-b" onPointerDown={() => { if (sport === "basketball") pending.current.steal = true; else pending.current.sw = true; }}>{sport === "basketball" ? "STEAL" : "SWITCH"}</button>
        </div>
      </div>
    </div>
  );
}

function draw(c: HTMLCanvasElement | null, g: Game, chargeV: number) {
  if (!c) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1); const W = c.clientWidth, H = c.clientHeight;
  if (c.width !== W * dpr || c.height !== H * dpr) { c.width = W * dpr; c.height = H * dpr; }
  const ctx = c.getContext("2d")!; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const { w, h } = g.court; const pad = 3.5; const sc = Math.min(W / (w + pad), (H - 150) / (h + 2)); const ox = (W - w * sc) / 2, oy = (H - h * sc) / 2 - 10;
  const X = (x: number) => ox + x * sc, Y = (y: number) => oy + y * sc;
  ctx.fillStyle = "#0f1b2d"; ctx.fillRect(0, 0, W, H);
  const fb = g.sport === "football";
  ctx.fillStyle = fb ? "#3c8f3f" : "#c98a4b"; ctx.fillRect(X(0), Y(0), w * sc, h * sc);
  if (fb) for (let i = 0; i < 10; i++) { ctx.fillStyle = i % 2 ? "rgba(255,255,255,.05)" : "rgba(0,0,0,.05)"; ctx.fillRect(X(i * 3), Y(0), 3 * sc, h * sc); }
  ctx.strokeStyle = "rgba(255,255,255,.9)"; ctx.lineWidth = 2; ctx.strokeRect(X(0), Y(0), w * sc, h * sc);
  ctx.beginPath(); ctx.moveTo(X(w / 2), Y(0)); ctx.lineTo(X(w / 2), Y(h)); ctx.stroke();
  ctx.beginPath(); ctx.arc(X(w / 2), Y(h / 2), 2.2 * sc, 0, 7); ctx.stroke();
  if (fb) {
    const gh = g.court.goalH; ctx.strokeRect(X(0), Y(h / 2 - 4), 4 * sc, 8 * sc); ctx.strokeRect(X(w - 4), Y(h / 2 - 4), 4 * sc, 8 * sc);
    ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.fillRect(X(-0.6), Y(h / 2 - gh / 2), 0.6 * sc, gh * sc); ctx.fillRect(X(w), Y(h / 2 - gh / 2), 0.6 * sc, gh * sc);
  } else {
    for (const s of [0, 1] as const) {
      const hx = hoopX(g.court, s === 0 ? 0 : 1); const dir = hx > w / 2 ? -1 : 1;
      ctx.beginPath(); ctx.arc(X(hx), Y(h / 2), threeLine() * sc, dir === -1 ? Math.PI / 2 : -Math.PI / 2, dir === -1 ? Math.PI * 1.5 : Math.PI / 2, false); ctx.stroke();
      ctx.strokeRect(dir === -1 ? X(hx - 0.4 - 4.2) : X(hx - 1), Y(h / 2 - 2.4), 5.2 * sc, 4.8 * sc);
      ctx.fillStyle = "rgba(255,255,255,.9)"; ctx.fillRect(X(hx + (dir === -1 ? 0.55 : -0.7)), Y(h / 2 - 1.1), 0.15 * sc, 2.2 * sc);
      ctx.strokeStyle = "#ff7a1a"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(X(hx), Y(h / 2), 0.38 * sc, 0, 7); ctx.stroke(); ctx.strokeStyle = "rgba(255,255,255,.9)"; ctx.lineWidth = 2;
    }
  }
  const cols = ["#2f7bff", "#e8483f"]; const sorted = [...g.players].sort((a, b) => a.y - b.y);
  for (const p of sorted) {
    ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.beginPath(); ctx.ellipse(X(p.x), Y(p.y) + .35 * sc, .5 * sc, .22 * sc, 0, 0, 7); ctx.fill();
    ctx.fillStyle = cols[p.side]!; ctx.beginPath(); ctx.arc(X(p.x), Y(p.y) - .25 * sc, .5 * sc, 0, 7); ctx.fill();
    ctx.fillStyle = "#e6b88f"; ctx.beginPath(); ctx.arc(X(p.x) + Math.cos(p.face) * .22 * sc, Y(p.y) - .75 * sc + Math.sin(p.face) * .1 * sc, .24 * sc, 0, 7); ctx.fill();
    if (p.id === g.ctrl) { ctx.strokeStyle = "#ffe14d"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(X(p.x), Y(p.y) + .1 * sc, .8 * sc, 0, 7); ctx.stroke(); ctx.fillStyle = "#ffe14d"; ctx.beginPath(); ctx.moveTo(X(p.x), Y(p.y) - 1.7 * sc); ctx.lineTo(X(p.x) - 6, Y(p.y) - 2.1 * sc); ctx.lineTo(X(p.x) + 6, Y(p.y) - 2.1 * sc); ctx.fill(); }
  }
  const b = g.ball; const r = (fb ? .3 : .36) * sc;
  ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.beginPath(); ctx.ellipse(X(b.x), Y(b.y), r, r * .5, 0, 0, 7); ctx.fill();
  ctx.fillStyle = fb ? "#fff" : "#f0742b"; ctx.beginPath(); ctx.arc(X(b.x), Y(b.y) - b.z * sc * .55 - r, r, 0, 7); ctx.fill();
  if (chargeV > 0 && !fb) { /* meter drawn in DOM */ }
}
