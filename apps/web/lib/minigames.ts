// Pure engines for two practice minigames: Beat Stage (rhythm, Event Arena) and Delivery Dash (Food Court).
// Deterministic (seeded), no DOM. Practice only: awards nothing, so no server authority needed.
export type Mini = "rhythm" | "delivery";
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
function mk(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

// ---------------- rhythm ----------------
export const RHYTHM = { lanes: 4, duration: 45, bpm: 112, lead: 1.8, perfect: 0.06, good: 0.13 };
export interface Note { t: number; lane: number; state: "pending" | "perfect" | "good" | "miss" }
export interface RhythmGame { notes: Note[]; time: number; score: number; combo: number; best: number; perfect: number; good: number; miss: number; over: boolean; flash: { lane: number; kind: string; at: number }[] }

export function newRhythm(seed = 1): RhythmGame {
  const r = mk(seed); const beat = 60 / RHYTHM.bpm; const notes: Note[] = [];
  let lane = Math.floor(r() * 4);
  for (let t = 2; t < RHYTHM.duration - 2; t += beat / 2) {
    const p = r(); // on-beat notes more likely than off-beat; occasional doubles
    const onBeat = Math.abs(((t - 2) / beat) % 1) < 0.01;
    if (p < (onBeat ? 0.75 : 0.32)) { lane = r() < 0.6 ? (lane + (r() < 0.5 ? 1 : 3)) % 4 : Math.floor(r() * 4); notes.push({ t, lane, state: "pending" });
      if (onBeat && r() < 0.12) notes.push({ t, lane: (lane + 2) % 4, state: "pending" }); }
  }
  return { notes, time: -RHYTHM.lead, score: 0, combo: 0, best: 0, perfect: 0, good: 0, miss: 0, over: false, flash: [] };
}
function judge(g: RhythmGame, n: Note, kind: "perfect" | "good" | "miss") {
  n.state = kind;
  if (kind === "miss") { g.miss++; g.combo = 0; return; }
  g[kind]++; g.combo++; g.best = Math.max(g.best, g.combo);
  g.score += (kind === "perfect" ? 100 : 60) * (1 + Math.min(g.combo, 40) / 10);
  g.flash.push({ lane: n.lane, kind, at: g.time });
}
export function rhythmHit(g: RhythmGame, lane: number): "perfect" | "good" | "miss" | "none" {
  if (g.over) return "none";
  let best: Note | null = null;
  for (const n of g.notes) if (n.state === "pending" && n.lane === lane && Math.abs(n.t - g.time) <= RHYTHM.good && (!best || Math.abs(n.t - g.time) < Math.abs(best.t - g.time))) best = n;
  if (!best) { g.combo = 0; return "none"; } // stray press breaks the combo
  const d = Math.abs(best.t - g.time); const k = d <= RHYTHM.perfect ? "perfect" : "good"; judge(g, best, k); return k;
}
export function rhythmStep(g: RhythmGame, dt: number) {
  if (g.over) return; g.time += Math.min(dt, 0.05);
  for (const n of g.notes) if (n.state === "pending" && g.time - n.t > RHYTHM.good) judge(g, n, "miss");
  g.flash = g.flash.filter((f) => g.time - f.at < 0.35);
  if (g.time >= RHYTHM.duration) g.over = true;
}
export function rhythmGrade(g: RhythmGame): string {
  const total = g.perfect + g.good + g.miss || 1; const acc = (g.perfect + g.good * 0.6) / total;
  return acc > 0.93 ? "S" : acc > 0.82 ? "A" : acc > 0.68 ? "B" : acc > 0.5 ? "C" : "D";
}

// ---------------- delivery ----------------
export const DELIVERY = { w: 28, h: 18, duration: 60, bonus: 3, cap: 120 };
export interface Spot { x: number; y: number; name: string }
export interface Walker { x: number; y: number; vx: number; vy: number }
export interface DeliveryGame { x: number; y: number; vx: number; vy: number; stamina: number; carrying: boolean; kitchens: Spot[]; customers: Spot[]; kitchen: number; customer: number; walkers: Walker[]; delivered: number; score: number; t: number; over: boolean; slow: number; msg: string; seed: number; stun: number; elapsed: number }
const KITCHENS: Spot[] = [{ x: 3, y: 3, name: "Mama Put" }, { x: 3, y: 15, name: "Suya Spot" }, { x: 14, y: 2.5, name: "Jollof Hub" }];
const CUSTOMERS: Spot[] = [{ x: 25, y: 3, name: "Hostel Gate" }, { x: 25, y: 15, name: "Library Steps" }, { x: 15, y: 15.5, name: "Lecture Hall" }, { x: 22, y: 9, name: "Sports Stand" }];

export function newDelivery(seed = 1): DeliveryGame {
  const r = mk(seed); const walkers: Walker[] = [];
  for (let i = 0; i < 7; i++) { const a = r() * 6.28; walkers.push({ x: 6 + r() * 16, y: 3 + r() * 12, vx: Math.cos(a) * 1.6, vy: Math.sin(a) * 1.6 }); }
  const g: DeliveryGame = { x: 14, y: 9, vx: 0, vy: 0, stamina: 1, carrying: false, kitchens: KITCHENS, customers: CUSTOMERS, kitchen: 0, customer: 0, walkers, delivered: 0, score: 0, t: DELIVERY.duration, over: false, slow: 0, msg: "Grab the order!", seed, stun: 0, elapsed: 0 };
  g.kitchen = Math.floor(r() * KITCHENS.length); return g;
}
export function deliveryStep(g: DeliveryGame, mx: number, my: number, sprint: boolean, dt: number) {
  if (g.over) return; dt = Math.min(dt, 0.05); g.t -= dt; g.elapsed += dt;
  if (g.t <= 0 || g.elapsed >= DELIVERY.cap) { g.t = 0; g.over = true; g.msg = `${g.delivered} delivered`; return; }
  g.stun = Math.max(0, g.stun - dt);
  const m = Math.hypot(mx, my); const k = m > 1 ? 1 / m : 1; const run = sprint && g.stamina > 0.05 && g.stun === 0;
  const sp = (run ? 8 : 5.4) * (g.stun > 0 ? 0.25 : 1) * (g.carrying ? 0.93 : 1);
  g.vx += (mx * k * sp - g.vx) * Math.min(1, dt * 12); g.vy += (my * k * sp - g.vy) * Math.min(1, dt * 12);
  g.stamina = clamp(g.stamina + (run && m > 0.2 ? -0.3 : 0.18) * dt, 0, 1);
  g.x = clamp(g.x + g.vx * dt, 0.5, DELIVERY.w - 0.5); g.y = clamp(g.y + g.vy * dt, 0.5, DELIVERY.h - 0.5);
  for (const w of g.walkers) {
    w.x += w.vx * dt; w.y += w.vy * dt;
    if (w.x < 1 || w.x > DELIVERY.w - 1) w.vx = -w.vx; if (w.y < 1 || w.y > DELIVERY.h - 1) w.vy = -w.vy;
    w.x = clamp(w.x, 1, DELIVERY.w - 1); w.y = clamp(w.y, 1, DELIVERY.h - 1);
    if (g.stun === 0 && Math.hypot(w.x - g.x, w.y - g.y) < 0.85) { g.stun = 0.7; g.msg = "Excuse me!"; if (g.carrying) g.score = Math.max(0, g.score - 5); }
  }
  const tgt = g.carrying ? g.customers[g.customer]! : g.kitchens[g.kitchen]!;
  if (Math.hypot(tgt.x - g.x, tgt.y - g.y) < 1.3) {
    if (!g.carrying) { g.carrying = true; g.customer = (g.customer + 1 + (g.delivered % 3)) % g.customers.length; g.msg = `Deliver to ${g.customers[g.customer]!.name}`; }
    else { g.carrying = false; g.delivered++; g.score += 50 + Math.round(Math.max(0, g.stamina) * 10); g.t = Math.min(DELIVERY.duration, g.t + DELIVERY.bonus); g.kitchen = (g.kitchen + 1 + g.delivered) % g.kitchens.length; g.msg = `+${DELIVERY.bonus}s! Next: ${g.kitchens[g.kitchen]!.name}`; }
  }
}
