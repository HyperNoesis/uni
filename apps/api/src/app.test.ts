import { describe, expect, it } from "vitest";
import { buildApp } from "./app";
import { Store } from "./store";

const avatar = { skin: "#f1d3b5", outfit: "#2f6bff", hair: "short", hairColor: "#1a1210", top: "tee", accessory: "none" } as const;

function setup() {
  let t = 1_000_000;
  const clock = { now: () => t, advance: (ms: number) => (t += ms) };
  const { app, store } = buildApp(
    { sessionSecret: "s", internalSecret: "i", allowedOrigin: "http://localhost:3000", now: clock.now, rateLimitMax: 1000 },
  );
  return { app, store, clock };
}

async function signup(app: ReturnType<typeof setup>["app"]) {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/auth/session",
    payload: { displayName: "Ada", campus: "unity_heights", avatar },
  });
  expect(res.statusCode).toBe(201);
  return res.json() as { token: string; profile: { id: string; coins: number } };
}

async function grant(app: ReturnType<typeof setup>["app"], playerId: string) {
  await app.inject({
    method: "POST",
    url: "/internal/proximity-grant",
    headers: { "x-internal-secret": "i" },
    payload: { playerId, pointId: "commons_board" },
  });
}

describe("session", () => {
  it("creates a profile with a starter ledger entry", async () => {
    const { app, store } = setup();
    const s = await signup(app);
    expect(s.profile.coins).toBe(50);
    expect(store.reconcile(s.profile.id)).toBe(50);
  });
  it("rejects malformed input", async () => {
    const { app } = setup();
    const res = await app.inject({ method: "POST", url: "/api/v1/auth/session", payload: { displayName: "x", campus: "nope" } });
    expect(res.statusCode).toBe(400);
  });
  it("requires auth for /me", async () => {
    const { app } = setup();
    expect((await app.inject({ method: "GET", url: "/api/v1/me" })).statusCode).toBe(401);
  });
});

