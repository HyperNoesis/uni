import { describe, expect, it } from "vitest";
import { ActivityError, ActivityRunner, type Activity } from "./activity";
import { SnapshotBuffer, lerp, reconcile } from "./interpolation";
import { FLAG_DEFAULTS, resolveFlags } from "./flags";
import { TokenBucket } from "./ratelimit";

const toy: Activity<{ n: number }, number, number> = {
  id: "toy",
  startActivity: () => ({ n: 0 }),
  validateAction: (_s, a) => (a >= 0 ? { ok: true } : { ok: false, reason: "negative" }),
  tick: (s) => ({ n: s.n + 1 }),
  complete: (s) => s.n,
  reward: () => ({ coins: 9999, reputation: -5 }),
};
let i = 0;
const mk = () => new ActivityRunner(toy, { maxActionsPerRun: 2, runTtlMs: 1000, maxCoins: 50, maxReputation: 10, newId: () => `r${++i}` });
const ctx = (playerId = "p1", now = 0) => ({ playerId, now });

describe("ActivityRunner", () => {
  it("clamps rewards the adapter returns", () => {
    const r = mk();
    const { runId } = r.start(ctx());
    const { reward } = r.finish(runId, ctx());
    expect(reward.coins).toBe(50);
    expect(reward.reputation).toBe(0);
  });
  it("rejects other players, replays, invalid and excess actions, and expiry", () => {
    const r = mk();
    const { runId } = r.start(ctx());
    expect(() => r.act(runId, 1, ctx("p2"))).toThrow(ActivityError);
    expect(() => r.act(runId, -1, ctx())).toThrow(ActivityError);
    r.act(runId, 1, ctx());
    r.act(runId, 1, ctx());
    expect(() => r.act(runId, 1, ctx())).toThrow(ActivityError);
    r.finish(runId, ctx());
    expect(() => r.finish(runId, ctx())).toThrow(ActivityError);
    const late = r.start(ctx());
    expect(() => r.finish(late.runId, ctx("p1", 5000))).toThrow(ActivityError);
  });
});

describe("interpolation", () => {
  it("lerps and clamps", () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(lerp(0, 10, 2)).toBe(10);
  });
  it("samples between snapshots and holds at the edges", () => {
    const b = new SnapshotBuffer();
    b.push({ t: 100, x: 10, y: 0 });
    b.push({ t: 0, x: 0, y: 0 });
    expect(b.sample(50)).toEqual({ x: 5, y: 0 });
    expect(b.sample(-5)).toEqual({ x: 0, y: 0 });
    expect(b.sample(500)).toEqual({ x: 10, y: 0 });
    expect(new SnapshotBuffer().sample(1)).toBe(null);
  });
  it("snaps on large drift and blends on small drift", () => {
    expect(reconcile({ x: 0, y: 0 }, { x: 10, y: 0 }).snapped).toBe(true);
    expect(reconcile({ x: 0, y: 0 }, { x: 1, y: 0 }).snapped).toBe(false);
  });
});

describe("flags", () => {
  it("defaults everything off", () => {
    expect(Object.values(resolveFlags(undefined)).some(Boolean)).toBe(false);
  });
  it("applies valid overrides and ignores junk", () => {
    expect(resolveFlags('{"shop":true,"bogus":true,"aiNpc":"yes"}').shop).toBe(true);
    expect(resolveFlags('{"shop":true,"aiNpc":"yes"}').aiNpc).toBe(FLAG_DEFAULTS.aiNpc);
    expect(resolveFlags("{not json").shop).toBe(false);
  });
});

describe("TokenBucket", () => {
  it("limits bursts and refills over time", () => {
    let t = 0;
    const b = new TokenBucket(2, 1, () => t);
    expect(b.take()).toBe(true);
    expect(b.take()).toBe(true);
    expect(b.take()).toBe(false);
    t = 1000;
    expect(b.take()).toBe(true);
  });
});
