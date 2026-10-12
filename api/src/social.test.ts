import { describe, expect, it } from "vitest";
import { buildApp } from "./app";

const avatar = { skin: "#f1d3b5", outfit: "#2f6bff", hair: "short", hairColor: "#1a1210", top: "tee", accessory: "none" };
const SECRET = "int-secret";

function setup() {
  let t = Date.UTC(2026, 9, 9, 12, 0, 0);
  const { app, store } = buildApp({ sessionSecret: "s", internalSecret: SECRET, allowedOrigin: "http://localhost:3000", now: () => t, rateLimitMax: 10_000 });
  const tick = (ms: number) => { t += ms; };
  async function player(displayName: string, campus = "unity_heights") {
    const r = await app.inject({ method: "POST", url: "/api/v1/auth/session", payload: { displayName, campus, avatar } });
    const b = r.json() as { token: string; profile: { id: string } };
    const call = async (method: "GET" | "POST", url: string, payload?: unknown) => {
      const res = await app.inject({ method, url, headers: { authorization: `Bearer ${b.token}` }, ...(payload !== undefined ? { payload: payload as object } : {}) });
      return { status: res.statusCode, body: res.json() as any };
    };
    return { id: b.profile.id, call };
  }
  const befriend = async (a: Awaited<ReturnType<typeof player>>, b: Awaited<ReturnType<typeof player>>) => { await a.call("POST", "/api/v1/social/friends/request", { playerId: b.id }); await b.call("POST", "/api/v1/social/friends/respond", { playerId: a.id, accept: true }); };
  const internal = (method: "GET" | "POST", url: string, payload?: unknown) => app.inject({ method, url, headers: { "x-internal-secret": SECRET }, ...(payload !== undefined ? { payload: payload as object } : {}) });
  return { app, store, player, befriend, tick, internal };
}

describe("friends", () => {
  it("request, accept, achievements, idempotency and mutual request auto-accept", async () => {
    const { player, store } = setup();
    const a = await player("Ada"), b = await player("Bola"), c = await player("Chi");
    expect((await a.call("POST", "/api/v1/social/friends/request", { playerId: b.id })).body.state).toBe("requested");
    expect((await a.call("POST", "/api/v1/social/friends/request", { playerId: b.id })).body.state).toBe("requested"); // idempotent
    expect((await b.call("GET", "/api/v1/social/overview")).body.incoming.map((p: any) => p.name)).toEqual(["Ada"]);
    expect((await b.call("POST", "/api/v1/social/friends/respond", { playerId: a.id, accept: true })).body.state).toBe("accepted");
    expect((await a.call("GET", "/api/v1/social/overview")).body.friends.map((p: any) => p.name)).toEqual(["Bola"]);
    expect(store.achievements(a.id).map((x) => x.id)).toContain("good_neighbour");
    expect((await a.call("POST", "/api/v1/social/friends/request", { playerId: b.id })).status).toBe(409);
    expect((await a.call("POST", "/api/v1/social/friends/request", { playerId: a.id })).status).toBe(400);
    await c.call("POST", "/api/v1/social/friends/request", { playerId: a.id });
    expect((await a.call("POST", "/api/v1/social/friends/request", { playerId: c.id })).body.state).toBe("accepted"); // crossing requests
    expect((await a.call("POST", "/api/v1/social/friends/respond", { playerId: "nobody", accept: true })).status).toBe(404);
  });
  it("requires auth", async () => { const { app } = setup(); expect((await app.inject({ method: "GET", url: "/api/v1/social/overview" })).statusCode).toBe(401); });
});