describe("reaction activity", () => {
  it("refuses to start without a server-attested proximity grant", async () => {
    const { app } = setup();
    const s = await signup(app);
    const res = await app.inject({ method: "POST", url: "/api/v1/activities/reaction/start", headers: { authorization: `Bearer ${s.token}` } });
    expect(res.statusCode).toBe(403);
  });

  it("rejects internal grants without the shared secret", async () => {
    const { app } = setup();
    const res = await app.inject({ method: "POST", url: "/internal/proximity-grant", payload: { playerId: "x", pointId: "commons_board" } });
    expect(res.statusCode).toBe(403);
  });

  it("rewards from server-measured time and ignores any client timing", async () => {
    const { app, store, clock } = setup();
    const s = await signup(app);
    await grant(app, s.profile.id);
    const auth = { authorization: `Bearer ${s.token}` };
    const start = await app.inject({ method: "POST", url: "/api/v1/activities/reaction/start", headers: auth });
    const { runId, delayMs } = start.json();
    clock.advance(delayMs + 300);
    const done = await app.inject({
      method: "POST",
      url: "/api/v1/activities/reaction/complete",
      headers: { ...auth, "idempotency-key": "key-12345678" },
      payload: { runId, reactionMs: 1, coins: 999999 },
    });
    const body = done.json();
    expect(body.reactionMs).toBe(300);
    expect(body.rewardCoins).toBe(14);
    expect(store.reconcile(s.profile.id)).toBe(64);
  });

  it("flags reactions before the signal as too early with no reward", async () => {
    const { app, clock } = setup();
    const s = await signup(app);
    await grant(app, s.profile.id);
    const auth = { authorization: `Bearer ${s.token}` };
    const { runId, delayMs } = (await app.inject({ method: "POST", url: "/api/v1/activities/reaction/start", headers: auth })).json();
    clock.advance(delayMs - 500);
    const body = (await app.inject({
      method: "POST", url: "/api/v1/activities/reaction/complete",
      headers: { ...auth, "idempotency-key": "key-abcdefgh" }, payload: { runId },
    })).json();
    expect(body.tooEarly).toBe(true);
    expect(body.rewardCoins).toBe(0);
  });

  it("is idempotent: replaying the same key does not double pay", async () => {
    const { app, store, clock } = setup();
    const s = await signup(app);
    await grant(app, s.profile.id);
    const auth = { authorization: `Bearer ${s.token}` };
    const { runId, delayMs } = (await app.inject({ method: "POST", url: "/api/v1/activities/reaction/start", headers: auth })).json();
    clock.advance(delayMs + 200);
    const req = { method: "POST" as const, url: "/api/v1/activities/reaction/complete", headers: { ...auth, "idempotency-key": "same-key-123" }, payload: { runId } };
    const a = (await app.inject(req)).json();
    const b = (await app.inject(req)).json();
    expect(b).toEqual(a);
    expect(store.reconcile(s.profile.id)).toBe(70);
  });

  it("rejects a second completion of the same run under a new key", async () => {
    const { app, clock } = setup();
    const s = await signup(app);
    await grant(app, s.profile.id);
    const auth = { authorization: `Bearer ${s.token}` };
    const { runId, delayMs } = (await app.inject({ method: "POST", url: "/api/v1/activities/reaction/start", headers: auth })).json();
    clock.advance(delayMs + 200);
    await app.inject({ method: "POST", url: "/api/v1/activities/reaction/complete", headers: { ...auth, "idempotency-key": "key-one-1234" }, payload: { runId } });
    const again = await app.inject({ method: "POST", url: "/api/v1/activities/reaction/complete", headers: { ...auth, "idempotency-key": "key-two-1234" }, payload: { runId } });
    expect(again.statusCode).toBe(409);
  });

  it("enforces cooldown between runs", async () => {
    const { app, clock } = setup();
    const s = await signup(app);
    await grant(app, s.profile.id);
    const auth = { authorization: `Bearer ${s.token}` };
    const { runId, delayMs } = (await app.inject({ method: "POST", url: "/api/v1/activities/reaction/start", headers: auth })).json();
    clock.advance(delayMs + 200);
    await app.inject({ method: "POST", url: "/api/v1/activities/reaction/complete", headers: { ...auth, "idempotency-key": "key-cool-1234" }, payload: { runId } });
    const next = await app.inject({ method: "POST", url: "/api/v1/activities/reaction/start", headers: auth });
    expect(next.statusCode).toBe(429);
  });

  it("does not let one player complete another player's run", async () => {
    const { app, clock } = setup();
    const a = await signup(app);
    const b = await signup(app);
    await grant(app, a.profile.id);
    const { runId, delayMs } = (await app.inject({ method: "POST", url: "/api/v1/activities/reaction/start", headers: { authorization: `Bearer ${a.token}` } })).json();
    clock.advance(delayMs + 200);
    const res = await app.inject({ method: "POST", url: "/api/v1/activities/reaction/complete", headers: { authorization: `Bearer ${b.token}`, "idempotency-key": "key-steal-123" }, payload: { runId } });
    expect(res.statusCode).toBe(404);
  });
});

// ---- Phase 2: identity, inventory, home room, readiness ----
const bearer = (s: { token: string }) => ({ authorization: `Bearer ${s.token}` });
const DAY = 24 * 60 * 60 * 1000;

