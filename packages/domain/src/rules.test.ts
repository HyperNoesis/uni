import { describe, expect, it } from "vitest";
import { scoreReaction, validateMove, withinRange } from "./rules";
import { signToken, verifyToken } from "./token";
import { WORLD } from "./world";

describe("scoreReaction", () => {
  it("rejects sub-human reactions", () => {
    expect(scoreReaction(10)).toEqual({ coins: 0, reputation: 0, tooEarly: true });
    expect(scoreReaction(-50).tooEarly).toBe(true);
    expect(scoreReaction(NaN).tooEarly).toBe(true);
  });
  it("pays more for faster reactions", () => {
    expect(scoreReaction(200).coins).toBeGreaterThan(scoreReaction(500).coins);
    expect(scoreReaction(500).coins).toBeGreaterThan(scoreReaction(2000).coins);
  });
});

describe("validateMove", () => {
  const bounds = { width: WORLD.width, height: WORLD.height };
  it("accepts plausible movement", () => {
    const r = validateMove({ x: 10, y: 10 }, { x: 10.5, y: 10 }, 100, WORLD.maxSpeed, WORLD.speedTolerance, bounds);
    expect(r.corrected).toBe(false);
  });
  it("clamps teleports to max speed", () => {
    const r = validateMove({ x: 10, y: 10 }, { x: 100, y: 10 }, 100, WORLD.maxSpeed, WORLD.speedTolerance, bounds);
    expect(r.corrected).toBe(true);
    expect(r.x).toBeLessThan(12);
  });
  it("rejects NaN", () => {
    const r = validateMove({ x: 1, y: 1 }, { x: NaN, y: 0 }, 100, WORLD.maxSpeed, WORLD.speedTolerance, bounds);
    expect(r).toMatchObject({ x: 1, y: 1, corrected: true });
  });
  it("does not allow banking idle time", () => {
    const r = validateMove({ x: 0, y: 0 }, { x: 50, y: 0 }, 60_000, WORLD.maxSpeed, WORLD.speedTolerance, bounds);
    expect(r.x).toBeLessThan(5);
  });
});

describe("withinRange", () => {
  it("checks euclidean distance", () => {
    expect(withinRange(0, 0, 3, 4, 5)).toBe(true);
    expect(withinRange(0, 0, 3, 4, 4.9)).toBe(false);
  });
});

describe("tokens", () => {
  it("round-trips and rejects tampering/expiry", () => {
    const t = signToken({ sub: "p1", exp: Date.now() + 1000 }, "s");
    expect(verifyToken(t, "s")?.sub).toBe("p1");
    expect(verifyToken(t, "other")).toBeNull();
    expect(verifyToken(t + "x", "s")).toBeNull();
    expect(verifyToken(signToken({ sub: "p1", exp: 1 }, "s"), "s")).toBeNull();
  });
});