describe("blocking suppresses everything immediately", () => {
  it("ends friendship, hides search, refuses requests and DMs both ways, hides group messages", async () => {
    const { player, befriend, tick } = setup();
    const a = await player("Ada"), b = await player("Bola");
    await befriend(a, b); tick(2000);
    expect((await a.call("POST", `/api/v1/social/dm/${b.id}`, { text: "hello" })).status).toBe(201);
    const g = (await a.call("POST", "/api/v1/social/groups", { name: "Study Hall", description: "" })).body.group;
    await b.call("POST", `/api/v1/social/groups/${g.id}/join`); tick(2000);
    await b.call("POST", `/api/v1/social/groups/${g.id}/messages`, { text: "group hi" }); tick(2000);
    expect((await a.call("GET", `/api/v1/social/groups/${g.id}/messages`)).body.messages).toHaveLength(1);
    expect((await a.call("POST", "/api/v1/social/blocks", { playerId: b.id, blocked: true })).status).toBe(200);
    expect((await a.call("GET", "/api/v1/social/overview")).body.friends).toEqual([]);
    expect((await a.call("GET", "/api/v1/social/players?q=Bol")).body.players).toEqual([]);
    expect((await b.call("GET", "/api/v1/social/players?q=Ada")).body.players).toEqual([]); // hidden both ways
    expect((await b.call("POST", "/api/v1/social/friends/request", { playerId: a.id })).body.error).toBe("unavailable"); // does not leak the block
    expect((await b.call("POST", `/api/v1/social/dm/${a.id}`, { text: "hi?" })).status).toBe(403);
    expect((await a.call("GET", `/api/v1/social/dm/${b.id}`)).status).toBe(403);
    expect((await a.call("GET", `/api/v1/social/groups/${g.id}/messages`)).body.messages).toEqual([]);
    expect((await a.call("POST", "/api/v1/social/blocks", { playerId: b.id, blocked: false })).status).toBe(200);
    expect((await a.call("GET", "/api/v1/social/players?q=Bol")).body.players).toHaveLength(1);
  });
  it("exposes block peers to realtime only with the internal secret", async () => {
    const { player, internal, app } = setup();
    const a = await player("Ada"), b = await player("Bola");
    await a.call("POST", "/api/v1/social/blocks", { playerId: b.id, blocked: true });
    expect((await app.inject({ method: "GET", url: `/internal/blocks/${b.id}` })).statusCode).toBe(403);
    expect((await internal("GET", `/internal/blocks/${b.id}`)).json()).toEqual({ peers: [a.id] }); // blocked side is covered too
  });
});

describe("chat safety", () => {
  it("is friends-only, policy-checked, rate limited and de-duplicated", async () => {
    const { player, befriend, tick } = setup();
    const a = await player("Ada"), b = await player("Bola"), stranger = await player("Chi");
    expect((await a.call("POST", `/api/v1/social/dm/${stranger.id}`, { text: "hello" })).status).toBe(403); // no open DMs
    await befriend(a, b);
    expect((await a.call("POST", `/api/v1/social/dm/${b.id}`, { text: "visit www.evil.com" })).body.error).toBe("text_rejected");
    expect((await a.call("POST", `/api/v1/social/dm/${b.id}`, { text: "my number 08031234567" })).body.error).toBe("text_rejected");
    expect((await a.call("POST", `/api/v1/social/dm/${b.id}`, { text: "hey" })).status).toBe(201);
    expect((await a.call("POST", `/api/v1/social/dm/${b.id}`, { text: "hey again" })).status).toBe(429); // min gap
    tick(1500);
    expect((await a.call("POST", `/api/v1/social/dm/${b.id}`, { text: "hey" })).status).toBe(409); // duplicate
    expect((await stranger.call("GET", `/api/v1/social/dm/${a.id}`)).status).toBe(403);
    expect((await b.call("GET", `/api/v1/social/dm/${a.id}`)).body.messages.map((m: any) => m.text)).toEqual(["hey"]);
  });
  it("mute hides a sender from the muter only", async () => {
    const { player, befriend, tick } = setup();
    const a = await player("Ada"), b = await player("Bola");
    await befriend(a, b);
    await a.call("POST", `/api/v1/social/dm/${b.id}`, { text: "one" }); tick(2000);
    await b.call("POST", "/api/v1/social/mutes", { playerId: a.id, muted: true });
    expect((await b.call("GET", `/api/v1/social/dm/${a.id}`)).body.messages).toEqual([]);
    expect((await a.call("GET", `/api/v1/social/dm/${b.id}`)).body.messages).toHaveLength(1);
  });
});

