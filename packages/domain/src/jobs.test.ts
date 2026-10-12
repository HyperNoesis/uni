import { describe, expect, it } from "vitest";
import { INTERACTION_POINTS } from "./world";
import { JOBS, JOB_BY_ID, SHIFT, buildShift, scoreShift } from "./jobs";
import { levelFor, dailyQuestIds, dayKey } from "./progression";

describe("jobs content", () => {
  it("has enough distinct tasks with four distinct options and a known workplace point", () => {
    for (const j of JOBS) {
      expect(j.tasks.length).toBeGreaterThanOrEqual(10);
      for (const t of j.tasks) expect(new Set([t.right, ...t.wrong]).size).toBe(4);
      expect(INTERACTION_POINTS.some((p) => p.id === j.site && p.activity === "shift")).toBe(true);
    }
    expect(INTERACTION_POINTS.some((p) => p.id === "job_center" && p.activity === "jobs")).toBe(true);
  });
  it("builds shifts whose answer index points at the right option", () => {
    let s = 5; const rng = () => ((s = (s * 48271) % 2147483647) / 2147483647);
    for (const j of JOBS) {
      const shift = buildShift(j, rng);
      expect(new Set(shift.map((x) => x.prompt)).size).toBe(SHIFT.tasks);
      for (const t of shift) expect(t.options[t.answer]).toBe(j.tasks.find((x) => x.prompt === t.prompt)!.right);
    }
  });
  it("pays by accuracy with a perfect-shift bonus and unlocks harder jobs by level", () => {
    expect(scoreShift(JOB_BY_ID.get("food_vendor")!, 5, 5)).toMatchObject({ coins: 19, perfect: true, reputation: 1 });
    expect(scoreShift(JOB_BY_ID.get("campus_cleaner")!, 3, 5)).toMatchObject({ coins: 6, perfect: false, reputation: 0 });
    expect(scoreShift(JOB_BY_ID.get("campus_cleaner")!, 0, 5).coins).toBe(0);
    expect(JOBS.map((j) => j.minLevel)).toEqual([1, 2, 2, 3]);
  });
});

describe("levels and quests", () => {
  it("maps reputation to campus-year titles and caps at the top", () => {
    expect(levelFor(0).title).toBe("Fresher"); expect(levelFor(12).level).toBe(2); expect(levelFor(1e9)).toMatchObject({ level: 10, repForNext: null });
  });
  it("picks stable daily quests and uses Lagos time", () => {
    const q = dailyQuestIds("p", "2026-10-10"); expect(q[0]).toBe("play_any"); expect(new Set(q).size).toBe(3);
    expect(dayKey(Date.UTC(2026, 9, 9, 23, 0, 0))).toBe("2026-10-10");
  });
});