describe("identity routes", () => {
  it("requires auth on every Phase 2 route", async () => {
    const { app } = setup();
    for (const [method, url] of [["GET", "/api/v1/profile"], ["PATCH", "/api/v1/profile"], ["GET", "/api/v1/inventory"], ["GET", "/api/v1/home"], ["PUT", "/api/v1/home"]] as const) {
      expect((await app.inject({ method, url, payload: {} })).statusCode).toBe(401);
    }
  });

  it("returns title, achievements and fills new avatar parts for Phase 1 clients", async () => {
    const { app } = setup();
    const s = await signup(app);
    const body = (await app.inject({ method: "GET", url: "/api/v1/profile", headers: bearer(s) })).json();
    expect(body.title).toBe("Fresher");
    expect(body.renameAvailableAt).toBeNull();
    expect(body.achievements.map((a: { id: string }) => a.id)).toEqual(["first_steps"]);
    expect(body.profile.avatar).toMatchObject({ hairColor: "#1a1210", top: "tee" });
  });

  it("a new look unlocks Fresh Look once and shows in /me", async () => {
    const { app } = setup();
    const s = await signup(app);
    const look = { ...avatar, hair: "locs", hairColor: "#3b2415", top: "hoodie", accessory: "glasses" };
    const res = await app.inject({ method: "PATCH", url: "/api/v1/profile", headers: bearer(s), payload: { avatar: look } });
    expect(res.json().newlyUnlocked).toEqual(["fresh_look"]);
    expect((await app.inject({ method: "GET", url: "/api/v1/me", headers: bearer(s) })).json().profile.avatar).toMatchObject(look);
    const again = await app.inject({ method: "PATCH", url: "/api/v1/profile", headers: bearer(s), payload: { avatar: { ...look, top: "kaftan" } } });
    expect(again.json().newlyUnlocked ?? []).toEqual([]);
  });

  it("rejects empty updates, campus/reputation tampering and bad avatars", async () => {
    const { app } = setup();
    const s = await signup(app);
    const patch = (payload: object) => app.inject({ method: "PATCH", url: "/api/v1/profile", headers: bearer(s), payload });
    for (const p of [{}, { campus: "lagoon_tech" }, { reputation: 9999 }, { avatar: { ...avatar, skin: "#ffffff" } }, { bio: "x".repeat(401) }]) expect((await patch(p)).statusCode).toBe(400);
  });

  it("applies the text policy with a machine-readable reason, at signup too", async () => {
    const { app } = setup();
    const s = await signup(app);
    const patch = (payload: object) => app.inject({ method: "PATCH", url: "/api/v1/profile", headers: bearer(s), payload });
    expect((await patch({ bio: "call me 08012345678" })).json()).toMatchObject({ error: "text_rejected", field: "bio", reason: "contact_info" });
    expect((await patch({ displayName: "Admin_Ada" })).json()).toMatchObject({ field: "displayName", reason: "reserved_name" });
    const ok = await patch({ bio: "  CS 300L.   Jollof debates.  " });
    expect(ok.json().profile.bio).toBe("CS 300L. Jollof debates.");
    expect(ok.json().newlyUnlocked).toEqual(["storyteller"]);
    const signupBad = await app.inject({ method: "POST", url: "/api/v1/auth/session", payload: { displayName: "Moderator", campus: "unity_heights", avatar } });
    expect(signupBad.statusCode).toBe(400);
  });

  it("enforces operator blocked terms including leetspeak", async () => {
    const { app } = buildApp({ sessionSecret: "s", internalSecret: "i", allowedOrigin: "http://localhost:3000", rateLimitMax: 1000, blockedTerms: ["badword"] });
    const res = await app.inject({ method: "POST", url: "/api/v1/auth/session", payload: { displayName: "B4dW0rd", campus: "unity_heights", avatar } });
    expect(res.json()).toMatchObject({ error: "text_rejected", reason: "blocked_term" });
  });

  it("limits renames to once a week and reports when the next one is allowed", async () => {
    const { app, clock } = setup();
    const s = await signup(app);
    const rename = (displayName: string) => app.inject({ method: "PATCH", url: "/api/v1/profile", headers: bearer(s), payload: { displayName } });
    expect((await rename("Ada B")).statusCode).toBe(200);
    const blocked = await rename("Ada C");
    expect(blocked.statusCode).toBe(429);
    expect((await app.inject({ method: "GET", url: "/api/v1/profile", headers: bearer(s) })).json().renameAvailableAt).toBe(blocked.json().retryAt);
    clock.advance(7 * DAY);
    expect((await rename("Ada C")).statusCode).toBe(200);
  });

  it("allows CORS preflight for PATCH and PUT", async () => {
    const { app } = setup();
    for (const m of ["PATCH", "PUT"]) {
      const res = await app.inject({ method: "OPTIONS", url: "/api/v1/profile", headers: { origin: "http://localhost:3000", "access-control-request-method": m } });
      expect(String(res.headers["access-control-allow-methods"])).toContain(m);
    }
  });
});

