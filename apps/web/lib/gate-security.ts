/* Grand Gate entry check: guards, pass, wicket. Pure state machine (no DOM, no renderer import), deterministic given an rng.
 * The page feeds the player's position every frame and renders `snapshot()`; the renderer draws guards as normal skinned entities
 * and turns `gesture` / `pass` / `wicket` into poses and props. Server authority is separate: the page sends `gate_pass` on approval.
 * Coordinates are world tiles: x, y (y == world z). The arrival side is +y; heading 0 faces +y.
 *
 * Choreography (calm, respectful, hand to hand; nothing is thrown or flies):
 *   idle     guards stand at their posts looking out at the road
 *   call     2-5 guards walk straight toward you, FACING you the whole way, and stop a polite distance away; the lead greets you
 *   ask      the lead asks for your Campus Pass; you reach into your pocket and draw it out
 *   offer    you hold the card out and wait (tap / E to hand it over)
 *   give     the lead steps in; your hand and his meet; the card changes hands
 *   inspect  the lead reads the card
 *   approve  he hands it straight back, you pocket it, he gives a thumbs up and steps back
 *   open     the gate man presses the pier button; the two-leaf wicket swings wide and he steps clear, inviting you in
 *   through  you walk in; then the wicket closes
 */
import { GATE, inChallengeZone, isOutsideGate } from "@campus/domain";

export type GestureKind = "stop" | "reach" | "hold" | "give" | "take" | "inspect" | "thumbs" | "beckon" | "wave";
export interface Gesture { kind: GestureKind; t: number }
export type Phase = "idle" | "call" | "ask" | "offer" | "give" | "inspect" | "approve" | "open" | "through" | "done";
/** drawing: pocket -> your hand · out: in your hand · handover: your hand -> his (holder switches mid-way) · held: in the guard's hand ·
 *  returning: his hand -> yours · pocketing: your hand -> pocket. The renderer keeps the card attached to a hand at all times. */
export type PassState = "hidden" | "drawing" | "out" | "handover" | "held" | "returning" | "pocketing";
export interface GuardView {
  id: string; name: string; kit: "guard" | "police"; x: number; y: number;
  /** Heading the body faces (radians, 0 faces +y). Always set; the renderer uses it for staff even while they walk. */
  face: number; gesture?: Gesture; say?: string; moving: boolean;
}
export interface PassView { state: PassState; t: number; holder: "player" | string; verified: number }
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
export const GATE_CAMPUS = "Rejuvini Campus";
const WALK = 1.45, STEP = 0.9, EPS = 0.05, LEAD_DIST = 2.2, HAND_DIST = 1.28;
export const T = { greet: 1.5, askLine: 1.5, reach: 0.9, draw: 0.7, give: 1.7, inspect: 1.9, approve: 3.4, unlatch: 1.0, wicketOpen: 1.6, wicketClose: 1.6, maxArrive: 14, repeat: 9 } as const;
const ease = (x: number) => { const c = Math.min(1, Math.max(0, x)); return c * c * (3 - 2 * c); };
const hd = (fx: number, fy: number, tx: number, ty: number) => Math.atan2(tx - fx, ty - fy);
const MAX_Y = 190;

type Mode = "post" | "watch" | "home";
interface G { id: string; post: { x: number; y: number }; x: number; y: number; face: number; tx: number; ty: number; speed: number; mode: Mode; gesture?: Gesture; say?: string; sayUntil: number; moving: boolean }

