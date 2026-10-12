// Pure, deterministic sports engine for CAMPUS football (3v3 futsal) and basketball (2v2).
// Top-down 2D in court metres. No DOM, no randomness except the seeded rng in state. Practice mode only:
// it awards nothing, so it needs no server authority. Rendering/input live in components/SportsGame.tsx.

export type Sport = "football" | "basketball";
export type Side = 0 | 1; // 0 = human team (attacks +x), 1 = AI team (attacks -x)
export interface Vec { x: number; y: number }
export interface Player { id: number; side: Side; x: number; y: number; vx: number; vy: number; face: number; stamina: number; cd: number }
export interface Ball { x: number; y: number; vx: number; vy: number; z: number; vz: number; holder: number; lastTouch: Side; shotBy: number; shotPts: number }
export interface Input { mx: number; my: number; sprint: boolean; shoot: number; pass: boolean; action2: boolean; switchP: boolean }
export interface Court { w: number; h: number; goalH: number; label: string; maxPlayers: number; duration: number }
export interface Game {
  sport: Sport; court: Court; players: Player[]; ball: Ball; score: [number, number];
  t: number; phase: "kickoff" | "play" | "goal" | "over"; phaseT: number; ctrl: number; msg: string; seed: number; charge: number;
}

export const COURTS: Record<Sport, Court> = {
  football: { w: 30, h: 16, goalH: 4.2, label: "Football", maxPlayers: 3, duration: 120 },
  basketball: { w: 20, h: 12, goalH: 0, label: "Basketball", maxPlayers: 2, duration: 120 },
};
const NO_INPUT: Input = { mx: 0, my: 0, sprint: false, shoot: 0, pass: false, action2: false, switchP: false };
export const idleInput = (): Input => ({ ...NO_INPUT });

function rng(g: Game): number { g.seed = (g.seed * 1664525 + 1013904223) >>> 0; return g.seed / 4294967296; }
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);

export function hoopX(c: Court, side: Side): number { return side === 0 ? c.w - 1.4 : 1.4; } // hoop each team attacks
export function threeLine(): number { return 6.0; }

export function newGame(sport: Sport, seed = 1): Game {
  const court = COURTS[sport];
  const n = court.maxPlayers;
  const players: Player[] = [];
  for (let s = 0; s < 2; s++) for (let i = 0; i < n; i++) players.push({ id: s * n + i, side: s as Side, x: 0, y: 0, vx: 0, vy: 0, face: s === 0 ? 0 : Math.PI, stamina: 1, cd: 0 });
  const g: Game = { sport, court, players, ball: { x: 0, y: 0, vx: 0, vy: 0, z: 0, vz: 0, holder: -1, lastTouch: 0, shotBy: -1, shotPts: 0 }, score: [0, 0], t: court.duration, phase: "kickoff", phaseT: 1.2, ctrl: 0, msg: "Kick off!", seed, charge: 0 };
  setKickoff(g, 0);
  return g;
}

function setKickoff(g: Game, receiver: Side) {
  const { w, h } = g.court; const n = g.court.maxPlayers;
  for (const p of g.players) {
    const idx = p.id % n; const dir = p.side === 0 ? 1 : -1;
    p.x = w / 2 - dir * (idx === 0 ? 2 : 5 + idx); p.y = h / 2 + (idx - (n - 1) / 2) * 3.2; p.vx = p.vy = 0; p.face = dir === 1 ? 0 : Math.PI; p.cd = 0;
  }
  const first = g.players.find((p) => p.side === receiver && p.id % n === 0)!;
  g.ball = { x: w / 2, y: h / 2, vx: 0, vy: 0, z: 0, vz: 0, holder: -1, lastTouch: receiver, shotBy: -1, shotPts: 0 };
  if (g.sport === "basketball") { g.ball.holder = first.id; g.ball.x = first.x; g.ball.y = first.y; }
  if (receiver === 0) g.ctrl = first.id;
  g.phase = "kickoff"; g.phaseT = 1.0;
}

function nearestToBall(g: Game, side: Side, exclude = -1): Player {
  let best = g.players.find((p) => p.side === side)!; let bd = 1e9;
  for (const p of g.players) if (p.side === side && p.id !== exclude) { const d = dist(p, g.ball); if (d < bd) { bd = d; best = p; } }
  return best;
}

