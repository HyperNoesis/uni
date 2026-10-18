import { describe, it, expect } from "vitest";
import { GATE } from "@campus/domain";
import { createGateSecurity, SURROUND_MAX, SURROUND_MIN } from "./gate-security";

const seeded = (n: number) => { let t = n >>> 0; return () => { t = (t + 0x6d2b79f5) >>> 0; let r = Math.imul(t ^ (t >>> 15), 1 | t); r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r; return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; };
const run = (g: ReturnType<typeof createGateSecurity>, secs: number, p: { x: number; y: number }, stop?: () => boolean) => { for (let i = 0; i < secs * 60; i++) { g.update(1 / 60, p); if (stop?.()) break; } };

describe("gate security check", () => {
  it("stays idle far from the gate and while the player is inside", () => {
    const g = createGateSecurity({ rng: seeded(1) }); run(g, 3, { x: 60, y: 148 }); expect(g.phase).toBe("idle");
    run(g, 3, { x: 60, y: 100 }); expect(g.phase).toBe("idle");
  });
  it("challenges, surrounds with a random 2-5 guards, offers the pass, and only then approves", () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 40; seed++) {
      let approved = 0; const g = createGateSecurity({ rng: seeded(seed), onApproved: () => approved++ }); const p = { x: 60, y: 140 };
      run(g, 1, p); expect(g.snapshot().lock).toBe(true); expect(g.phase).toBe("call");
      const n = g.snapshot().surround; expect(n).toBeGreaterThanOrEqual(SURROUND_MIN); expect(n).toBeLessThanOrEqual(SURROUND_MAX); seen.add(n);
      run(g, 12, p, () => g.phase === "offer"); expect(g.phase).toBe("offer");
      const s = g.snapshot(); expect(s.tapReady).toBe(true); expect(s.pass?.state).toBe("out"); expect(approved).toBe(0);
      const ringed = s.guards.filter((q) => Math.hypot(q.x - p.x, q.y - p.y) < 3.9 && q.kit === "guard").length; expect(ringed).toBe(n);
      run(g, 10, p); expect(g.phase).toBe("offer"); // never approves without a tap
      expect(g.tapPass()).toBe(true); expect(g.tapPass()).toBe(false);
      run(g, 20, p, () => g.phase === "open"); expect(approved).toBe(1); expect(g.passed).toBe(true);
    }
    expect(seen.size).toBeGreaterThanOrEqual(3); // the count really varies
  });
  it("walks the gate man to the wicket, opens it, lets the player through, then closes it", () => {
    const g = createGateSecurity({ rng: seeded(7) }); const p = { x: 60, y: 140 };
    run(g, 1, p, () => false); run(g, 12, p, () => g.phase === "offer"); g.tapPass();
    run(g, 20, p, () => g.phase === "through"); expect(g.phase).toBe("through"); expect(g.snapshot().lock).toBe(false); expect(g.snapshot().wicket).toBeGreaterThan(0.95);
    const gm = g.snapshot().guards.find((q) => q.id === "gateman")!; expect(Math.hypot(gm.x - (GATE.wicket.x0 + 0.5), gm.y - (GATE.line + 1.1))).toBeLessThan(0.3);
    const inside = { x: 68.5, y: 120 }; run(g, 12, inside, () => g.phase === "idle"); expect(g.phase).toBe("idle"); run(g, 25, inside);
    expect(g.snapshot().guards.every((q) => q.kit === "police" || Math.hypot(q.x - GATE.guardPosts.find((s) => s.id === q.id)!.x, q.y - GATE.guardPosts.find((s) => s.id === q.id)!.y) < 0.2)).toBe(true);
  });
  it("has exactly one police officer and one patrol car", () => {
    const s = createGateSecurity({ rng: seeded(3) }).snapshot(); expect(s.guards.filter((q) => q.kit === "police")).toHaveLength(1); expect(s.car.x).toBeGreaterThan(60);
  });
});