export function createGateSecurity(opts: GateOptions = {}) {
  const rng = opts.rng ?? Math.random, who = opts.player?.name?.split(/\s+/)[0] ?? "", newcomer = !opts.passed;
  const guards: G[] = GATE.guardPosts.map((p) => ({ id: p.id, post: { x: p.x, y: p.y }, x: p.x, y: p.y, face: 0, tx: p.x, ty: p.y, speed: WALK, mode: "post", sayUntil: 0, moving: false }));
  const byId = (id: string) => guards.find((g) => g.id === id)!;
  const wk = GATE.wicket, wicketMid = (wk.x0 + wk.x1) / 2;
  /** Where the gate man stands to press the pier button (just outside the gate, beside the car-gate pier). */
  const button = { x: GATE.pier.x0 - 0.75, y: GATE.line + 1.05 };
  /** Where he waits, clear of the opening, once the leaves are open. */
  const aside = { x: GATE.pier.x0 - 1.7, y: GATE.line + 1.6 };
  const officer = GATE.police.officer;
  let phase: Phase = "idle", pt = 0, clock = 0, wicket = 0, passed = !!opts.passed, approvedAt = -1, locked = false;
  let lastP = { x: 0, y: 0 }; let lead: G | null = null, ring: G[] = [], surround = 0, pass: PassView | null = null, playerGesture: Gesture | undefined, lastRepeat = 0, welcomed = false;
  let officerGesture: Gesture | undefined, officerWaved = false, greeted = false, transferred = false, returned = false, pocketed = false, thumbs = false, steppedBack = false, pressed = false;
  const say = (g: G, text: string, secs = 2.6) => { g.say = text; g.sayUntil = clock + secs; };
  const gest = (g: G, kind: GestureKind | null) => { if (!kind) { g.gesture = undefined; return; } if (g.gesture?.kind !== kind) g.gesture = { kind, t: 0 }; };
  const setPhase = (p: Phase) => { phase = p; pt = 0; };
  const goto = (g: G, x: number, y: number, speed: number, mode: Mode) => { g.tx = x; g.ty = Math.min(MAX_Y, y); g.speed = speed; g.mode = mode; };
  const sendHome = (g: G) => goto(g, g.post.x, g.post.y, WALK, "home");

  /** Slots on the straight line from each guard to the player, so every guard walks forward, looking at you. Separated so nobody overlaps. */
  function plan(px: number, py: number) {
    ring.forEach((g, i) => {
      const dx = px - g.x, dy = py - g.y, d = Math.hypot(dx, dy) || 1, r = g === lead ? LEAD_DIST : 2.9 + (i % 2) * 0.55;
      goto(g, px - (dx / d) * r, py - (dy / d) * r, WALK, "watch");
    });
    for (let k = 0; k < 4; k++) for (let i = 0; i < ring.length; i++) for (let j = i + 1; j < ring.length; j++) {
      const a = ring[i]!, b = ring[j]!, dx = b.tx - a.tx, dy = b.ty - a.ty, d = Math.hypot(dx, dy);
      if (d < 1.35) {
        const need = 1.35 - d, ux = d > 1e-3 ? dx / d : 1, uy = d > 1e-3 ? dy / d : 0, shift = (g: G, k: number) => { g.tx += ux * need * k; g.ty = Math.min(MAX_Y, g.ty + uy * need * k); };
        if (a === lead) shift(b, 1); else if (b === lead) shift(a, -1); else { shift(a, -0.5); shift(b, 0.5); } // the lead keeps the centre slot
      }
    }
  }

  function begin(px: number, py: number) {
    surround = SURROUND_MIN + Math.floor(rng() * (SURROUND_MAX - SURROUND_MIN + 1));
    const pool = guards.filter((g) => g.id !== "gateman").sort((a, b) => Math.hypot(a.x - px, a.y - py) - Math.hypot(b.x - px, b.y - py));
    ring = pool.slice(0, Math.min(surround, pool.length)); surround = ring.length;
    lead = ring[0]!; // the guard nearest to you steps up as the lead
    locked = false; greeted = false; transferred = returned = pocketed = thumbs = steppedBack = pressed = false;
    plan(px, py); setPhase("call");
  }

  function update(dt: number, player: { x: number; y: number }) {
    dt = Math.min(0.1, Math.max(0, dt)); clock += dt; pt += dt; lastP = { x: player.x, y: player.y };
    for (const g of guards) {
      if (g.sayUntil < clock) g.say = undefined;
      if (g.gesture) g.gesture.t += dt;
      const dx = g.tx - g.x, dy = g.ty - g.y, d = Math.hypot(dx, dy);
      g.moving = d > EPS;
      if (g.moving) { const s = Math.min(d, g.speed * dt); g.x += (dx / d) * s; g.y += (dy / d) * s; }
      // facing: whoever is dealing with you looks at you, always (walking or standing); everyone else faces where they walk, or out at the road
      if (g.mode === "watch") g.face = hd(g.x, g.y, player.x, player.y);
      else if (g.moving) g.face = Math.atan2(dx, dy);
      else if (g.mode === "post") g.face = idleFace(g, player);
    }
    if (officerGesture) officerGesture.t += dt;
    if (playerGesture) playerGesture.t += dt;
    if (pass) pass.t += dt;
    switch (phase) {
      case "idle": {
        if (passed) { const near = Math.hypot(player.x - wicketMid, player.y - GATE.line) < 8; wicket += ((near ? 1 : 0) - wicket) * Math.min(1, dt * 2.4);
          if (near && !welcomed && isOutsideGate(player.y)) { welcomed = true; say(byId("gateman"), "Welcome back!", 2.4); } if (!near) welcomed = false; }
        else if (inChallengeZone(player.x, player.y)) begin(player.x, player.y);
        break;
      }
      case "call": {
        if (!locked) plan(player.x, player.y); // slots follow you until the lead is close
        const dl = Math.hypot(lead!.x - player.x, lead!.y - player.y);
        if (!greeted && dl < 4.2) { greeted = true; gest(lead!, "wave"); say(lead!, `Good day! Welcome to ${GATE_CAMPUS}.`, 3); }
        if (dl < 3.4) locked = true;
        if (greeted && lead!.gesture?.kind === "wave" && lead!.gesture.t > 1.3) gest(lead!, null);
        const arrived = ring.every((g) => !g.moving);
        if (locked && ((arrived && pt > 0.6) || pt > T.maxArrive)) { for (const g of ring) { g.tx = g.x; g.ty = g.y; } setPhase("ask"); say(lead!, newcomer ? "Are you new here? May I see your Campus Pass, please?" : "May I see your Campus Pass, please?", 3.6); gest(lead!, "stop"); }
        else if (!locked && pt > T.maxArrive) locked = true;
        break;
      }
      case "ask": {
        if (pt > T.askLine && !playerGesture) playerGesture = { kind: "reach", t: 0 };
        if (pt > T.askLine + T.reach && !pass) pass = { state: "drawing", t: 0, holder: "player", verified: 0 };
        if (pass?.state === "drawing" && pass.t >= T.draw) { pass = { state: "out", t: 0, holder: "player", verified: 0 }; playerGesture = { kind: "hold", t: 0 }; gest(lead!, null); lastRepeat = clock; setPhase("offer"); }
        break;
      }
      case "offer": {
        if (clock - lastRepeat > T.repeat) { lastRepeat = clock; say(lead!, "Take your time. No rush.", 3); }
        break;
      }
      case "give": {
        // the lead steps in until hands can meet, both arms come forward, the card changes hands in the middle
        const dir = hd(player.x, player.y, lead!.x, lead!.y), want = { x: player.x + Math.sin(dir) * HAND_DIST, y: player.y + Math.cos(dir) * HAND_DIST };
        if (!lead!.moving || Math.hypot(lead!.tx - want.x, lead!.ty - want.y) > 0.05) goto(lead!, want.x, want.y, STEP, "watch");
        const close = Math.hypot(lead!.x - player.x, lead!.y - player.y) < HAND_DIST + 0.12;
        if (close && !transferred && pt > 0.9 && pass) { transferred = true; pass = { state: "handover", t: 0, holder: "player", verified: 0 }; }
        if (pass?.state === "handover" && pass.t > 0.32 && pass.holder === "player") pass.holder = lead!.id;
        if (pass?.state === "handover" && pass.t > 0.6) { pass = { state: "held", t: 0, holder: lead!.id, verified: 0 }; playerGesture = undefined; gest(lead!, "inspect"); say(lead!, "Thank you. One moment…", 2); setPhase("inspect"); }
        if (pt > 8 && !transferred) { transferred = true; pass = { state: "handover", t: 0, holder: "player", verified: 0 }; } // never stall
        break;
      }
      case "inspect": {
        if (pass) pass.verified = ease((pt - 0.8) / 0.8);
        if (pt >= T.inspect) { passed = true; approvedAt = clock; opts.onApproved?.(); returned = pocketed = thumbs = false; setPhase("approve"); }
        break;
      }
      case "approve": {
        if (pass) pass.verified = 1;
        // 0.1 s: hand the card straight back
        if (pt > 0.1 && !returned && pass) { returned = true; pass = { state: "returning", t: 0, holder: lead!.id, verified: 1 }; gest(lead!, "give"); playerGesture = { kind: "take", t: 0 }; }
        if (pass?.state === "returning" && pass.t > 0.45 && pass.holder !== "player") pass.holder = "player";
        if (pass?.state === "returning" && pass.t > 0.9) { pass = { state: "pocketing", t: 0, holder: "player", verified: 1 }; gest(lead!, null); playerGesture = { kind: "hold", t: 0 }; }
        if (pass?.state === "pocketing" && pass.t > 0.7) { pass = null; pocketed = true; playerGesture = undefined; }
        if (pocketed && !thumbs && pt > 2.0) { thumbs = true; gest(lead!, "thumbs"); say(lead!, who ? `All good, ${who}! Welcome to ${GATE_CAMPUS}. 👍` : `All good! Welcome to ${GATE_CAMPUS}. 👍`, 3.2); }
        if (thumbs && !steppedBack && pt > 2.6) { steppedBack = true; const dir = hd(player.x, player.y, lead!.x, lead!.y); goto(lead!, player.x + Math.sin(dir) * 2.6, player.y + Math.cos(dir) * 2.6, STEP, "watch"); }
        if (pt >= T.approve) { gest(lead!, null); for (const g of ring) if (g !== lead) sendHome(g); const gm = byId("gateman"); goto(gm, button.x, button.y, WALK, "home"); setPhase("open"); }
        break;
      }
      case "open": {
        const gm = byId("gateman");
        if (pt > 0.8 && lead && lead.mode === "watch") sendHome(lead);
        const there = Math.hypot(gm.x - button.x, gm.y - button.y) < 0.12;
        if (there && !pressed) { pressed = true; gm.face = hd(gm.x, gm.y, GATE.pier.x0, GATE.line); gest(gm, "take"); pt = Math.min(pt, 0.5); }
        if (pressed) {
          gm.face = hd(gm.x, gm.y, GATE.pier.x0, GATE.line);
          if (pt > T.unlatch) wicket = Math.min(1, wicket + dt / T.wicketOpen);
          if (pt > T.unlatch + 0.4 && gm.gesture?.kind === "take") { gest(gm, "beckon"); say(gm, "Please, come in. Enjoy your first day!", 3.4); goto(gm, aside.x, aside.y, STEP, "post"); gm.mode = "watch"; }
        }
        if (wicket >= 1) setPhase("through");
        break;
      }
      case "through": {
        const gm = byId("gateman"); gm.mode = "post"; gm.face = hd(gm.x, gm.y, player.x, player.y);
        if (gm.gesture && gm.gesture.t > 3) gest(gm, null);
        const gone = player.y < GATE.line - 2.5 || player.y > GATE.line + 6 || (player.y < GATE.line - 0.5);
        if ((gone && pt > 1.0) || pt > 30) { sendHome(gm); setPhase("done"); }
        break;
      }
      case "done": {
        const gm = byId("gateman");
        if (!gm.moving) { gest(gm, null); gm.mode = "post"; }
        wicket = player.y < GATE.line - 2 ? Math.max(0, wicket - dt / T.wicketClose) : wicket;
        if (wicket <= 0 || player.y < GATE.line - 2) { if (wicket <= 0) { ring = []; lead = null; locked = false; setPhase("idle"); } }
        break;
      }
    }
    // the officer nods along: he watches the road, glances at you when you are close, and gives a small friendly wave once you are approved
    if (passed && !officerWaved && phase === "approve" && pt > 2.6) { officerWaved = true; officerGesture = { kind: "wave", t: 0 }; }
    if (officerGesture && officerGesture.t > 2.4) officerGesture = undefined;
    if (phase === "idle" && !passed) wicket = Math.max(0, wicket - dt / T.wicketClose);
  }

  function idleFace(g: G, player: { x: number; y: number }) { // posted guards stand looking out at the road; they only turn when you come right up
    const d = Math.hypot(player.x - g.x, player.y - g.y);
    return d < 9 ? hd(g.x, g.y, player.x, player.y) : 0;
  }

  /** The player tapped the pass (or pressed the hand-over key). Only meaningful while the pass is offered. */
  function tapPass(): boolean {
    if (phase !== "offer" || !pass) return false;
    pass = { state: "out", t: 0, holder: "player", verified: 0 };
    playerGesture = { kind: "give", t: 0 }; gest(lead!, "take"); say(lead!, "Thank you.", 1.4); transferred = false; setPhase("give");
    return true;
  }

  function snapshot(): GateSnapshot {
    const lock = phase !== "idle" && phase !== "through" && phase !== "done" && !(phase === "open" && wicket >= 0.85) && !(phase === "call" && !locked);
    const faceP = lastP.x || lastP.y ? hd(officer.x, officer.y, lastP.x, lastP.y) : 0, near = Math.hypot(lastP.x - officer.x, lastP.y - officer.y) < 10;
    const views: GuardView[] = guards.map((g) => ({ id: g.id, name: GUARD_NAMES[g.id] ?? "Security", kit: "guard", x: g.x, y: g.y, face: g.face, ...(g.gesture ? { gesture: g.gesture } : {}), ...(g.say ? { say: g.say } : {}), moving: g.moving }));
    views.push({ id: "police1", name: "Police", kit: "police", x: officer.x, y: officer.y, face: near || officerGesture ? faceP : 0, ...(officerGesture ? { gesture: officerGesture } : {}), moving: false });
    return {
      phase, guards: views, wicket: ease(wicket), pass: pass ? { ...pass } : null, ...(playerGesture ? { playerGesture } : {}), lock,
      faceHeading: lock && lead ? hd(lastP.x, lastP.y, lead.x, lead.y) : null,
      tapReady: phase === "offer", hint: phase === "offer" ? "Hand over your pass" : phase === "call" || phase === "ask" ? "Security check" : phase === "through" ? "Walk through the small gate" : null,
      passed, surround, approvedAt, car: GATE.police.car, leadId: lead?.id ?? null,
    };
  }
  return { update, tapPass, snapshot, get phase() { return phase; }, get passed() { return passed; }, markPassed() { passed = true; } };
}
export type GateSecurity = ReturnType<typeof createGateSecurity>;