describe("inventory and home routes", () => {
  it("gives a starter kit and room at revision 1, then saves, bumps the revision and survives reload", async () => {
    const { app } = setup();
    const s = await signup(app);
    const inv = (await app.inject({ method: "GET", url: "/api/v1/inventory", headers: bearer(s) })).json().items.map((i: { itemId: string }) => i.itemId);
    expect(inv).toContain("banner_unity_heights");
    expect(inv).not.toContain("lamp_neon");
    const home = (await app.inject({ method: "GET", url: "/api/v1/home", headers: bearer(s) })).json();
    expect(home.revision).toBe(1);
    const layout = { ...home.layout, theme: { wall: "#3d2f5e", floor: "tile" } };
    const res = await app.inject({ method: "PUT", url: "/api/v1/home", headers: bearer(s), payload: { layout, revision: 1 } });
    expect(res.json().revision).toBe(2);
    expect((await app.inject({ method: "GET", url: "/api/v1/home", headers: bearer(s) })).json().layout.theme).toEqual({ wall: "#3d2f5e", floor: "tile" });
  });

  it("409 on a stale revision, 422 with per-item errors for illegal layouts, 400 for malformed ones", async () => {
    const { app } = setup();
    const s = await signup(app);
    const home = (await app.inject({ method: "GET", url: "/api/v1/home", headers: bearer(s) })).json();
    const put = (layout: unknown, revision = 1) => app.inject({ method: "PUT", url: "/api/v1/home", headers: bearer(s), payload: { layout, revision } as object });
    expect((await put({ ...home.layout, theme: { wall: "#3d2f5e", floor: "wood" } })).statusCode).toBe(200);
    const stale = await put({ ...home.layout, theme: { wall: "#1f5a4d", floor: "wood" } });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({ error: "revision_conflict", revision: 2 });
    const unowned = await put({ ...home.layout, items: [...home.layout.items, { itemId: "trophy_case", x: 0, y: 5, rot: 0 }] }, 2);
    expect(unowned.statusCode).toBe(422);
    expect(unowned.json().errors[0]).toMatchObject({ code: "not_owned", index: 10 });
    expect((await put({ theme: { wall: "#000000", floor: "wood" }, items: [] }, 2)).statusCode).toBe(400);
    expect((await put({ theme: home.layout.theme, items: [{ itemId: "plant", x: 1e9, y: 0, rot: 0 }] }, 2)).statusCode).toBe(400);
  });

  it("furnishing unlocks Home Sweet Home and the neon lamp becomes placeable; rooms stay per-player", async () => {
    const { app } = setup();
    const a = await signup(app);
    const b = (await app.inject({ method: "POST", url: "/api/v1/auth/session", payload: { displayName: "Bola", campus: "lagoon_tech", avatar } })).json();
    const home = (await app.inject({ method: "GET", url: "/api/v1/home", headers: bearer(a) })).json();
    const saved = await app.inject({ method: "PUT", url: "/api/v1/home", headers: bearer(a), payload: { layout: { ...home.layout, items: [...home.layout.items, { itemId: "beanbag", x: 0, y: 5, rot: 0 }] }, revision: 1 } });
    expect(saved.json().newlyUnlocked).toEqual(["home_sweet_home"]);
    const withLamp = { ...saved.json().layout, items: [...saved.json().layout.items, { itemId: "lamp_neon", x: 8, y: 6, rot: 0 }] };
    expect((await app.inject({ method: "PUT", url: "/api/v1/home", headers: bearer(a), payload: { layout: withLamp, revision: 2 } })).statusCode).toBe(200);
    const hb = (await app.inject({ method: "GET", url: "/api/v1/home", headers: bearer(b) })).json();
    const hack = { ...hb.layout, items: [...hb.layout.items, { itemId: "banner_unity_heights", x: 2, y: 0, rot: 0 }] };
    expect((await app.inject({ method: "PUT", url: "/api/v1/home", headers: bearer(b), payload: { layout: hack, revision: 1 } })).statusCode).toBe(422);
  });

  it("the first server-verified reaction reward unlocks Quick Hands exactly once", async () => {
    const { app, clock } = setup();
    const s = await signup(app);
    const run = async (key: string) => {
      await grant(app, s.profile.id);
      const { runId, delayMs } = (await app.inject({ method: "POST", url: "/api/v1/activities/reaction/start", headers: bearer(s) })).json();
      clock.advance(delayMs + 200);
      return (await app.inject({ method: "POST", url: "/api/v1/activities/reaction/complete", headers: { ...bearer(s), "idempotency-key": key }, payload: { runId } })).json();
    };
    expect((await run("run-key-0001")).newlyUnlocked).toEqual(["quick_hands"]);
    clock.advance(5_000);
    expect((await run("run-key-0002")).newlyUnlocked).toBeUndefined();
    const inv = (await app.inject({ method: "GET", url: "/api/v1/inventory", headers: bearer(s) })).json();
    expect(inv.items.filter((i: { itemId: string }) => i.itemId === "trophy_case")).toHaveLength(1);
  });
});

