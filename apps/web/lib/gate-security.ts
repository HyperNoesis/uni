/* Grand Gate entry check: guards, pass, wicket. Pure state machine (no DOM, no renderer import), deterministic given an rng.
 * The page feeds the player's position every frame and renders `snapshot()`; the renderer draws guards as normal skinned entities
 * and turns `gesture` / `pass` / `wicket` into poses and props. Server authority is separate: the page sends `gate_pass` on approval.
 * Coordinates are world tiles: x, y (y == world z). The arrival side is +y; heading 0 faces +y.
 */
import { GATE, inChallengeZone, isOutsideGate } from "@campus/domain";

export type GestureKind = "stop" | "reach" | "hold" | "give" | "take" | "inspect" | "thumbs" | "beckon";
export interface Gesture { kind: GestureKind; t: number }
export type Phase = "idle" | "call" | "ask" | "offer" | "give" | "inspect" | "approve" | "open" | "through" | "done";
export type PassState = "hidden" | "out" | "flying" | "held" | "returning";
export interface GuardView {
  id: string; name: string; kit: "guard" | "police"; x: number; y: number;
  /** Heading the body should face when standing still (radians, 0 faces +y). */
  face: number; gesture?: Gesture; say?: string; moving: boolean;
}
export interface PassView { state: PassState; t: number; holder: "player" | string; to?: string; verified: number }
export interface GateSnapshot {
  phase: Phase; guards: GuardView[]; wicket: number; pass: PassView | null; playerGesture?: Gesture;
  /** Freeze the player's movement (the check is in progress). */
  lock: boolean; /** Face the player toward the lead guard (heading), or null. */ faceHeading: number | null;
  tapReady: boolean; hint: string | null; passed: boolean; surround: number; approvedAt: number;
  car: { x: number; y: number; rot: number }; leadId: string | null;
}
export interface GateOptions { rng?: () => number; onApproved?: () => void; passed?: boolean; /** First name and campus, so the welcome is personal. */ player?: { name: string; campus: string } }

export const GUARD_NAMES: Record<string, string> = { gateman: "Gate Man", g2: "Security", g3: "Security", g4: "Security", g5: "Security", g6: "Security" };
export const SURROUND_MIN = 2, SURROUND_MAX = 5;
const RUN = 1.6, WALK = 1.3, RING = 3.3, EPS = 0.06; // everyone walks: no sprinting at a new student (RUN is just the 'purposeful' walking pace)
export const T = { call: 0.5, askLine: 1.2, reach: 1.0, give: 0.8, inspect: 1.9, approve: 1.7, retPass: 0.7, unlatch: 1.0, wicketOpen: 1.3, wicketClose: 1.2, maxArrive: 9, repeat: 8 } as const;
const ease = (x: number) => { const c = Math.min(1, Math.max(0, x)); return c * c * (3 - 2 * c); };
const hd = (fx: number, fy: number, tx: number, ty: number) => Math.atan2(tx - fx, ty - fy);

interface G { id: string; post: { x: number; y: number }; x: number; y: number; face: number; tx: number; ty: number; speed: number; gesture?: Gesture; say?: string; sayUntil: number; moving: boolean }