describe("groups", () => {
  it("are campus-scoped, capped by owner limits, and owner can remove members", async () => {
    const { player } = setup();
    const a = await player("Ada"), b = await player("Bola"), other = await player("Chi", "lagoon_tech");
    const g = (await a.call("POST", "/api/v1/social/groups", { name: "Library Crew", description: "quiet readers" })).body.group;
    expect((await a.call("POST", "/api/v1/social/groups", { name: "library crew", description: "" })).status).toBe(409);
    expect((await a.call("POST", "/api/v1/social/groups", { name: "visit site.com", description: "" })).status).toBe(400);
    expect((await other.call("POST", `/api/v1/social/groups/${g.id}/join`)).body.error).toBe("wrong_campus");
    expect((await other.call("GET", "/api/v1/social/groups")).body.groups).toEqual([]);
    expect((await b.call("POST", `/api/v1/social/groups/${g.id}/join`)).status).toBe(200);
    expect((await b.call("POST", `/api/v1/social/groups/${g.id}/kick`, { playerId: a.id })).status).toBe(403);
    expect((await a.call("POST", `/api/v1/social/groups/${g.id}/kick`, { playerId: b.id })).status).toBe(200);
    expect((await b.call("POST", `/api/v1/social/groups/${g.id}/join`)).status).toBe(404); // kicked players cannot rejoin
    expect((await b.call("GET", `/api/v1/social/groups/${g.id}/messages`)).status).toBe(403);
  });
});

describe("reports and moderation", () => {
  it("attaches message evidence, reaches the admin queue, and a mute stops chat", async () => {
    const { player, befriend, tick, internal, app } = setup();
    const a = await player("Ada"), b = await player("Bola");
    await befriend(a, b);
    const m = (await b.call("POST", `/api/v1/social/dm/${a.id}`, { text: "rude words" })).body.message; tick(2000);
    expect((await a.call("POST", "/api/v1/reports", { playerId: b.id, reason: "harassment", context: "chat", messageId: "fake" })).body.error).toBe("bad_evidence");
    expect((await a.call("POST", "/api/v1/reports", { playerId: b.id, reason: "harassment", context: "chat", messageId: m.id })).status).toBe(201);
    expect((await a.call("POST", "/api/v1/reports", { playerId: b.id, reason: "harassment", context: "chat" })).body.replay).toBe(true); // duplicate open report
    expect((await a.call("POST", "/api/v1/reports", { playerId: a.id, reason: "spam", context: "profile" })).status).toBe(400);
    expect((await app.inject({ method: "GET", url: "/internal/admin/reports" })).statusCode).toBe(403);
    const q = (await internal("GET", "/internal/admin/reports")).json() as any;
    expect(q.reports).toHaveLength(1);
    expect(q.reports[0]).toMatchObject({ targetName: "Bola", reporterName: "Ada", evidence: { text: "rude words" } });
    const r = await internal("POST", `/internal/admin/reports/${q.reports[0].id}/resolve`, { action: "chat_mute_24h", moderator: "admin" });
    expect(r.statusCode).toBe(200);
    expect((await internal("POST", `/internal/admin/reports/${q.reports[0].id}/resolve`, { action: "dismiss", moderator: "admin" })).statusCode).toBe(409);
    const blocked = await b.call("POST", `/api/v1/social/dm/${a.id}`, { text: "after mute" });
    expect(blocked.status).toBe(403); expect(blocked.body.error).toBe("chat_muted");
    expect((await b.call("GET", "/api/v1/social/overview")).body.chatMutedUntil).not.toBeNull();
    tick(25 * 3_600_000);
    expect((await b.call("POST", `/api/v1/social/dm/${a.id}`, { text: "back again" })).status).toBe(201); // sanctions expire
    expect(((await internal("GET", `/internal/admin/players/${b.id}`)).json() as any).moderation.log).toHaveLength(1);
  });
  it("three independent reporters trigger a temporary hold for review", async () => {
    const { player, internal } = setup();
    const t = await player("Target"), r1 = await player("Rone"), r2 = await player("Rtwo"), r3 = await player("Rthree");
    for (const r of [r1, r2, r3]) await r.call("POST", "/api/v1/reports", { playerId: t.id, reason: "spam", context: "world" });
    const mod = ((await internal("GET", `/internal/admin/players/${t.id}`)).json() as any).moderation;
    expect(mod.chatMutedUntil).not.toBeNull();
    expect(mod.log[0].action).toBe("auto_hold");
  });
  it("persists social state through a snapshot round trip", async () => {
    const { player, befriend, store } = setup();
    const a = await player("Ada"), b = await player("Bola");
    await befriend(a, b); await a.call("POST", "/api/v1/social/blocks", { playerId: b.id, blocked: true });
    const snap = JSON.parse(JSON.stringify(store.toSnapshot()));
    store.restore(snap);
    expect(store.social.hasBlocked(a.id, b.id)).toBe(true);
    delete snap.social; store.restore(snap); // pre-Phase-5 snapshots still load
    expect(store.social.hasBlocked(a.id, b.id)).toBe(false);
  });
});