describe("readiness", () => {
  it("is 200 when memory-only or healthy, 503 when persistence fails, without leaking error text", async () => {
    const mk = (status?: () => { kind: "file" | "memory"; lastSavedAt: string | null; lastError: string | null; pending: boolean }) =>
      buildApp({ sessionSecret: "s", internalSecret: "i", allowedOrigin: "http://localhost:3000", rateLimitMax: 1000, ...(status ? { persistence: status } : {}) }).app;
    expect((await mk().inject({ method: "GET", url: "/readyz" })).statusCode).toBe(200);
    expect((await mk(() => ({ kind: "file", lastSavedAt: "2026-10-08T10:00:00.000Z", lastError: null, pending: false })).inject({ method: "GET", url: "/readyz" })).statusCode).toBe(200);
    const failing = await mk(() => ({ kind: "file", lastSavedAt: null, lastError: "ENOSPC: /secret/path", pending: true })).inject({ method: "GET", url: "/readyz" });
    expect(failing.statusCode).toBe(503);
    expect(JSON.stringify(failing.json())).not.toContain("/secret/path");
  });
});

describe("analytics", () => {
  it("emits anonymous activation events on signup and never leaks the display name", async () => {
    const { memorySink } = await import("@campus/analytics");
    const sink = memorySink();
    const { app } = buildApp({ sessionSecret: "s", internalSecret: "i", allowedOrigin: "http://localhost:3000", rateLimitMax: 1000, analytics: sink });
    const res = await app.inject({ method: "POST", url: "/api/v1/auth/session", payload: { displayName: "Ada", campus: "unity_heights", avatar } });
    expect(res.statusCode).toBe(201);
    expect(sink.records.map((r) => r.event)).toEqual(["avatar_created", "campus_joined"]);
    expect(JSON.stringify(sink.records)).not.toContain("Ada");
  });
});