function moveTowards(p: Player, tx: number, ty: number, speed: number, dt: number) {
  const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
  if (d < 0.15) { p.vx *= 0.6; p.vy *= 0.6; return; }
  p.vx += (dx / d * speed - p.vx) * Math.min(1, dt * 9); p.vy += (dy / d * speed - p.vy) * Math.min(1, dt * 9);
}

const SPEED = 5.2, SPRINT = 7.4;

function kick(g: Game, p: Player, tx: number, ty: number, power: number, lift = 0) {
  const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy) || 1;
  g.ball.holder = -1; g.ball.vx = dx / d * power; g.ball.vy = dy / d * power; g.ball.vz = lift; g.ball.lastTouch = p.side; p.cd = 0.35;
}

/** Aim of the human: the move direction if held, otherwise the facing direction. */
function aimOf(p: Player, inp: Input): Vec {
  const m = Math.hypot(inp.mx, inp.my);
  if (m > 0.3) return { x: inp.mx / m, y: inp.my / m };
  return { x: Math.cos(p.face), y: Math.sin(p.face) };
}

export function step(g: Game, inp: Input, dt: number): void {
  if (g.phase === "over") return;
  dt = Math.min(dt, 0.05);
  const { w, h } = g.court;
  if (g.phase === "kickoff" || g.phase === "goal") {
    g.phaseT -= dt;
    if (g.phase === "goal" && g.phaseT <= 0) setKickoff(g, g.ball.lastTouch === 0 ? 1 : 0);
    else if (g.phase === "kickoff" && g.phaseT <= 0) { g.phase = "play"; g.msg = ""; }
    if (g.phase === "goal") return;
  } else {
    g.t -= dt;
    if (g.t <= 0) { g.t = 0; g.phase = "over"; g.msg = g.score[0] > g.score[1] ? "You win!" : g.score[0] < g.score[1] ? "You lose" : "Draw"; return; }
  }
  const cp = g.players[g.ctrl]!;
  // Human: switch player (nearest to ball without ball) on request.
  if (inp.switchP && g.ball.holder !== g.ctrl) g.ctrl = nearestToBall(g, 0, g.ctrl).id;
  if (g.sport === "football" && g.ball.holder < 0 && g.phase === "play" && g.players[g.ctrl]!.side === 0 && dist(cp, g.ball) > 6) g.ctrl = nearestToBall(g, 0).id;
  const active = g.phase === "play";

  for (const p of g.players) {
    p.cd = Math.max(0, p.cd - dt);
    const human = p.id === g.ctrl;
    const sprinting = human ? inp.sprint && p.stamina > 0.05 : false;
    if (human) {
      const m = Math.hypot(inp.mx, inp.my); const sp = sprinting ? SPRINT : SPEED;
      const k = m > 1 ? 1 / m : 1;
      p.vx += (inp.mx * k * sp - p.vx) * Math.min(1, dt * 12); p.vy += (inp.my * k * sp - p.vy) * Math.min(1, dt * 12);
      if (m > 0.3) p.face = Math.atan2(inp.my, inp.mx);
    } else if (active) aiMove(g, p, dt);
    else { p.vx *= 0.8; p.vy *= 0.8; }
    if (human) p.stamina = clamp(p.stamina + (sprinting && Math.hypot(p.vx, p.vy) > 1 ? -0.35 : 0.2) * dt, 0, 1);
    else p.stamina = clamp(p.stamina + 0.2 * dt, 0, 1);
    p.x = clamp(p.x + p.vx * dt, 0.3, w - 0.3); p.y = clamp(p.y + p.vy * dt, 0.3, h - 0.3);
  }
  // Soft collisions between players.
  for (let i = 0; i < g.players.length; i++) for (let j = i + 1; j < g.players.length; j++) {
    const a = g.players[i]!, b = g.players[j]!; const d = dist(a, b);
    if (d < 0.9 && d > 0.001) { const push = (0.9 - d) / 2; const nx = (b.x - a.x) / d, ny = (b.y - a.y) / d; a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push; }
  }
  if (!active) { if (g.sport === "basketball" && g.ball.holder >= 0) carry(g); return; }

  if (g.sport === "football") footballBall(g, inp, dt); else basketBall(g, inp, dt);
}