export function createGateSecurity(opts: GateOptions = {}) {
  const rng = opts.rng ?? Math.random, who = opts.player?.name?.split(/\s+/)[0] ?? "", campus = opts.player?.campus ?? "campus", newcomer = !opts.passed;
  const guards: G[] = GATE.guardPosts.map((p) => ({ id: p.id, post: { x: p.x, y: p.y }, x: p.x, y: p.y, face: 0, tx: p.x, ty: p.y, speed: WALK, sayUntil: 0, moving: false }));
  const byId = (id: string) => guards.find((g) => g.id === id)!;
  const wk = GATE.wicket;
  const latch = { x: wk.x0 + 0.5, y: GATE.line + 1.1 };
  let phase: Phase = "idle", pt = 0, clock = 0, wicket = opts.passed ? 0 : 0, passed = !!opts.passed, approvedAt = -1;
  let lastP = { x: 0, y: 0 }; let lead: G | null = null, ring: G[] = [], surround = 0, pass: PassView | null = null, playerGesture: Gesture | undefined, lastRepeat = 0, welcomed = false;
  const say = (g: G, text: string, secs = 2.4) => { g.say = text; g.sayUntil = clock + secs; };
  const gest = (g: G, kind: GestureKind | null) => { if (!kind) { g.gesture = undefined; return; } if (g.gesture?.kind !== kind) g.gesture = { kind, t: 0 }; };
  const setPhase = (p: Phase) => { phase = p; pt = 0; };
  const sendHome = () => { for (const g of guards) { g.tx = g.post.x; g.ty = g.post.y; g.speed = WALK; } };

  function begin(px: number, py: number) {
    surround = SURROUND_MIN + Math.floor(rng() * (SURROUND_MAX - SURROUND_MIN + 1));
    const order = [...guards].sort((a, b) => Math.hypot(a.x - px, a.y - py) - Math.hypot(b.x - px, b.y - py));
    ring = order.slice(0, surround);
    const a0 = hd(px, py, GATE.centre.x, GATE.line), spread = [0, 1.57, 1.92, 2.27, 2.62][surround - 1] ?? 2.4;
    const slots = ring.map((_, i) => (ring.length === 1 ? 0 : (i / (ring.length - 1) - 0.5) * spread)).sort((a, b) => Math.abs(a) - Math.abs(b));
    ring.forEach((g, i) => { const a = a0 + slots[i]! + 0.34; // whole arc nudged off the player-gate line so the lead is never hidden behind the player's back (chase camera)
      g.tx = px + Math.sin(a) * RING; g.ty = Math.min(167.4, py + Math.cos(a) * RING); g.speed = RUN; });
    lead = ring[0]!; // nearest guard takes the centre slot
    say(lead, "Good day! Welcome 🙂", 2.6); gest(lead, "stop");
    setPhase("call");
  }

  function update(dt: number, player: { x: number; y: number }) {
    dt = Math.min(0.1, Math.max(0, dt)); clock += dt; pt += dt; lastP = { x: player.x, y: player.y };
    for (const g of guards) {
      if (g.sayUntil < clock) g.say = undefined;
      if (g.gesture) g.gesture.t += dt;
      const dx = g.tx - g.x, dy = g.ty - g.y, d = Math.hypot(dx, dy);
      g.moving = d > EPS;
      if (g.moving) { const s = Math.min(d, g.speed * dt); g.x += (dx / d) * s; g.y += (dy / d) * s; g.face = Math.atan2(dx, dy); }
    }
    if (playerGesture) playerGesture.t += dt;
    const facePlayer = (g: G) => { if (!g.moving) g.face = hd(g.x, g.y, player.x, player.y); };
    switch (phase) {
      case "idle": {
        for (const g of guards) if (!g.moving) g.face = g.id === "g6" || g.id === "g5" ? hd(g.x, g.y, player.x, player.y) : 0;
        if (passed) { const near = Math.hypot(player.x - (wk.x0 + wk.x1) / 2, player.y - GATE.line) < 8; wicket += ((near ? 1 : 0) - wicket) * Math.min(1, dt * 3);
          if (near && !welcomed && isOutsideGate(player.y)) { welcomed = true; say(byId("gateman"), "Welcome back!", 2.4); } if (!near) welcomed = false; }
        else if (inChallengeZone(player.x, player.y)) begin(player.x, player.y);
        break;
      }
      case "call": {
        for (const g of ring) facePlayer(g);
        const arrived = ring.every((g) => !g.moving);
        if ((arrived && pt > T.call) || pt > T.maxArrive) { for (const g of ring) facePlayer(g); say(lead!, newcomer ? "New here? May I see your Campus Pass, please?" : "May I see your Campus Pass, please?", 3.4); gest(lead!, "stop"); setPhase("ask"); }
        break;
      }
      case "ask": {
        for (const g of ring) facePlayer(g);
        if (pt > T.askLine) { playerGesture = { kind: "reach", t: 0 }; }
        if (pt > T.askLine + T.reach) { pass = { state: "out", t: 0, holder: "player", verified: 0 }; playerGesture = { kind: "hold", t: 0 }; lastRepeat = clock; setPhase("offer"); }
        break;
      }
      case "offer": {
        for (const g of ring) facePlayer(g);
        if (pass) pass.t += dt;
        if (clock - lastRepeat > T.repeat) { lastRepeat = clock; say(lead!, "Take your time. It's in your pocket.", 3); }
        break;
      }
      case "give": {
        pass!.t = Math.min(1, pt / T.give);
        if (pt >= T.give) { pass = { state: "held", t: 0, holder: lead!.id, verified: 0 }; playerGesture = undefined; gest(lead!, "inspect"); say(lead!, "Thank you. One moment…", 1.9); setPhase("inspect"); }
        break;
      }
      case "inspect": {
        if (pass) { pass.t += dt; pass.verified = ease((pt - 0.9) / 0.8); }
        if (pt >= T.inspect) { gest(lead!, "thumbs"); say(lead!, who ? `All good, ${who}! Welcome to ${campus}. 👍` : "All good. Welcome to campus! 👍", 3.4); approvedAt = clock; passed = true; opts.onApproved?.(); setPhase("approve"); }
        break;
      }
      case "approve": {
        if (pass) { pass.t += dt; pass.verified = 1; }
        if (pt > 0.3 && pass && pass.state === "held") pass = { state: "returning", t: 0, holder: lead!.id, to: "player", verified: 1 }; // card goes back while the thumbs-up stays up
        if (pass?.state === "returning") { pass.t = Math.min(1, (pt - 0.3) / T.retPass); }
        if (pt >= T.approve) {
          pass = null; gest(lead!, null);
          const gm = byId("gateman"); gm.tx = latch.x; gm.ty = latch.y; gm.speed = RUN; setPhase("open");
        }
        break;
      }
      case "open": {
        const gm = byId("gateman");
        if (!gm.moving && pt > 0.15) { if (!gm.gesture) { gest(gm, "beckon"); say(gm, "Please, come in. Enjoy your first day!", 3.2); sendHome(); gm.tx = latch.x; gm.ty = latch.y; } wicket = Math.min(1, wicket + dt / T.wicketOpen); }
        else for (const g of ring) if (g !== gm && !g.moving) { g.tx = g.post.x; g.ty = g.post.y; g.speed = WALK; }
        for (const g of ring) if (g !== gm) { g.tx = g.post.x; g.ty = g.post.y; g.speed = WALK; }
        if (wicket >= 1) setPhase("through");
        break;
      }
      case "through": {
        const gm = byId("gateman"); if (gm.gesture && gm.gesture.t > 2.5) gest(gm, null);
        const gone = player.y < GATE.line - 2.5 || player.y > GATE.line + 6;
        if ((gone && pt > 1.2) || pt > 25) { sendHome(); gm.speed = WALK; setPhase("done"); }
        break;
      }
      case "done": {
        const gm = byId("gateman");
        if (!gm.moving) gest(gm, null);
        wicket = player.y < GATE.line - 2 ? Math.max(0, wicket - dt / T.wicketClose) : wicket;
        if (wicket <= 0 || player.y < GATE.line - 2) { if (wicket <= 0) { ring = []; lead = null; setPhase("idle"); } }
        break;
      }
    }
    if (phase === "idle" && !passed) wicket = Math.max(0, wicket - dt / T.wicketClose);
  }

  /** The player tapped the pass (or pressed the hand-over key). Only meaningful while the pass is offered. */
  function tapPass(): boolean {
    if (phase !== "offer" || !pass) return false;
    pass = { state: "flying", t: 0, holder: "player", to: lead!.id, verified: 0 };
    playerGesture = { kind: "give", t: 0 }; gest(lead!, "take"); setPhase("give");
    return true;
  }

  function snapshot(): GateSnapshot {
    const lock = phase !== "idle" && phase !== "open" && phase !== "through" && phase !== "done";
    const officer = GATE.police.officer;
    const views: GuardView[] = guards.map((g) => ({ id: g.id, name: GUARD_NAMES[g.id] ?? "Security", kit: "guard", x: g.x, y: g.y, face: g.face, ...(g.gesture ? { gesture: g.gesture } : {}), ...(g.say ? { say: g.say } : {}), moving: g.moving }));
    views.push({ id: "police1", name: "Police", kit: "police", x: officer.x, y: officer.y, face: lastP.x || lastP.y ? hd(officer.x, officer.y, lastP.x, lastP.y) : 2.4, moving: false });
    return {
      phase, guards: views, wicket: ease(wicket), pass: pass ? { ...pass } : null, ...(playerGesture ? { playerGesture } : {}), lock,
      faceHeading: lock && lead ? hd(lastP.x, lastP.y, lead.x, lead.y) : null,
      tapReady: phase === "offer", hint: phase === "offer" ? "Tap your pass" : phase === "call" || phase === "ask" ? "Security check" : null,
      passed, surround, approvedAt, car: GATE.police.car, leadId: lead?.id ?? null,
    };
  }
  return { update, tapPass, snapshot, get phase() { return phase; }, get passed() { return passed; }, markPassed() { passed = true; } };
}
export type GateSecurity = ReturnType<typeof createGateSecurity>;
