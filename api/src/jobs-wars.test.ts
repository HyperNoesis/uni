import { describe, expect, it } from "vitest";
import { SHIFT } from "@campus/domain";
import { buildApp } from "./app";

const avatar = { skin: "#f1d3b5", outfit: "#2f6bff", hair: "short", hairColor: "#1a1210", top: "tee", accessory: "none" };
const SECRET = "int-secret";
let seed = 11; const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function setup() {
  let t = Date.UTC(2026, 9, 14, 10, 0, 0); // a Wednesday, far from any weekly rollover
  const { app, store } = buildApp({ sessionSecret: "s", internalSecret: SECRET, allowedOrigin: "http://localhost:3000", now: () => t, rateLimitMax: 10_000, rng });
  const tick = (ms: number) => { t += ms; };
  const player = async (displayName: string, campus = "unity_heights") => {
    const b = (await app.inject({ method: "POST", url: "/api/v1/auth/session", payload: { displayName, campus, avatar } })).json() as { token: string; profile: { id: string } };
    const call = async (method: "GET" | "POST", url: string, payload?: unknown) => { const r = await app.inject({ method, url, headers: { authorization: `Bearer ${b.token}` }, ...(payload !== undefined ? { payload: payload as object } : {}) }); return { status: r.statusCode, body: r.json() as any }; };
    const near = (pointId: string) => app.inject({ method: "POST", url: "/internal/proximity-grant", headers: { "x-internal-secret": SECRET }, payload: { playerId: b.profile.id, pointId } });
    return { id: b.profile.id, call, near };
  };
  return { app, store, tick, player };
}
type P = Awaited<ReturnType<ReturnType<typeof setup>["player"]>>;

/** Works a whole shift. Answers are never revealed in advance, so the test just submits choice 0 each time. */
async function workShift(p: P, tick: (n: number) => void, site: string) {
  await p.near(site);
  let step = (await p.call("POST", "/api/v1/jobs/shift/start")).body, last: any;
  if (!step.runId) return { blocked: step.error as string }; // e.g. no_shifts_left once the daily paid cap is used
  for (let i = 0; i < SHIFT.tasks; i++) { tick(3000); last = (await p.call("POST", "/api/v1/jobs/shift/answer", { runId: step.runId, index: i, choice: 0 })).body; step = last.next ?? step; }
  return last;
}

describe("campus jobs", () => {
  it("gates by proximity and level, and hides answers", async () => {
    const { player, tick } = setup();
    const a = await player("Ada");
    expect((await a.call("POST", "/api/v1/jobs/apply", { jobId: "campus_cleaner" })).body.error).toBe("not_in_range");
    await a.near("job_center");
    expect((await a.call("POST", "/api/v1/jobs/apply", { jobId: "food_vendor" })).body.error).toBe("level_too_low"); // needs level 2
    expect((await a.call("POST", "/api/v1/jobs/apply", { jobId: "nope" })).status).toBe(404);
    const applied = await a.call("POST", "/api/v1/jobs/apply", { jobId: "campus_cleaner" });
    expect(applied.status).toBe(200); expect(applied.body.currentJobId).toBe("campus_cleaner"); expect(applied.body.newlyUnlocked).toContain("hired");
    expect((await a.call("POST", "/api/v1/jobs/shift/start")).body.error).toBe("not_in_range"); // must be at the workplace
    await a.near("commons_cart");
    const s = (await a.call("POST", "/api/v1/jobs/shift/start")).body;
    expect(s.total).toBe(SHIFT.tasks); expect(JSON.stringify(s)).not.toMatch(/answer|correct/i);
    expect((await a.call("POST", "/api/v1/jobs/shift/start")).body.runId).toBe(s.runId); // resume, not restart
    tick(3000);
    expect((await a.call("POST", "/api/v1/jobs/shift/answer", { runId: s.runId, index: 1, choice: 0 })).status).toBe(409);
    expect((await a.call("POST", "/api/v1/jobs/apply", { jobId: "campus_cleaner" })).body.error).toBe("shift_in_progress");
  });

  it("pays once per shift through the ledger, caps paid shifts daily, and feeds quests and Wars", async () => {
    const { player, tick, store } = setup();
    const a = await player("Ada");
    await a.near("job_center"); await a.call("POST", "/api/v1/jobs/apply", { jobId: "campus_cleaner" });
    const before = store.balance(a.id);
    const f1 = await workShift(a, tick, "commons_cart");
    expect(f1.final.total).toBe(SHIFT.tasks);
    expect(store.balance(a.id) - before).toBe(f1.final.coins);
    const bal = store.balance(a.id);
    expect((await a.call("POST", "/api/v1/jobs/shift/answer", { index: 0, choice: 0 })).status).toBe(400); // malformed retry is rejected, balance unchanged
    expect(store.balance(a.id)).toBe(bal);
    let paid = f1.final.paid ? 1 : 0;
    let worked = 1, blocked = 0;
    for (let n = 0; n < 4; n++) {
      tick(SHIFT.cooldownMs + 1000);
      const f = await workShift(a, tick, "commons_cart");
      if (f.blocked) { expect(f.blocked).toBe("no_shifts_left"); blocked++; continue; }
      worked++; if (f.final.paid) paid++; if (f.final.capped) expect(f.final.coins).toBe(0);
    }
    expect(paid).toBeLessThanOrEqual(SHIFT.dailyPaid);
    if (blocked > 0) expect(paid).toBe(SHIFT.dailyPaid); // the server refuses new shifts only once the paid cap is used
    const prog = (await a.call("GET", "/api/v1/progress")).body;
    expect(prog.stats.shiftsWorked).toBe(worked); expect(prog.job.title).toBe("Campus Cleaner");
    expect((await a.call("GET", "/api/v1/campus-wars/current")).body.me.bySource.job).toBeLessThanOrEqual(10); // per-source daily cap
  });

  it("enforces the shift cooldown", async () => {
    const { player, tick } = setup();
    const a = await player("Ada"); await a.near("job_center"); await a.call("POST", "/api/v1/jobs/apply", { jobId: "campus_cleaner" });
    await workShift(a, tick, "commons_cart"); await a.near("commons_cart");
    const r = await a.call("POST", "/api/v1/jobs/shift/start");
    expect(r.status).toBe(429); expect(r.body.error).toBe("cooldown");
  });
});