// ---------------- football ----------------
function goalSpan(g: Game) { const c = g.court; return { lo: c.h / 2 - c.goalH / 2, hi: c.h / 2 + c.goalH / 2 }; }

function footballBall(g: Game, inp: Input, dt: number) {
  const b = g.ball; const { w, h } = g.court; const gs = goalSpan(g);
  const cp = g.players[g.ctrl]!;
  // Charged shot: hold to charge (UI shows meter), release fires. inp.shoot is 0..1 charge, released = value negative sentinel handled by caller via fire flag.
  if (inp.shoot < 0) { // released: magnitude = charge
    const power = 9 + (-inp.shoot) * 15; const a = aimOf(cp, inp);
    if (dist(cp, b) < 1.4 && cp.cd === 0) { b.vx = a.x * power; b.vy = a.y * power; b.vz = 0.5 + (-inp.shoot) * 2.2; b.lastTouch = 0; cp.cd = 0.35; }
  }
  if (inp.pass && cp.cd === 0 && dist(cp, b) < 1.4) {
    const mate = g.players.filter((p) => p.side === 0 && p.id !== cp.id).map((p) => ({ p, s: Math.abs(angDiff(Math.atan2(p.y - cp.y, p.x - cp.x), Math.atan2(aimOf(cp, inp).y, aimOf(cp, inp).x))) })).sort((x, y) => x.s - y.s)[0];
    if (mate) { const lead = 0.25; kick(g, cp, mate.p.x + mate.p.vx * lead, mate.p.y + mate.p.vy * lead, 10); g.ctrl = mate.p.id; }
  }
  // Dribble: touching the ball pushes it ahead of the mover.
  for (const p of g.players) {
    const d = dist(p, b);
    if (d < 0.75 && p.cd === 0 && b.z < 0.6) {
      const sp = Math.hypot(p.vx, p.vy);
      if (sp > 0.5) { b.vx += (p.vx * 1.15 - b.vx) * 0.55; b.vy += (p.vy * 1.15 - b.vy) * 0.55; b.lastTouch = p.side; }
      else if (d < 0.5) { b.vx += (b.x - p.x) * 2; b.vy += (b.y - p.y) * 2; }
    }
  }
  b.x += b.vx * dt; b.y += b.vy * dt;
  b.vz -= 14 * dt; b.z = Math.max(0, b.z + b.vz * dt); if (b.z === 0 && b.vz < 0) b.vz = -b.vz * 0.4 > 0.4 ? -b.vz * 0.4 : 0;
  const drag = Math.pow(b.z > 0 ? 0.9 : 0.35, dt); b.vx *= drag; b.vy *= drag;
  if (b.y < 0.2) { b.y = 0.2; b.vy = Math.abs(b.vy) * 0.7; } if (b.y > h - 0.2) { b.y = h - 0.2; b.vy = -Math.abs(b.vy) * 0.7; }
  const inGoal = b.y > gs.lo && b.y < gs.hi && b.z < 2.4;
  if (b.x < 0.2) { if (inGoal) return scoreGoal(g, 1); b.x = 0.2; b.vx = Math.abs(b.vx) * 0.6; }
  if (b.x > w - 0.2) { if (inGoal) return scoreGoal(g, 0); b.x = w - 0.2; b.vx = -Math.abs(b.vx) * 0.6; }
}
function scoreGoal(g: Game, side: Side) { g.score[side]++; g.ball.lastTouch = side; g.phase = "goal"; g.phaseT = 1.6; g.msg = side === 0 ? "GOAL!" : "They scored"; g.ball.vx = g.ball.vy = 0; g.ball.x = clamp(g.ball.x, 0.2, g.court.w - 0.2); }
function angDiff(a: number, b: number) { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }

// ---------------- basketball ----------------
function carry(g: Game) { const p = g.players[g.ball.holder]!; g.ball.x = p.x + Math.cos(p.face) * 0.6; g.ball.y = p.y + Math.sin(p.face) * 0.6; g.ball.z = 0.9 + Math.abs(Math.sin(g.t * 9)) * 0.5; g.ball.vx = g.ball.vy = 0; }

