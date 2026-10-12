import { describe, it, expect } from "vitest";
import { FrameSampler, QualityGovernor, percentile, summarize } from "./perf-sampler";

describe("perf sampler", () => {
  it("percentile / summary are correct", () => {
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 50)).toBe(5);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95)).toBe(10);
    const r = summarize([...Array(95).fill(16), ...Array(5).fill(40)]);
    expect(r.samples).toBe(100); expect(r.p50Ms).toBe(16); expect(r.p99Ms).toBe(40); expect(r.over33Pct).toBe(5); expect(r.fpsAvg).toBeGreaterThan(55);
  });
  it("ignores garbage frames and handles empty", () => { expect(summarize([NaN, -1, 0, 9999]).samples).toBe(0); expect(summarize([]).fpsAvg).toBe(0); });
  it("records exactly one window then stops", () => {
    const s = new FrameSampler(1000); s.start(0);
    let rep = null; for (let t = 16; t <= 1100 && !rep; t += 16) rep = s.push(16, t);
    expect(rep?.samples).toBeGreaterThan(55); expect(s.recording).toBe(false); expect(s.push(16, 2000)).toBeNull();
  });
  it("governor upgrades only after sustained headroom", () => {
    const g = new QualityGovernor(3); let now = 0;
    expect(g.observe(5, 20, now += 1000)).toBe(false); expect(g.observe(5, 20, now += 1000)).toBe(false); expect(g.observe(5, 20, now += 1000)).toBe(true);
  });
  it("one slow window resets the streak", () => { const g = new QualityGovernor(3); g.observe(5, 20, 1); g.observe(5, 20, 2); g.observe(30, 20, 3); expect(g.observe(5, 20, 4)).toBe(false); });
  it("never upgrades during cooldown or after repeated downgrades", () => {
    const g = new QualityGovernor(1, .55, 1000, 2); g.noteDowngrade(0); expect(g.observe(1, 20, 500)).toBe(false); expect(g.observe(1, 20, 1500)).toBe(true);
    g.noteDowngrade(2000); g.noteDowngrade(3000); expect(g.observe(1, 20, 999999)).toBe(false);
  });
});