describe("quests and levels", () => {
  it("cannot be self-awarded and pays each claim once", async () => {
    const { player, tick, store } = setup();
    const a = await player("Ada"); await a.near("job_center"); await a.call("POST", "/api/v1/jobs/apply", { jobId: "campus_cleaner" });
    const p0 = (await a.call("GET", "/api/v1/progress")).body;
    expect(p0.quests).toHaveLength(3); expect(p0.level.title).toBe("Fresher");
    expect((await a.call("POST", "/api/v1/quests/play_any/claim")).status).toBe(409);
    expect((await a.call("POST", "/api/v1/quests/nope/claim")).status).toBe(404);
    await workShift(a, tick, "commons_cart");
    const work = (await a.call("GET", "/api/v1/progress")).body.quests.find((q: any) => q.id === "work_shift");
    if (work) { // daily quest picks are hash-based; claim it when present
      const bal = store.balance(a.id);
      const c1 = await a.call("POST", "/api/v1/quests/work_shift/claim");
      expect(c1.status).toBe(200); expect(store.balance(a.id) - bal).toBe(c1.body.coins);
      expect((await a.call("POST", "/api/v1/quests/work_shift/claim")).status).toBe(409);
    }
  });
});

describe("Campus Wars", () => {
  it("scores only from server events, explains the rules and shows my contribution", async () => {
    const { player, store } = setup();
    const a = await player("Ada"), b = await player("Bola");
    const cur0 = (await a.call("GET", "/api/v1/campus-wars/current")).body;
    expect(cur0.scoring.explanation).toMatch(/average/i); expect(cur0.me.points).toBe(0);
    await a.call("POST", "/api/v1/social/friends/request", { playerId: b.id });
    await b.call("POST", "/api/v1/social/friends/respond", { playerId: a.id, accept: true });
    const cur = (await a.call("GET", "/api/v1/campus-wars/current")).body;
    expect(cur.me.bySource.social).toBe(3);
    const mine = cur.entries.find((e: any) => e.campus === cur.me.campus);
    expect(mine.contributors).toBe(2); expect(mine.ranked).toBe(false); // below the contributor minimum: shown as Rising
    expect(store.wars.toSnapshot().contributions.every((c) => c.rule === 1)).toBe(true);
  });

  it("freezes last week's standings once and survives a snapshot round trip", async () => {
    const { player, tick, store } = setup();
    const a = await player("Ada"), b = await player("Bola");
    await a.call("POST", "/api/v1/social/friends/request", { playerId: b.id });
    await b.call("POST", "/api/v1/social/friends/respond", { playerId: a.id, accept: true });
    tick(7 * 86_400_000);
    await a.call("GET", "/api/v1/campus-wars/current");
    const hist = (await a.call("GET", "/api/v1/campus-wars/history")).body.seasons;
    expect(hist).toHaveLength(1); expect(hist[0].standings.some((s: any) => s.totalPoints > 0)).toBe(true);
    await a.call("GET", "/api/v1/campus-wars/current");
    expect((await a.call("GET", "/api/v1/campus-wars/history")).body.seasons[0].at).toBe(hist[0].at); // not recomputed
    const snap = JSON.parse(JSON.stringify(store.toSnapshot()));
    store.restore(snap);
    expect(store.wars.history()).toHaveLength(1);
    delete snap.wars; delete snap.progress; store.restore(snap); // older snapshots still load
    expect(store.wars.history()).toHaveLength(0);
  });

  it("requires being at the arena board to check in", async () => {
    const { player } = setup();
    const a = await player("Ada");
    expect((await a.call("POST", "/api/v1/events/checkin")).body.error).toBe("not_in_range");
  });
});