/** Probability a shot goes in: distance falloff plus release-timing bonus (charge near 0.75 is the sweet spot) and defender contest. */
export function shotChance(g: Game, p: Player, charge: number): { chance: number; pts: number } {
  const hx = hoopX(g.court, p.side), hy = g.court.h / 2;
  const d = Math.hypot(hx - p.x, hy - p.y);
  const pts = d >= threeLine() ? 3 : 2;
  const base = clamp(0.92 - d * 0.075, 0.1, 0.9);
  const timing = 1 - Math.min(1, Math.abs(charge - 0.78) / 0.5);
  let contest = 0;
  for (const o of g.players) if (o.side !== p.side) { const od = dist(o, p); if (od < 2.2) contest = Math.max(contest, (2.2 - od) / 2.2); }
  return { chance: clamp(base * (0.45 + 0.65 * timing) * (1 - contest * 0.45), 0.03, 0.97), pts };
}

function basketBall(g: Game, inp: Input, dt: number) {
  const b = g.ball; const { w, h } = g.court; const cp = g.players[g.ctrl]!;
  if (b.holder >= 0) {
    const holder = g.players[b.holder]!;
    if (b.holder === g.ctrl) {
      if (inp.shoot < 0) shoot(g, holder, -inp.shoot);
      else if (inp.pass) { const mate = g.players.find((p) => p.side === 0 && p.id !== holder.id)!; kick(g, holder, mate.x + mate.vx * 0.3, mate.y + mate.vy * 0.3, 11, 1.5); b.shotBy = -1; g.ctrl = mate.id; }
    }
    if (b.holder >= 0) carry(g);
    // Steal: defenders in reach have a chance each tick.
    if (b.holder >= 0) for (const o of g.players) {
      if (o.side === holder.side || o.cd > 0) continue;
      const isHumanSteal = o.id === g.ctrl && inp.action2;
      if (dist(o, holder) < 1.0 && (isHumanSteal || (o.id !== g.ctrl && rng(g) < 0.012))) {
        if (isHumanSteal ? rng(g) < 0.55 : true) { b.holder = o.id; o.cd = 0.5; holder.cd = 0.8; g.msg = o.side === 0 ? "Steal!" : "Stolen!"; if (o.side === 0) g.ctrl = o.id; break; }
        o.cd = 0.6;
      }
    }
    return;
  }
  // Loose ball (shot in flight or after a pass).
  b.x += b.vx * dt; b.y += b.vy * dt; b.vz -= 12 * dt; b.z = Math.max(0, b.z + b.vz * dt);
  if (b.z === 0 && b.vz < 0) b.vz = -b.vz * 0.5 > 0.5 ? -b.vz * 0.5 : 0;
  if (b.shotBy >= 0) {
    const shooter = g.players[b.shotBy]!; const hx = hoopX(g.court, shooter.side), hy = h / 2;
    if (Math.hypot(hx - b.x, hy - b.y) < 0.7 && b.z < 3.6) {
      if (b.shotPts > 0) { g.score[shooter.side] += b.shotPts; g.msg = shooter.side === 0 ? `+${b.shotPts}` : `They score ${b.shotPts}`; g.ball.lastTouch = shooter.side; const other = g.players.find((p) => p.side !== shooter.side && p.id % g.court.maxPlayers === 0)!; takeBall(g, other); }
      else { b.vx = -b.vx * 0.5; b.vy = (rng(g) - 0.5) * 4; b.shotBy = -1; g.msg = "Miss"; }
      b.shotBy = -1; b.shotPts = 0; return;
    }
    if (b.z === 0 && b.vz === 0) { b.shotBy = -1; }
  }
  if (b.shotBy < 0) { b.vx *= Math.pow(0.5, dt); b.vy *= Math.pow(0.5, dt); }
  b.x = clamp(b.x, 0.2, w - 0.2); b.y = clamp(b.y, 0.2, h - 0.2);
  // Pick up a loose ball.
  if (b.z < 1.2) for (const p of g.players) if (p.cd === 0 && dist(p, b) < 0.9 && Math.hypot(b.vx, b.vy) < 6) { takeBall(g, p); if (p.side === 0) g.ctrl = p.id; break; }
  void cp;
}
function takeBall(g: Game, p: Player) { g.ball.holder = p.id; g.ball.shotBy = -1; g.ball.lastTouch = p.side; g.ball.vx = g.ball.vy = 0; }

