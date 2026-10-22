import { describe, it, expect } from "vitest";
import { GATE, PLAYER_RADIUS } from "@campus/domain";
import { createGateSecurity, SURROUND_MAX, SURROUND_MIN } from "./gate-security";

const seeded = (n: number) => { let t = n >>> 0; return () => { t = (t + 0x6d2b79f5) >>> 0; let r = Math.imul(t ^ (t >>> 15), 1 | t); r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r; return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; };
type Gate = ReturnType<typeof createGateSecurity>;
const run = (g: Gate, secs: number, p: { x: number; y: number }, stop?: () => boolean, each?: () => void) => { for (let i = 0; i < secs * 60; i++) { g.update(1 / 60, p); each?.(); if (stop?.()) break; } };
const angDiff = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const toward = (from: { x: number; y: number }, to: { x: number; y: number }) => Math.atan2(to.x - from.x, to.y - from.y);

describe("gate security check", () => {
  it("stays idle far from the gate and while the player is inside", () => {
    const g = createGateSecurity({ rng: seeded(1) }); run(g, 3, { x: 60, y: 170 }); expect(g.phase).toBe("idle");
    run(g, 3, { x: 60, y: 100 }); expect(g.phase).toBe("idle");
  });

  it("sends 2-5 guards straight at you, always facing you, then waits for the pass", () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 40; seed++) {
      let approved = 0; const g = createGateSecurity({ rng: seeded(seed), onApproved: () => approved++ }); const p = { x: 60, y: 145 };
      g.update(1 / 60, p); expect(g.phase).toBe("call");
      const n = g.snapshot().surround; expect(n).toBeGreaterThanOrEqual(SURROUND_MIN); expect(n).toBeLessThanOrEqual(SURROUND_MAX); seen.add(n);
      let worst = 0;
      run(g, 25, p, () => g.phase === "offer", () => { for (const q of g.snapshot().guards) if (q.kit === "guard" && q.id !== "gateman" && q.moving) worst = Math.max(worst, angDiff(q.face, toward(q, p))); });
      expect(g.phase).toBe("offer"); expect(worst).toBeLessThan(0.05); // never looks sideways while coming to you
      const s = g.snapshot(); expect(s.tapReady).toBe(true); expect(s.pass?.state).toBe("out"); expect(approved).toBe(0);
      const near = s.guards.filter((q) => q.kit === "guard" && q.id !== "gateman" && Math.hypot(q.x - p.x, q.y - p.y) < 3.9).length; expect(near).toBe(n);
      for (const q of s.guards.filter((q) => q.kit === "guard" && q.id !== "gateman" && Math.hypot(q.x - p.x, q.y - p.y) < 3.9)) expect(angDiff(q.face, toward(q, p))).toBeLessThan(0.05);
      run(g, 10, p); expect(g.phase).toBe("offer"); // never approves without a tap
      expect(g.tapPass()).toBe(true); expect(g.tapPass()).toBe(false);
      run(g, 30, p, () => g.phase === "open"); expect(approved).toBe(1); expect(g.passed).toBe(true);
    }
    expect(seen.size).toBeGreaterThanOrEqual(3); // the count really varies
  });

  it("passes the card hand to hand: it is always held, never thrown, and the hands really meet", () => {
    const g = createGateSecurity({ rng: seeded(5) }); const p = { x: 60, y: 145 }; const states: string[] = []; let meet = 99, far = 0;
    run(g, 25, p, () => g.phase === "offer"); g.tapPass();
    run(g, 30, p, () => g.phase === "open", () => {
      const s = g.snapshot(), st = s.pass?.state ?? "none"; if (states[states.length - 1] !== st) states.push(st);
      if (st === "handover" || st === "returning") { const l = s.guards.find((q) => q.id === s.leadId)!; const d = Math.hypot(l.x - p.x, l.y - p.y); meet = Math.min(meet, d); far = Math.max(far, d); }
    });
    expect(states).toEqual(["out", "handover", "held", "returning", "pocketing", "none"]);
    expect(meet).toBeLessThan(1.45); expect(far).toBeLessThan(1.5); // hands can reach each other; no throw across the ring
  });

  it("gate man presses the pier button, the wide wicket opens, he steps clear, you walk through, then it closes", () => {
    const g = createGateSecurity({ rng: seeded(7) }); const p = { x: 60, y: 145 };
    run(g, 25, p, () => g.phase === "offer"); g.tapPass();
    run(g, 40, p, () => g.phase === "through"); expect(g.phase).toBe("through"); expect(g.snapshot().lock).toBe(false); expect(g.snapshot().wicket).toBeGreaterThan(0.95);
    const gm = g.snapshot().guards.find((q) => q.id === "gateman")!; expect(gm.x).toBeLessThan(GATE.wicket.x0); // clear of the opening
    const inside = { x: 68, y: 120 }; run(g, 15, inside, () => g.phase === "idle"); expect(g.phase).toBe("idle"); run(g, 25, inside);
    expect(g.snapshot().guards.every((q) => q.kit === "police" || Math.hypot(q.x - GATE.guardPosts.find((s) => s.id === q.id)!.x, q.y - GATE.guardPosts.find((s) => s.id === q.id)!.y) < 0.2)).toBe(true);
  });

  it("the small gate is wide enough to walk through without precision", () => {
    expect(GATE.wicket.x1 - GATE.wicket.x0 - 2 * PLAYER_RADIUS).toBeGreaterThan(2.2);
  });

  it("has exactly one police officer and one patrol car, and the officer is not hostile (no stare from afar)", () => {
    const g = createGateSecurity({ rng: seeded(3) }); g.update(1 / 60, { x: 60, y: 183 }); const s = g.snapshot();
    expect(s.guards.filter((q) => q.kit === "police")).toHaveLength(1); expect(s.car.x).toBeGreaterThan(60);
    expect(angDiff(s.guards.find((q) => q.kit === "police")!.face, 0)).toBeLessThan(0.01);
  });
});