describe("Campus Quiz + Campus Wars", () => {
  async function quizGrant(app: ReturnType<typeof setup>["app"], playerId: string) {
    const res = await app.inject({
      method: "POST",
      url: "/internal/proximity-grant",
      headers: { "x-internal-secret": "i" },
      payload: { playerId, pointId: "quiz_board" },
    });
    expect(res.statusCode).toBe(200);
  }

  it("requires a server-attested position at the quiz board", async () => {
    const { app } = setup();
    const s = await signup(app);
    const r = await app.inject({ method: "POST", url: "/api/v1/activities/quiz/start", headers: { authorization: `Bearer ${s.token}` } });
    expect(r.statusCode).toBe(403);
    expect(r.json().error).toBe("not_in_range");
  });

  it("keeps the answer server-side, awards a correct response once, and counts Campus Wars contribution", async () => {
    const { app, store, clock } = setup();
    const s = await signup(app);
    await quizGrant(app, s.profile.id);
    const originalRandom = Math.random;
    Math.random = () => 0; // deterministically selects the first question; its correct choice is B.
    try {
      const start = await app.inject({ method: "POST", url: "/api/v1/activities/quiz/start", headers: { authorization: `Bearer ${s.token}` } });
      expect(start.statusCode).toBe(200);
      const data = start.json() as { runId: string; question: { prompt: string; choices: string[]; answerIndex?: number } };
      expect(data.question.choices.length).toBeGreaterThan(1);
      expect("answerIndex" in data.question).toBe(false);
      clock.advance(2_000);
      const request = {
        method: "POST" as const,
        url: "/api/v1/activities/quiz/complete",
        headers: { authorization: `Bearer ${s.token}`, "idempotency-key": "quiz-result-key-123" },
        payload: { runId: data.runId, answerIndex: 1 },
      };
      const completed = await app.inject(request);
      expect(completed.statusCode).toBe(200);
      expect(completed.json()).toMatchObject({ correct: true, rewardCoins: 12, rewardReputation: 5, warPointsAwarded: 10 });
      expect(store.reconcile(s.profile.id)).toBe(62);
      const replay = await app.inject(request);
      expect(replay.json()).toEqual(completed.json());
      expect(store.reconcile(s.profile.id)).toBe(62);
      const wars = await app.inject({ method: "GET", url: "/api/v1/campus-wars/current" });
      expect(wars.statusCode).toBe(200);
      expect(wars.json().entries.find((e: { campus: string }) => e.campus === "unity_heights")).toMatchObject({ score: 10, totalPoints: 10, contributors: 1 });
    } finally {
      Math.random = originalRandom;
    }
  });

  it("counts each quiz at start so expired runs cannot be rerolled without limit", async () => {
    const { app, clock } = setup();
    const s = await signup(app);
    const auth = { authorization: `Bearer ${s.token}` };
    for (let i = 0; i < 5; i++) {
      await quizGrant(app, s.profile.id);
      const started = await app.inject({ method: "POST", url: "/api/v1/activities/quiz/start", headers: auth });
      expect(started.statusCode).toBe(200);
      if (i < 4) clock.advance(3 * 60_000 + 1); // let an abandoned run expire, then attempt another start
    }
    clock.advance(3 * 60_000 + 1);
    await quizGrant(app, s.profile.id);
    const sixth = await app.inject({ method: "POST", url: "/api/v1/activities/quiz/start", headers: auth });
    expect(sixth.statusCode).toBe(429);
    expect(sixth.json().error).toBe("daily_limit");
  });

  it("enforces the daily attempt limit and per-player Campus Wars cap", () => {
    const s = new Store();
    const p = s.createPlayer({ displayName: "Ade", campus: "lagoon_tech", avatar });
    for (let i = 0; i < 5; i++) s.noteQuizAttempt(p.id, "2026-10-09");
    expect(s.quizAttemptsToday(p.id, "2026-10-09")).toBe(5);
    // Rule v1 (D-034): quiz source cap 20, hunt 10, event 20, daily player cap 40.
    expect(s.awardWarPoints(p.id, "2026-W41", "2026-10-09", 20, "quiz", "k1")).toBe(20);
    expect(s.awardWarPoints(p.id, "2026-W41", "2026-10-09", 20, "quiz", "k2")).toBe(0); // per-source cap reached
    expect(s.awardWarPoints(p.id, "2026-W41", "2026-10-09", 15, "hunt", "k3")).toBe(10); // clamped to the hunt source cap
    expect(s.awardWarPoints(p.id, "2026-W41", "2026-10-09", 20, "event", "k4")).toBe(10); // clamped by what is left of the daily cap
    expect(s.awardWarPoints(p.id, "2026-W41", "2026-10-09", 5, "reaction", "k5")).toBe(0); // daily cap of 40 reached
    const restored = new Store();
    restored.restore(JSON.parse(JSON.stringify(s.toSnapshot(Date.parse("2026-10-09T12:00:00Z")))));
    expect(restored.quizAttemptsToday(p.id, "2026-10-09")).toBe(5);
    expect(restored.campusWarLeaderboard("2026-W41").find((e) => e.campus === "lagoon_tech")).toMatchObject({ totalPoints: 40, score: 40, contributors: 1 });
  });
});


describe("recurring campus events", () => {
  it("requires a session to list events and returns deterministic upcoming occurrences", async () => {
    const { app, clock } = setup();
    expect((await app.inject({ method: "GET", url: "/api/v1/events" })).statusCode).toBe(401);
    const s = await signup(app);
    const res = await app.inject({ method: "GET", url: "/api/v1/events", headers: bearer(s) });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { events: { id: string; startsAt: string; endsAt: string; status: string; rsvped: boolean; rsvpCount: number }[] };
    expect(body.events).toHaveLength(4);
    for (const event of body.events) {
      expect(Date.parse(event.endsAt)).toBeGreaterThan(Date.parse(event.startsAt));
      expect(Date.parse(event.startsAt)).toBeGreaterThanOrEqual(clock.now());
    }
    expect(body.events.map((e) => Date.parse(e.startsAt))).toEqual(body.events.map((e) => Date.parse(e.startsAt)).sort((a, b) => a - b));
  });

  it("persists RSVP counts, makes repeated RSVP calls idempotent, and supports cancellation", async () => {
    const { app, store, clock } = setup();
    const a = await signup(app);
    const b = await signup(app);
    const headersA = bearer(a), headersB = bearer(b);
    const first = (await app.inject({ method: "GET", url: "/api/v1/events", headers: headersA })).json().events[0] as { id: string; startsAt: string; rsvpCount: number };
    const post = () => app.inject({ method: "POST", url: `/api/v1/events/${first.id}/rsvp`, headers: headersA });
    expect((await post()).json()).toMatchObject({ ok: true, rsvped: true, rsvpCount: 1 });
    expect((await post()).json()).toMatchObject({ rsvped: true, rsvpCount: 1 });
    const bList = (await app.inject({ method: "GET", url: "/api/v1/events", headers: headersB })).json().events as { id: string; startsAt: string; rsvpCount: number; rsvped: boolean }[];
    const bEvent = bList.find((e) => e.id === first.id)!;
    expect(bEvent).toMatchObject({ rsvpCount: 1, rsvped: false, startsAt: first.startsAt });

    const restored = new Store();
    restored.restore(JSON.parse(JSON.stringify(store.toSnapshot(clock.now()))));
    expect(restored.eventRsvpCount(`${first.id}@${first.startsAt}`)).toBe(1);
    const cancel = await app.inject({ method: "DELETE", url: `/api/v1/events/${first.id}/rsvp`, headers: headersA });
    expect(cancel.json()).toMatchObject({ rsvped: false, rsvpCount: 0 });
    expect((await app.inject({ method: "POST", url: "/api/v1/events/not-an-event/rsvp", headers: headersA })).statusCode).toBe(404);
  });
});