function shoot(g: Game, p: Player, charge: number) {
  const { chance, pts } = shotChance(g, p, charge);
  const made = rng(g) < chance;
  const hx = hoopX(g.court, p.side), hy = g.court.h / 2;
  const dx = hx - p.x, dy = hy - p.y, d = Math.hypot(dx, dy) || 1; const flight = clamp(d / 9, 0.45, 1.1);
  g.ball.holder = -1;
  g.ball.vz = 6 * flight + 2.5; g.ball.shotBy = p.id; g.ball.shotPts = made ? pts : 0; g.ball.lastTouch = p.side; p.cd = 0.6;
  // Drag is skipped while a shot is in flight so it arrives at the hoop: re-aim velocity to land on the rim in `flight` seconds.
  g.ball.vx = dx / flight; g.ball.vy = dy / flight;
}

// ---------------- AI ----------------
function aiMove(g: Game, p: Player, dt: number) {
  const c = g.court; const b = g.ball; const dir = p.side === 0 ? 1 : -1; const idx = p.id % c.maxPlayers;
  const speed = p.side === 1 ? 4.6 : 4.4;
  const mine = g.sport === "basketball" ? b.holder >= 0 && g.players[b.holder]!.side === p.side : nearestToBall(g, p.side).id === p.id;
  if (g.sport === "football") {
    const chaser = nearestToBall(g, p.side, p.side === 0 ? g.ctrl : -1);
    if (chaser.id === p.id) {
      // Go to ball; shoot when in range and lined up, otherwise dribble forward.
      moveTowards(p, b.x - dir * 0.2, b.y, speed, dt);
      const gx = p.side === 0 ? c.w : 0;
      if (dist(p, b) < 1.1 && p.cd === 0) {
        const gs = goalSpan(g); const dg = Math.abs(gx - p.x);
        if (dg < 9 || p.side === 0 && dg < 12) { const ty = c.h / 2 + (rng(g) - 0.5) * (gs.hi - gs.lo) * 0.8; kick(g, p, gx, ty, 13 + rng(g) * 4, 0.6); }
        else { const mate = g.players.find((q) => q.side === p.side && q.id !== p.id && Math.abs(gx - q.x) < Math.abs(gx - p.x));
          if (mate && rng(g) < 0.04) kick(g, p, mate.x, mate.y, 9); else { b.vx += (dir * 6 - b.vx) * 0.3; b.vy += ((c.h / 2 - b.y) * 0.5 - b.vy) * 0.2; } }
      }
    } else if (p.id % c.maxPlayers === c.maxPlayers - 1) { // keeper-ish: guard own goal line
      const gx = p.side === 0 ? 2.2 : c.w - 2.2; moveTowards(p, gx, clamp(b.y, c.h / 2 - 2.2, c.h / 2 + 2.2), speed, dt);
    } else moveTowards(p, clamp(b.x + dir * (idx * 3), 3, c.w - 3), c.h / 2 + (idx % 2 ? -3.5 : 3.5) + (b.y - c.h / 2) * 0.3, speed, dt);
    return;
  }
  // basketball
  const hx = hoopX(c, p.side), hy = c.h / 2;
  if (b.holder === p.id) {
    moveTowards(p, hx - dir * 2.6, hy + (idx ? 1.8 : -1.2), speed, dt);
    p.cd = Math.max(p.cd, 0);
    if (Math.hypot(hx - p.x, hy - p.y) < 6.4 && p.cd === 0 && rng(g) < 0.7 * dt) shoot(g, p, 0.55 + rng(g) * 0.45);
  } else if (mine) { moveTowards(p, clamp(hx - dir * 5, 1, c.w - 1), idx ? 2.5 : c.h - 2.5, speed, dt); }
  else {
    const carrier = b.holder >= 0 ? g.players[b.holder]! : null;
    if (carrier) { const gx = hoopX(c, carrier.side); const guard = idx === g.players.filter((q) => q.side === p.side).indexOf(p) ? carrier : carrier;
      const oppIdx = g.players.filter((q) => q.side === carrier.side).indexOf(carrier);
      const myIdx = g.players.filter((q) => q.side === p.side).indexOf(p);
      const tgt = myIdx === oppIdx ? guard : g.players.filter((q) => q.side === carrier.side)[myIdx]!;
      moveTowards(p, (tgt.x + gx) / 2 + (tgt.x < gx ? 0.4 : -0.4), (tgt.y + hy) / 2, speed, dt); }
    else moveTowards(p, b.x, b.y, speed, dt);
  }
}
