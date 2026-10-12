import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { MOD_ACTIONS, REPORT_CONTEXTS, REPORT_REASONS, SOCIAL, checkBio, checkChat, checkGroupName, dmKey, groupKey,
  type ChatMessage, type GroupView, type PublicPlayer, type SocialOverview, type TextOptions } from "@campus/domain";
import type { Group, StoredMessage } from "./social";
import type { EventName } from "@campus/analytics";
import type { Store } from "./store";
import { recordProgress } from "./progress-routes";

export interface SocialCtx {
  store: Store; now: () => number; textOpts: TextOptions; internalSecret: string; realtimeUrl?: string;
  who: (req: FastifyRequest) => string | null; deny: (reply: FastifyReply) => unknown;
  track: (sessionId: string, event: EventName, props?: Record<string, string | number>) => void;
  season: (ms: number) => string;
  log?: (msg: string, extra?: Record<string, unknown>) => void;
}
const Id = z.object({ playerId: z.string().min(1).max(64) }).strict();
const Text = z.object({ text: z.string().max(600) }).strict();
const limit = (max: number) => ({ config: { rateLimit: { max, timeWindow: "1 minute" } } });

export function registerSocial(app: FastifyInstance, c: SocialCtx): void {
  const { store, now } = c, sc = store.social;
  const pub = (id: string): PublicPlayer | null => store.publicPlayer(id);
  const pubs = (ids: string[]) => ids.map(pub).filter((p): p is PublicPlayer => p !== null);
  const bad = (reply: FastifyReply) => reply.code(400).send({ error: "invalid_request" });
  const award = (id: string, type: "FRIEND_ADDED" | "GROUP_JOINED", ref: string) => {
    recordProgress(store, id, { type }, now(), c.track);
    store.awardWarPoints(id, c.season(now()), new Date(now()).toISOString().slice(0, 10), type === "FRIEND_ADDED" ? 3 : 2, "social", `${type}:${ref}`, now()); for (const a of store.recordEvent(id, { type }, now())) c.track(id, "item_earned", { source: "achievement", achievement: a }); };
  const notifyBlock = (a: string, b: string, blocked: boolean) => {
    if (!c.realtimeUrl) return;
    fetch(`${c.realtimeUrl}/internal/blocks`, { method: "POST", headers: { "content-type": "application/json", "x-internal-secret": c.internalSecret }, body: JSON.stringify({ a, b, blocked }) })
      .catch((e) => c.log?.("realtime block notify failed", { error: String(e) }));
  };
  const groupView = (g: Group, me: string): GroupView => ({ id: g.id, name: g.name, description: g.description, campus: g.campus, ownerId: g.ownerId, members: Object.keys(g.members).length, joined: me in g.members, owner: g.ownerId === me });
  const msgs = (list: StoredMessage[], me: string): ChatMessage[] => list.map((m) => ({ id: m.id, from: m.from, fromName: pub(m.from)?.name ?? "Player", text: m.text, at: m.at, mine: m.from === me }));
  const sendErr = (reply: FastifyReply, r: { code: string; retryMs?: number; until?: string }) => {
    if (r.code === "chat_muted") return reply.code(403).send({ error: "chat_muted", until: r.until, message: "Chat is paused on your account while a moderator reviews it." });
    if (r.code === "rate_limited") return reply.code(429).send({ error: "rate_limited", retryMs: r.retryMs, message: "You are sending messages too fast." });
    if (r.code === "duplicate") return reply.code(409).send({ error: "duplicate", message: "You just sent that." });
    return reply.code(403).send({ error: "forbidden", message: "You can't chat here." });
  };

  app.get("/api/v1/social/overview", async (req, reply) => {
    const me = c.who(req); if (!me) return c.deny(reply);
    const body: SocialOverview = {
      friends: sc.friendsOf(me).map((id) => ({ ...pub(id)!, online: sc.isOnline(id) })).filter((f) => f.id), // presence is online/offline only, never a location
      incoming: pubs(sc.incomingOf(me).filter((id) => !sc.blockedEitherWay(me, id))), outgoing: pubs(sc.outgoingOf(me)),
      blocked: sc.blockedList(me).map((id) => ({ id, name: pub(id)?.name ?? "Player" })), muted: sc.mutedList(me).map((id) => ({ id, name: pub(id)?.name ?? "Player" })),
      groups: sc.groupsOf(me).map((g) => groupView(g, me)), chatMutedUntil: sc.chatMutedUntil(me, now()) ? new Date(sc.chatMutedUntil(me, now())!).toISOString() : null,
    };
    return body;
  });

  app.get("/api/v1/social/players", limit(30), async (req, reply) => {
    const me = c.who(req); if (!me) return c.deny(reply);
    const q = z.string().trim().min(SOCIAL.searchMin).max(20).safeParse((req.query as { q?: string }).q);
    if (!q.success) return reply.code(400).send({ error: "query_too_short", message: `Type at least ${SOCIAL.searchMin} letters.` });
    const friends = new Set(sc.friendsOf(me)), inc = new Set(sc.incomingOf(me)), out = new Set(sc.outgoingOf(me));
    const players = store.searchPlayers(q.data, SOCIAL.searchLimit + 2).filter((id) => id !== me && !sc.blockedEitherWay(me, id)).slice(0, SOCIAL.searchLimit)
      .map((id) => ({ ...pub(id)!, relation: friends.has(id) ? "friend" : inc.has(id) ? "incoming" : out.has(id) ? "outgoing" : "none" }));
    return { players };
  });

  app.post("/api/v1/social/friends/request", limit(20), async (req, reply) => {
    const me = c.who(req); if (!me) return c.deny(reply);
    const p = Id.safeParse(req.body); if (!p.success) return bad(reply);
    const r = sc.requestFriend(me, p.data.playerId, now());
    if (!r.ok) {
      const m: Record<string, string> = { self: "That's you.", unavailable: "You can't send a request to this player.", already_friends: "You are already friends.", too_many_requests: "You have too many pending requests.", friend_limit: "Friend list is full." };
      return reply.code(r.code === "already_friends" ? 409 : r.code === "too_many_requests" ? 429 : 400).send({ error: r.code, message: m[r.code] });
    }
    if (r.newlyFriends) { c.track(me, "friend_added"); award(me, "FRIEND_ADDED", p.data.playerId); award(p.data.playerId, "FRIEND_ADDED", me); }
    return { state: r.state };
  });
  app.post("/api/v1/social/friends/respond", limit(40), async (req, reply) => {
    const me = c.who(req); if (!me) return c.deny(reply);
    const p = z.object({ playerId: z.string().min(1).max(64), accept: z.boolean() }).strict().safeParse(req.body); if (!p.success) return bad(reply);
    const r = sc.respond(me, p.data.playerId, p.data.accept, now());
    if (!r.ok) return reply.code(r.code === "friend_limit" ? 400 : 404).send({ error: r.code, message: r.code === "friend_limit" ? "Friend list is full." : "That request is no longer available." });
    if (r.newlyFriends) { c.track(me, "friend_added"); award(me, "FRIEND_ADDED", p.data.playerId); award(p.data.playerId, "FRIEND_ADDED", me); }
    return { state: r.state };
  });
  app.post("/api/v1/social/friends/remove", limit(40), async (req, reply) => {
    const me = c.who(req); if (!me) return c.deny(reply);
    const p = Id.safeParse(req.body); if (!p.success) return bad(reply);
    sc.removeFriend(me, p.data.playerId); return { ok: true };
  });

  app.post("/api/v1/social/blocks", limit(30), async (req, reply) => {
    const me = c.who(req); if (!me) return c.deny(reply);
    const p = z.object({ playerId: z.string().min(1).max(64), blocked: z.boolean() }).strict().safeParse(req.body); if (!p.success) return bad(reply);
    if (!p.data.blocked) { sc.unblock(me, p.data.playerId); notifyBlock(me, p.data.playerId, sc.blockedEitherWay(me, p.data.playerId)); return { ok: true }; }
    const r = sc.block(me, p.data.playerId);
    if (!r.ok) return reply.code(r.code === "self" ? 400 : 404).send({ error: r.code });
    c.track(me, "user_blocked"); notifyBlock(me, p.data.playerId, true);
    return { ok: true };
  });
  app.post("/api/v1/social/mutes", limit(30), async (req, reply) => {
    const me = c.who(req); if (!me) return c.deny(reply);
    const p = z.object({ playerId: z.string().min(1).max(64), muted: z.boolean() }).strict().safeParse(req.body); if (!p.success) return bad(reply);
    if (!p.data.muted) { sc.unmute(me, p.data.playerId); return { ok: true }; }
    const r = sc.mute(me, p.data.playerId);
    return r.ok ? { ok: true } : reply.code(r.code === "self" ? 400 : 404).send({ error: r.code });
  });

  // ---- groups ----
  app.get("/api/v1/social/groups", async (req, reply) => {
    const me = c.who(req); if (!me) return c.deny(reply);
    const campus = store.publicPlayer(me)!.campus;
    return { groups: sc.groupsForCampus(campus).filter((g) => !sc.blockedEitherWay(me, g.ownerId)).slice(0, 30).map((g) => groupView(g, me)) };
  });
  app.post("/api/v1/social/groups", limit(10), async (req, reply) => {
    const me = c.who(req); if (!me) return c.deny(reply);
    const p = z.object({ name: z.string().max(80), description: z.string().max(300).default("") }).strict().safeParse(req.body); if (!p.success) return bad(reply);
    const n = checkGroupName(p.data.name, c.textOpts);
    if (!n.ok) return reply.code(400).send({ error: "text_rejected", field: "name", reason: n.reason, message: n.message });
    const d = checkBio(p.data.description, c.textOpts);
    if (!d.ok || d.text.length > SOCIAL.groupDesc) return reply.code(400).send({ error: "text_rejected", field: "description", message: d.ok ? "Description is too long." : d.message });
    const r = sc.createGroup(me, n.text, d.text, now());
    if (!r.ok) return reply.code(r.code === "name_taken" ? 409 : 400).send({ error: r.code, message: r.code === "name_taken" ? "A group on your campus already has that name." : "You have reached your group limit." });
    c.track(me, "group_joined", { role: "owner" }); award(me, "GROUP_JOINED", r.group.id);
    return reply.code(201).send({ group: groupView(r.group, me) });
  });
  app.post("/api/v1/social/groups/:id/join", limit(20), async (req, reply) => {
    const me = c.who(req); if (!me) return c.deny(reply);
    const r = sc.joinGroup(me, (req.params as { id: string }).id, now());
    if (!r.ok) return reply.code(r.code === "unavailable" ? 404 : 400).send({ error: r.code, message: { unavailable: "That group isn't available.", wrong_campus: "Groups are for their own campus.", group_full: "That group is full.", group_limit: "You have joined the maximum number of groups." }[r.code] });
    if (r.joined) { c.track(me, "group_joined", { role: "member" }); award(me, "GROUP_JOINED", (req.params as { id: string }).id); }
    return { ok: true, group: groupView(sc.group((req.params as { id: string }).id)!, me) };
  });
  app.post("/api/v1/social/groups/:id/leave", limit(20), async (req, reply) => {
    const me = c.who(req); if (!me) return c.deny(reply);
    sc.leaveGroup(me, (req.params as { id: string }).id); return { ok: true };
  });
  app.post("/api/v1/social/groups/:id/kick", limit(20), async (req, reply) => {
    const me = c.who(req); if (!me) return c.deny(reply);
    const p = Id.safeParse(req.body); if (!p.success) return bad(reply);
    const r = sc.kick(me, (req.params as { id: string }).id, p.data.playerId);
    return r.ok ? { ok: true } : reply.code(r.code === "forbidden" ? 403 : r.code === "self" ? 400 : 404).send({ error: r.code });
  });
  app.get("/api/v1/social/groups/:id/members", async (req, reply) => {
    const me = c.who(req); if (!me) return c.deny(reply);
    const g = sc.group((req.params as { id: string }).id);
    if (!g || !(me in g.members)) return reply.code(403).send({ error: "forbidden" });
    return { members: Object.entries(g.members).filter(([id]) => id === me || !sc.blockedEitherWay(me, id)).map(([id, m]) => ({ ...pub(id)!, role: m.role })) };
  });

  // ---- chat (friends-only DMs, members-only group chat; clients poll) ----
  const chatRoutes = (path: string, conv: (req: FastifyRequest, me: string) => string) => {
    app.get(path, async (req, reply) => {
      const me = c.who(req); if (!me) return c.deny(reply);
      const h = sc.history(conv(req, me), me, (req.query as { after?: string }).after);
      return h ? { messages: msgs(h, me) } : reply.code(403).send({ error: "forbidden", message: "You can't read this chat." });
    });
    app.post(path, limit(40), async (req, reply) => {
      const me = c.who(req); if (!me) return c.deny(reply);
      const p = Text.safeParse(req.body); if (!p.success) return bad(reply);
      const t = checkChat(p.data.text, c.textOpts);
      if (!t.ok) return reply.code(400).send({ error: "text_rejected", field: "text", reason: t.reason, message: t.message });
      const r = sc.send(conv(req, me), me, t.text, now());
      if (!r.ok) return sendErr(reply, r);
      c.track(me, "message_sent", { kind: conv(req, me).startsWith("g:") ? "group" : "dm" });
      recordProgress(store, me, { type: "MESSAGE_SENT" }, now(), c.track);
      return reply.code(201).send({ message: msgs([r.message], me)[0] });
    });
  };
  chatRoutes("/api/v1/social/dm/:id", (req, me) => dmKey(me, (req.params as { id: string }).id));
  chatRoutes("/api/v1/social/groups/:id/messages", (req) => groupKey((req.params as { id: string }).id));

  // ---- reports ----
  app.post("/api/v1/reports", limit(15), async (req, reply) => {
    const me = c.who(req); if (!me) return c.deny(reply);
    const p = z.object({ playerId: z.string().min(1).max(64), reason: z.enum(REPORT_REASONS), context: z.enum(REPORT_CONTEXTS), note: z.string().max(400).default(""), messageId: z.string().max(64).optional() }).strict().safeParse(req.body);
    if (!p.success) return bad(reply);
    const note = p.data.note.normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, SOCIAL.reportNoteMax);
    const r = sc.createReport({ reporter: me, target: p.data.playerId, reason: p.data.reason, context: p.data.context, note, ...(p.data.messageId ? { messageId: p.data.messageId } : {}) }, now());
    if (!r.ok) return reply.code(r.code === "rate_limited" ? 429 : 400).send({ error: r.code, message: r.code === "rate_limited" ? "You have sent a lot of reports today. A moderator will review them." : "We couldn't attach that report." });
    if (!r.replay) c.track(me, "report_created", { reason: p.data.reason, context: p.data.context });
    return reply.code(r.replay ? 200 : 201).send({ ok: true, replay: r.replay });
  });

  // ---- internal (realtime + admin console). Shared secret; never exposed to browsers. ----
  const internal = (req: FastifyRequest, reply: FastifyReply): boolean => { if (req.headers["x-internal-secret"] !== c.internalSecret) { reply.code(403).send({ error: "forbidden" }); return false; } return true; };
  app.post("/internal/presence", async (req, reply) => {
    if (!internal(req, reply)) return;
    const p = z.object({ playerId: z.string(), online: z.boolean() }).safeParse(req.body); if (!p.success) return bad(reply);
    sc.setOnline(p.data.playerId, p.data.online); return { ok: true };
  });
  app.get("/internal/blocks/:id", async (req, reply) => { if (!internal(req, reply)) return; return { peers: sc.blockPeers((req.params as { id: string }).id) }; });
  app.get("/internal/admin/reports", async (req, reply) => {
    if (!internal(req, reply)) return;
    return { reports: sc.openReports().map((r) => ({ ...r, reporterName: pub(r.reporter)?.name ?? "?", targetName: pub(r.target)?.name ?? "?" })) };
  });
  app.post("/internal/admin/reports/:id/resolve", async (req, reply) => {
    if (!internal(req, reply)) return;
    const p = z.object({ action: z.enum(MOD_ACTIONS), moderator: z.string().min(1).max(40) }).safeParse(req.body); if (!p.success) return bad(reply);
    const r = sc.resolveReport((req.params as { id: string }).id, p.data.action, p.data.moderator, now());
    return r.ok ? { report: r.report } : reply.code(r.code === "not_found" ? 404 : 409).send({ error: r.code });
  });
  app.get("/internal/admin/players/:id", async (req, reply) => {
    if (!internal(req, reply)) return;
    const id = (req.params as { id: string }).id, p = pub(id);
    return p ? { player: p, moderation: sc.moderationFor(id, now()) } : reply.code(404).send({ error: "not_found" });
  });
}