describe("server-priced room shop", () => {
  it("requires a session and exposes only the server catalogue", async () => {
    const { app } = setup();
    expect((await app.inject({ method: "GET", url: "/api/v1/shop" })).statusCode).toBe(401);
    const s = await signup(app);
    const res = await app.inject({ method: "GET", url: "/api/v1/shop", headers: bearer(s) });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ currency: "CAMPUS_COINS", balance: 50 });
    expect(res.json().offers.find((o: { itemId: string }) => o.itemId === "rug_cobalt")).toMatchObject({ price: 35, item: { name: "Cobalt Lounge Rug", layer: "floor" }, owned: 0 });
  });

  it("charges the catalog price once, grants the item, and survives snapshot restore", async () => {
    const { app, store, clock } = setup();
    const s = await signup(app);
    const headers = { ...bearer(s), "idempotency-key": "shop-rug-key-12345" };
    const payload = { itemId: "rug_cobalt" };
    const first = await app.inject({ method: "POST", url: "/api/v1/shop/purchase", headers, payload });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ ok: true, itemId: "rug_cobalt", price: 35, profile: { coins: 15 } });
    expect(store.reconcile(s.profile.id)).toBe(15);
    expect(store.inventory(s.profile.id).find((i) => i.itemId === "rug_cobalt")?.qty).toBe(1);
    expect((await app.inject({ method: "POST", url: "/api/v1/shop/purchase", headers, payload })).json()).toEqual(first.json());
    expect(store.reconcile(s.profile.id)).toBe(15);

    const otherItemWithSameKey = await app.inject({ method: "POST", url: "/api/v1/shop/purchase", headers, payload: { itemId: "poster_campus" } });
    expect(otherItemWithSameKey.statusCode).toBe(409);
    expect((await app.inject({ method: "GET", url: "/api/v1/inventory", headers: bearer(s) })).json().items.find((i: { itemId: string }) => i.itemId === "rug_cobalt").qty).toBe(1);

    const restored = new Store();
    restored.restore(JSON.parse(JSON.stringify(store.toSnapshot(clock.now()))));
    expect(restored.profile(s.profile.id)?.coins).toBe(15);
    expect(restored.reconcile(s.profile.id)).toBe(15);
    expect(restored.inventory(s.profile.id).find((i) => i.itemId === "rug_cobalt")?.qty).toBe(1);
  });

  it("rejects client prices, unknown items, and purchases the player cannot afford", async () => {
    const { app, store } = setup();
    const s = await signup(app);
    const auth = bearer(s);
    const base = { method: "POST" as const, url: "/api/v1/shop/purchase", headers: { ...auth, "idempotency-key": "shop-invalid-key-123" } };
    expect((await app.inject({ ...base, payload: { itemId: "rug_cobalt", price: 1 } })).statusCode).toBe(400);
    expect((await app.inject({ ...base, headers: { ...auth, "idempotency-key": "shop-unknown-key-123" }, payload: { itemId: "not-a-real-item" } })).statusCode).toBe(404);
    expect((await app.inject({ ...base, headers: { ...auth, "idempotency-key": "shop-expensive-key-123" }, payload: { itemId: "golden_trophy" } })).statusCode).toBe(402);
    expect(store.reconcile(s.profile.id)).toBe(50);
    expect(store.inventory(s.profile.id).some((i) => i.itemId === "golden_trophy")).toBe(false);
  });
});


describe("ordered Campus Scavenger Hunt", () => {
  async function huntGrant(app: ReturnType<typeof setup>["app"], playerId: string, pointId: string) {
    const res = await app.inject({
      method: "POST", url: "/internal/proximity-grant", headers: { "x-internal-secret": "i" }, payload: { playerId, pointId },
    });
    expect(res.statusCode).toBe(200);
  }

  it("requires the Hunt board proximity attestation before starting", async () => {
    const { app } = setup();
    const s = await signup(app);
    const res = await app.inject({ method: "POST", url: "/api/v1/activities/hunt/start", headers: bearer(s) });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("not_in_range");
  });

  it("requires checkpoints in order and pays once after all three server-attested stops", async () => {
    const { app, store, clock } = setup();
    const s = await signup(app);
    const auth = bearer(s);
    await huntGrant(app, s.profile.id, "hunt_board");
    const start = await app.inject({ method: "POST", url: "/api/v1/activities/hunt/start", headers: auth });
    expect(start.statusCode).toBe(200);
    const run = start.json() as { runId: string; step: number; totalSteps: number };
    expect(run).toMatchObject({ step: 0, totalSteps: 3 });

    await huntGrant(app, s.profile.id, "hunt_food");
    const wrong = await app.inject({ method: "POST", url: "/api/v1/activities/hunt/checkpoint", headers: { ...auth, "idempotency-key": `wrong-${run.runId}` }, payload: { runId: run.runId, pointId: "hunt_food" } });
    expect(wrong.statusCode).toBe(409);
    expect(wrong.json().error).toBe("wrong_checkpoint");

    const visit = async (pointId: string) => {
      await huntGrant(app, s.profile.id, pointId);
      return app.inject({ method: "POST", url: "/api/v1/activities/hunt/checkpoint", headers: { ...auth, "idempotency-key": `hunt-${run.runId}-${pointId}` }, payload: { runId: run.runId, pointId } });
    };
    const first = await visit("hunt_library");
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ complete: false, step: 1, landmark: "Food Court path" });
    expect((await visit("hunt_food")).json()).toMatchObject({ complete: false, step: 2, landmark: "Sports Ground" });
    const finish = await visit("hunt_sports");
    expect(finish.statusCode).toBe(200);
    expect(finish.json()).toMatchObject({ complete: true, step: 3, rewardCoins: 25, rewardReputation: 8, warPointsAwarded: 10, profile: { coins: 75, reputation: 11 } }); // 8 from the hunt + 3 from the one-time Quick Hands achievement
    expect(store.reconcile(s.profile.id)).toBe(75);
    const replay = await app.inject({ method: "POST", url: "/api/v1/activities/hunt/checkpoint", headers: { ...auth, "idempotency-key": `hunt-${run.runId}-hunt_sports` }, payload: { runId: run.runId, pointId: "hunt_sports" } });
    expect(replay.json()).toEqual(finish.json());
    expect(store.reconcile(s.profile.id)).toBe(75);
    expect(store.campusWarLeaderboard("1970-W01").find((e) => e.campus === "unity_heights")?.totalPoints).toBe(10);
    clock.advance(1000);
  });

  it("counts abandoned attempts toward the daily limit and persists that limit", async () => {
    const { app, store, clock } = setup();
    const s = await signup(app);
    const auth = bearer(s);
    for (let i = 0; i < 3; i++) {
      await huntGrant(app, s.profile.id, "hunt_board");
      expect((await app.inject({ method: "POST", url: "/api/v1/activities/hunt/start", headers: auth })).statusCode).toBe(200);
      clock.advance(10 * 60_000 + 1);
    }
    await huntGrant(app, s.profile.id, "hunt_board");
    const fourth = await app.inject({ method: "POST", url: "/api/v1/activities/hunt/start", headers: auth });
    expect(fourth.statusCode).toBe(429);
    expect(fourth.json().error).toBe("daily_limit");
    const restored = new Store();
    restored.restore(JSON.parse(JSON.stringify(store.toSnapshot(clock.now()))));
    expect(restored.huntAttemptsToday(s.profile.id, new Date(clock.now()).toISOString().slice(0, 10))).toBe(3);
  });
});
