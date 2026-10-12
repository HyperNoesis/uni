import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { z } from "zod";
import {
  ActivityCompleteRequest,
  CAMPUSES,
  CreateSessionRequest,
  HUNT_START_POINT_ID,
  HUNT_STOPS,
  INTERACTION_POINTS,
  REACTION,
  SaveHomeRequest,
  SHOP_CATALOG,
  getItem,
  UpdateProfileRequest,
  checkBio,
  checkDisplayName,
  reputationTitle,
  scoreReaction,
  type ActivityCompleteResponse,
  type LevelUp,
  type ActivityStartResponse,
  type HomeResponse,
  type IdentityResponse,
  type InventoryResponse,
  type SessionResponse,
} from "@campus/domain";
import { signToken, verifyToken } from "@campus/domain/token";
import { createTracker, type EventName, type Props, type Sink } from "@campus/analytics";
import type { PersistenceStatus } from "./persistence";
import { Store } from "./store";
import { registerSocial } from "./social-routes";
import { registerEvents } from "./events-routes";
import { grant, recordProgress, registerProgress } from "./progress-routes";
import { WARS } from "./wars";

export interface AppConfig {
  sessionSecret: string;
  internalSecret: string;
  allowedOrigin: string;
  /** Realtime server base URL for instant block propagation (env REALTIME_INTERNAL_URL). Optional. */
  realtimeUrl?: string;
  /** Test seam: deterministic shift task selection. */
  rng?: () => number;
  now?: () => number;
  rateLimitMax?: number;
  /** Operator blocked terms for names and bios (env BLOCKED_TERMS). */
  blockedTerms?: string[];
  /** Reports durability to /readyz; omitted when memory-only. */
  persistence?: () => PersistenceStatus;
  /** Optional analytics sink (anonymous player id as session id; no personal data). */
  analytics?: Sink;
  /** Fastify/pino logger options. Off by default so tests stay quiet. */
  logger?: boolean | { level: string; redact?: { paths: string[]; remove: boolean } };
}

const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const GRANT_TTL_MS = 30_000;
const QUIZ_DAILY_LIMIT = 5;
const QUIZ_RUN_TTL_MS = 3 * 60_000;
const QUIZ_MIN_ANSWER_MS = 1_500;
const HUNT_DAILY_LIMIT = 3;
const HUNT_RUN_TTL_MS = 10 * 60_000;

interface QuizQuestion {
  id: string;
  category: string;
  prompt: string;
  choices: string[];
  answerIndex: number;
  explanation: string;
}
interface QuizRun extends QuizQuestion {
  runId: string;
  playerId: string;
  startedAt: number;
  completed: boolean;
}
interface HuntRun {
  runId: string;
  playerId: string;
  startedAt: number;
  nextStep: number;
  completed: boolean;
}

// Answers remain server-side; the start response only exposes prompt and choices.
const QUIZ_QUESTIONS: readonly QuizQuestion[] = [
  { id: "logic-01", category: "Logic", prompt: "A campus shuttle leaves every 15 minutes. If one leaves at 9:00, which time is also a departure?", choices: ["9:20", "9:30", "9:40", "9:50"], answerIndex: 1, explanation: "A 15-minute schedule gives departures at 9:00, 9:15, 9:30, 9:45, and so on." },
  { id: "science-01", category: "Science", prompt: "Which layer of Earth's atmosphere contains most weather events?", choices: ["Troposphere", "Mesosphere", "Thermosphere", "Exosphere"], answerIndex: 0, explanation: "Most clouds, rain, and storms happen in the troposphere, the lowest atmospheric layer." },
  { id: "technology-01", category: "Technology", prompt: "In a queue data structure, which item is normally removed first?", choices: ["The newest item", "The middle item", "The oldest item", "A random item"], answerIndex: 2, explanation: "A queue follows first-in, first-out (FIFO): the earliest item leaves first." },
  { id: "math-01", category: "Numbers", prompt: "What is 15% of 200?", choices: ["15", "20", "30", "45"], answerIndex: 2, explanation: "10% of 200 is 20 and 5% is 10, so 15% is 30." },
  { id: "digital-01", category: "Digital life", prompt: "A website responds with HTTP 401. What is the most likely issue?", choices: ["Authentication is missing or invalid", "The screen is too bright", "The internet is too fast", "The image is oversized"], answerIndex: 0, explanation: "HTTP 401 indicates that valid authentication credentials are required or were not accepted." },
  { id: "environment-01", category: "Environment", prompt: "Which option is a renewable energy source?", choices: ["Coal", "Solar power", "Diesel", "Natural gas"], answerIndex: 1, explanation: "Solar energy is replenished by sunlight, unlike finite fossil fuels." },
  { id: "study-01", category: "Campus life", prompt: "You are confused about an assignment deadline. What is the most reliable first step?", choices: ["Guess and hope", "Ask an unrelated group chat", "Check the official course instructions or ask the lecturer", "Wait until after the deadline"], answerIndex: 2, explanation: "Use the official course instructions or contact the lecturer/teaching assistant for an authoritative answer." },
  { id: "math-02", category: "Numbers", prompt: "A notebook costs ₦800. What is the total cost of three notebooks before any discount?", choices: ["₦1,600", "₦2,000", "₦2,400", "₦3,200"], answerIndex: 2, explanation: "₦800 × 3 = ₦2,400." },
];

function currentSeason(nowMs: number) {
  const today = new Date(nowMs);
  const weekday = today.getUTCDay() || 7;
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - weekday + 1));
  const end = new Date(start.getTime() + 7 * 86_400_000);
  const thursday = new Date(start.getTime() + 3 * 86_400_000);
  const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  const week = Math.ceil((((thursday.getTime() - yearStart) / 86_400_000) + 1) / 7);
  return {
    id: `${thursday.getUTCFullYear()}-W${String(week).padStart(2, "0")}`,
    name: `Campus Wars · Week of ${start.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}`,
    status: "active" as const,
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    pointsRule: "Verified activity rewards count toward your campus. Each player can contribute at most 30 Campus Wars points per UTC day.",
  };
}

export function buildApp(cfg: AppConfig, store = new Store()): { app: FastifyInstance; store: Store } {
  const now = cfg.now ?? Date.now;
  const track = (sessionId: string, event: EventName, props: Props = {}) => {
    if (!cfg.analytics) return;
    try { createTracker({ sink: cfg.analytics, sessionId, now: () => new Date(now()) }).track(event, props); } catch { /* analytics must never break a request */ }
  };
  const app = Fastify({ logger: cfg.logger ?? false, bodyLimit: 16 * 1024 });

  // Action endpoints (e.g. activity start) POST with no body; accept empty JSON bodies.
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
    if (body === "" || body === undefined) return done(null, undefined);
    try {
      done(null, JSON.parse(body as string));
    } catch {
      const err = new Error("invalid_json") as Error & { statusCode: number };
      err.statusCode = 400;
      done(err, undefined);
    }
  });

  app.register(cors,{ origin: cfg.allowedOrigin, methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"] });
  app.register(rateLimit, { max: cfg.rateLimitMax ?? 120, timeWindow: "1 minute" });

  app.addHook("onSend", async (req, reply) => {
    reply.header("x-content-type-options", "nosniff");
    reply.header("referrer-policy", "no-referrer");
    reply.header("x-correlation-id", String(req.id));
  });

  // Client errors keep their status and message; unexpected errors are logged with the correlation id and never leak internals.
  app.setErrorHandler((err: Error & { statusCode?: number; code?: string }, req, reply) => {
    const status = err.statusCode && err.statusCode >= 400 && err.statusCode < 500 ? err.statusCode : 500;
    if (status >= 500) {
      req.log.error({ err, correlationId: req.id }, "unhandled error");
      return reply.code(500).send({ error: "internal_error", message: "Something went wrong.", correlationId: String(req.id) });
    }
    return reply.code(status).send({ error: err.code ?? "bad_request", message: err.message, statusCode: status });
  });

  const authed = (req: FastifyRequest): string | null => {
    const h = req.headers.authorization;
    if (!h?.startsWith("Bearer ")) return null;
    return verifyToken(h.slice(7), cfg.sessionSecret, now())?.sub ?? null;
  };

  app.get("/healthz", async () => ({ ok: true }));
  // Ready = can serve AND can keep what players do. A failing disk takes the instance out of rotation;
  // error text stays in logs, never in the response.
  app.get("/readyz", async (_req, reply) => {
    const p = cfg.persistence?.();
    if (p?.lastError) return reply.code(503).send({ ok: false, persistence: { kind: p.kind, healthy: false } });
    return { ok: true, persistence: p ? { kind: p.kind, healthy: true, lastSavedAt: p.lastSavedAt } : { kind: "memory", healthy: true } };
  });

  const textOpts = { blockedTerms: cfg.blockedTerms ?? [] };
  const quizRuns = new Map<string, QuizRun>();
  const huntRuns = new Map<string, HuntRun>(); // playerId -> one active server-owned route
  const who = (req: FastifyRequest): string | null => { const id = authed(req); return id && store.profile(id) ? id : null; };
  const textRejected = (reply: import("fastify").FastifyReply, field: string, reason: string, message: string) =>
    reply.code(400).send({ error: "text_rejected", field, reason, message });

  app.get("/api/v1/campuses", async () => ({
    campuses: Object.entries(CAMPUSES).map(([id, c]) => ({ id, ...c })),
  }));

  app.post("/api/v1/auth/session", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
    const parsed = CreateSessionRequest.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_request", issues: parsed.error.issues });
    const name = checkDisplayName(parsed.data.displayName, textOpts);
    if (!name.ok) return textRejected(reply, "displayName", name.reason, name.message);
    const profile = store.createPlayer({ ...parsed.data, displayName: name.text });
    const token = signToken({ sub: profile.id, exp: now() + TOKEN_TTL_MS }, cfg.sessionSecret);
    track(profile.id, "avatar_created");
    track(profile.id, "campus_joined", { campus: profile.campus });
    const body: SessionResponse = { token, profile };
    return reply.code(201).send(body);
  });

  app.get("/api/v1/me", async (req, reply) => {
    const id = authed(req);
    if (!id) return reply.code(401).send({ error: "unauthorized" });
    const profile = store.profile(id);
    if (!profile) return reply.code(401).send({ error: "unauthorized" });
    return { profile };
  });

  // ---- Identity, inventory, home (Phase 2) ----
  const identity = (id: string, newlyUnlocked?: string[]): IdentityResponse => {
    const profile = store.profile(id)!;
    const t = reputationTitle(profile.reputation);
    return { profile, title: t.title, nextTitle: t.next, renameAvailableAt: store.renameAvailableAt(id, now()), achievements: store.achievements(id), ...(newlyUnlocked ? { newlyUnlocked } : {}) };
  };
  const deny = (reply: import("fastify").FastifyReply) => reply.code(401).send({ error: "unauthorized" });

  app.get("/api/v1/profile", async (req, reply) => { const id = who(req); return id ? identity(id) : deny(reply); });

  app.patch("/api/v1/profile", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
    const id = who(req);
    if (!id) return deny(reply);
    const parsed = UpdateProfileRequest.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_request", issues: parsed.error.issues });
    const patch: { displayName?: string; bio?: string; avatar?: NonNullable<typeof parsed.data.avatar> } = {};
    if (parsed.data.displayName !== undefined) {
      const n = checkDisplayName(parsed.data.displayName, textOpts);
      if (!n.ok) return textRejected(reply, "displayName", n.reason, n.message);
      patch.displayName = n.text;
    }
    if (parsed.data.bio !== undefined) {
      const b = checkBio(parsed.data.bio, textOpts);
      if (!b.ok) return textRejected(reply, "bio", b.reason, b.message);
      patch.bio = b.text;
    }
    if (parsed.data.avatar !== undefined) patch.avatar = parsed.data.avatar;
    const r = store.updateProfile(id, patch, now());
    if (!r.ok) {
      if (r.code === "rename_cooldown") return reply.code(429).send({ error: "rename_cooldown", retryAt: r.retryAt, message: "You can change your name once a week." });
      return deny(reply);
    }
    for (const a of r.unlocked) track(id, "item_earned", { source: "achievement", achievement: a });
    return identity(id, r.unlocked);
  });

  app.get("/api/v1/inventory", async (req, reply) => {
    const id = who(req);
    if (!id) return deny(reply);
    const body: InventoryResponse = { items: store.inventory(id) };
    return body;
  });

  // ---- Server-priced room-cosmetic shop ----
  app.get("/api/v1/shop", async (req, reply) => {
    const id = who(req);
    if (!id) return deny(reply);
    const owned = store.ownedCounts(id);
    return {
      currency: "CAMPUS_COINS" as const,
      balance: store.profile(id)!.coins,
      offers: SHOP_CATALOG.map((offer) => {
        const item = getItem(offer.itemId)!;
        return { ...offer, item: { id: item.id, name: item.name, layer: item.layer, w: item.w, h: item.h, art: item.art, color: item.color, accent: item.accent }, owned: owned[item.id] ?? 0 };
      }),
    };
  });

  app.post("/api/v1/shop/purchase", { config: { rateLimit: { max: 12, timeWindow: "1 minute" } } }, async (req, reply) => {
    const id = who(req);
    if (!id) return deny(reply);
    const rawKey = req.headers["idempotency-key"];
    if (typeof rawKey !== "string" || rawKey.length < 8 || rawKey.length > 80 || !/^[a-zA-Z0-9._:-]+$/.test(rawKey)) {
      return reply.code(400).send({ error: "idempotency_key_required", message: "A valid idempotency key is required." });
    }
    const parsed = z.object({ itemId: z.string().min(1).max(40) }).strict().safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_request" });
    const responseKey = `shop-purchase:${rawKey}`;
    const cached = store.getIdemResponse(id, responseKey);
    if (cached) {
      const prior = cached as { itemId?: string };
      if (prior.itemId !== parsed.data.itemId) return reply.code(409).send({ error: "idempotency_conflict", message: "That purchase key was already used for another item. Start a new purchase." });
      return cached;
    }
    const bought = store.purchaseItem(id, parsed.data.itemId, rawKey, now());
    if (!bought.ok) {
      if (bought.code === "not_found") return deny(reply);
      if (bought.code === "not_shop_item") return reply.code(404).send({ error: "item_not_for_sale", message: "That item is not in the shop." });
      if (bought.code === "insufficient_funds") return reply.code(402).send({ error: "insufficient_funds", message: "You need more Campus Coins for this item." });
      return reply.code(409).send({ error: "idempotency_conflict", message: "That purchase key was already used for another item. Start a new purchase." });
    }
    const body = { ok: true as const, itemId: bought.itemId, itemName: bought.itemName, price: bought.price, profile: bought.profile, inventory: bought.inventory };
    store.setIdemResponse(id, responseKey, body);
    if (!bought.replay) track(id, "item_purchased", { item: bought.itemId, price: bought.price });
    return body;
  });

  app.get("/api/v1/home", async (req, reply) => {
    const id = who(req);
    if (!id) return deny(reply);
    const h = store.home(id)!;
    const body: HomeResponse = { layout: h.layout, revision: h.revision, updatedAt: h.updatedAt };
    return body;
  });

  app.put("/api/v1/home", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const id = who(req);
    if (!id) return deny(reply);
    const parsed = SaveHomeRequest.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_request", issues: parsed.error.issues });
    const r = store.saveHome(id, parsed.data.layout, parsed.data.revision, now());
    if (!r.ok) {
      if (r.code === "conflict") return reply.code(409).send({ error: "revision_conflict", revision: r.revision, message: "Your room changed somewhere else. Reload to continue." });
      if (r.code === "invalid") return reply.code(422).send({ error: "invalid_layout", errors: r.errors });
      return deny(reply);
    }
    for (const a of r.unlocked) track(id, "item_earned", { source: "achievement", achievement: a });
    const body: HomeResponse = { layout: r.home.layout, revision: r.home.revision, updatedAt: r.home.updatedAt, ...(r.unlocked.length ? { newlyUnlocked: r.unlocked } : {}) };
    return body;
  });

  app.get("/api/v1/leaderboards/current", async () => ({
    season: "preseason",
    entries: store.leaderboard().map((e) => ({ ...e, name: CAMPUSES[e.campus].name })),
  }));

  // Campus Wars is a real weekly competition. Scores are normalized to active contributors,
  // and individual daily points are capped in Store (which snapshots the contribution state).
  app.get("/api/v1/campus-wars/current", async (req) => {
    const t = now(), season = currentSeason(t), id = authed(req), day = new Date(t).toISOString().slice(0, 10);
    store.wars.snapshotSeason(currentSeason(t - 7 * 86_400_000).id, t); // freeze last week's final standings the first time anyone looks after rollover
    const entries = store.campusWarLeaderboard(season.id);
    let rank = 0;
    return {
      season,
      scoring: {
        rule: WARS.rule, pointsPerPlayerPerUtcDay: WARS.dailyPlayerCap, sourceCaps: WARS.sourceCaps, minContributors: WARS.minContributors, normalization: "average_points_per_contributor",
        explanation: `Your campus score is the average Wars points per active player, so big and small campuses compete fairly. Each player can add at most ${WARS.dailyPlayerCap} points a day, with a cap per activity type. A campus needs ${WARS.minContributors} active players to be ranked; others show as Rising.`,
      },
      entries: entries.map((e) => ({ ...e, rank: e.ranked ? ++rank : null })),
      ...(id && store.profile(id) ? { me: { campus: store.profile(id)!.campus, ...store.wars.me(id, season.id, day) } } : {}),
    };
  });
  app.get("/api/v1/campus-wars/history", async () => ({ seasons: store.wars.history() }));

  /** Key of a live proximity grant for any interaction point offering `activity`, or null. */
  const grantedPoint = (playerId: string, activity: "reaction" | "quiz", t: number): string | null => {
    for (const pt of INTERACTION_POINTS) {
      if (pt.activity !== activity) continue;
      const key = `${playerId}:${pt.id}`, exp = store.grants.get(key);
      if (exp && exp >= t) return key;
    }
    return null;
  };

  // Internal: realtime attests that a player was within interaction range.
  app.post("/internal/proximity-grant", async (req, reply) => {
    if (req.headers["x-internal-secret"] !== cfg.internalSecret) return reply.code(403).send({ error: "forbidden" });
    const body = z.object({ playerId: z.string(), pointId: z.string() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_request" });
    store.grants.set(`${body.data.playerId}:${body.data.pointId}`, now() + GRANT_TTL_MS);
    return { ok: true };
  });

  app.post("/api/v1/activities/reaction/start", async (req, reply) => {
    const id = authed(req);
    if (!id || !store.profile(id)) return reply.code(401).send({ error: "unauthorized" });

    // Any Reaction Challenge marker counts (Student Commons board or a room marker): the realtime server attested proximity to it.
    if (!grantedPoint(id, "reaction", now())) return reply.code(403).send({ error: "not_in_range", message: "Walk up to a Reaction Challenge marker first." });

    const last = store.lastCompletedAt(id);
    if (now() - last < REACTION.cooldownMs) return reply.code(429).send({ error: "cooldown" });

    const delayMs = REACTION.minDelayMs + Math.floor(Math.random() * (REACTION.maxDelayMs - REACTION.minDelayMs));
    const run = { id: randomUUID(), playerId: id, startedAt: now(), delayMs, completed: false };
    store.runs.set(run.id, run);
    const body: ActivityStartResponse = { runId: run.id, delayMs };
    return body;
  });

  app.post("/api/v1/activities/reaction/complete", async (req, reply) => {
    const id = authed(req);
    if (!id || !store.profile(id)) return reply.code(401).send({ error: "unauthorized" });

    const key = req.headers["idempotency-key"];
    if (typeof key !== "string" || key.length < 8 || key.length > 80) {
      return reply.code(400).send({ error: "idempotency_key_required" });
    }
    const cached = store.getIdemResponse(id, key);
    if (cached) return cached;

    const parsed = ActivityCompleteRequest.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_request" });

    const run = store.runs.get(parsed.data.runId);
    if (!run || run.playerId !== id) return reply.code(404).send({ error: "run_not_found" });
    if (run.completed) return reply.code(409).send({ error: "run_already_completed" });
    const t = now();
    if (t - run.startedAt > REACTION.runTtlMs) {
      run.completed = true;
      return reply.code(410).send({ error: "run_expired" });
    }
    run.completed = true;

    // The server measures time itself. The client sends no timing at all.
    const reactionMs = t - (run.startedAt + run.delayMs);
    const day = new Date(t).toISOString().slice(0, 10);
    const dailyUsed = store.dailyUsed(id, day);
    const capped = dailyUsed >= REACTION.dailyRewardCap;

    const result = capped ? { coins: 0, reputation: 0, tooEarly: false } : scoreReaction(reactionMs);
    store.noteCompletion(id, t, day, !capped && !result.tooEarly);

    let newlyUnlocked: string[] = [];
    let levelUp: LevelUp | null = null;
    if (result.coins > 0) {
      levelUp = grant(store, id, { key: `reaction:${run.id}`, source: "ACTIVITY_COMPLETED", coins: result.coins, reputation: result.reputation, meta: { activity: "reaction", runId: run.id, reactionMs } }, track);
      store.awardWarPoints(id, currentSeason(t).id, new Date(t).toISOString().slice(0, 10), 5, "reaction", `reaction:${run.id}`, t);
      newlyUnlocked = store.recordEvent(id, { type: "ACTIVITY_REWARDED", activity: "reaction" }, t);
    }
    if (!result.tooEarly) newlyUnlocked.push(...recordProgress(store, id, { type: "ACTIVITY_COMPLETED", activity: "reaction", reactionMs }, t, track).achievements);

    const body: ActivityCompleteResponse = {
      rewardCoins: result.coins,
      rewardReputation: result.reputation,
      reactionMs,
      tooEarly: result.tooEarly,
      profile: store.profile(id)!,
      ...(newlyUnlocked.length ? { newlyUnlocked } : {}),
      ...(levelUp ? { levelUp } : {}),
    };
    store.setIdemResponse(id, key, body);
    return body;
  });

  app.post("/api/v1/activities/quiz/start", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const id = who(req);
    if (!id) return deny(reply);
    const t = now();
    const day = new Date(t).toISOString().slice(0, 10);
    if (store.quizAttemptsToday(id, day) >= QUIZ_DAILY_LIMIT) {
      return reply.code(429).send({ error: "daily_limit", message: "You have used today's five quiz attempts. Come back tomorrow." });
    }
    for (const [rid, r] of quizRuns) {
      if (r.completed || t - r.startedAt > QUIZ_RUN_TTL_MS) quizRuns.delete(rid);
      else if (r.playerId === id) return reply.code(409).send({ error: "quiz_in_progress", message: "Finish your current quiz question first." });
    }
    const quizGrant = grantedPoint(id, "quiz", t);
    if (!quizGrant) return reply.code(403).send({ error: "not_in_range", message: "Walk up to a glowing Study Quiz marker first (Student Commons or inside a classroom, lab or office)." });
    store.grants.delete(quizGrant); // a proximity grant starts one attempt only
    // Count at start, not completion: waiting for a run to expire must not permit unlimited rerolls.
    store.noteQuizAttempt(id, day);
    const question = QUIZ_QUESTIONS[Math.floor(Math.random() * QUIZ_QUESTIONS.length)]!;
    const runId = randomUUID();
    quizRuns.set(runId, { ...question, runId, playerId: id, startedAt: t, completed: false });
    track(id, "activity_started", { activity: "quiz" });
    return { runId, question: { id: question.id, category: question.category, prompt: question.prompt, choices: question.choices }, attemptsRemaining: Math.max(0, QUIZ_DAILY_LIMIT - store.quizAttemptsToday(id, day)) };
  });

  app.post("/api/v1/activities/quiz/complete", { config: { rateLimit: { max: 15, timeWindow: "1 minute" } } }, async (req, reply) => {
    const id = who(req);
    if (!id) return deny(reply);
    const key = req.headers["idempotency-key"];
    if (typeof key !== "string" || key.length < 8 || key.length > 80) return reply.code(400).send({ error: "idempotency_key_required" });
    const cached = store.getIdemResponse(id, key);
    if (cached) return cached;
    const parsed = z.object({ runId: z.string().min(1), answerIndex: z.number().int().min(0).max(7) }).strict().safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_request" });
    const run = quizRuns.get(parsed.data.runId);
    if (!run || run.playerId !== id) return reply.code(404).send({ error: "run_not_found" });
    if (run.completed) return reply.code(409).send({ error: "run_already_completed" });
    const t = now();
    if (t - run.startedAt > QUIZ_RUN_TTL_MS) {
      run.completed = true;
      return reply.code(410).send({ error: "run_expired", message: "This question expired. Return to the board for another." });
    }
    if (t - run.startedAt < QUIZ_MIN_ANSWER_MS) return reply.code(422).send({ error: "answer_too_fast", message: "Take a moment to read the question, then submit again." });
    if (parsed.data.answerIndex >= run.choices.length) return reply.code(400).send({ error: "invalid_answer" });
    run.completed = true;
    const day = new Date(t).toISOString().slice(0, 10);
    const correct = parsed.data.answerIndex === run.answerIndex;
    let rewardCoins = 0, rewardReputation = 0, warPointsAwarded = 0;
    if (correct) {
      rewardCoins = 12;
      rewardReputation = 5;
      store.appendLedger({ idempotencyKey: `quiz:${run.runId}`, actorId: id, sourceEvent: "ACTIVITY_COMPLETED", amount: rewardCoins, metadata: { activity: "quiz", questionId: run.id, season: currentSeason(t).id } });
      store.addReputation(id, rewardReputation);
      warPointsAwarded = store.awardWarPoints(id, currentSeason(t).id, day, 10, "quiz", `quiz:${run.runId}`, t);
      for (const a of store.recordEvent(id, { type: "ACTIVITY_REWARDED", activity: "quiz" }, t)) track(id, "item_earned", { source: "achievement", achievement: a });
      track(id, "activity_completed", { activity: "quiz", correct: true, warPoints: warPointsAwarded });
    } else {
      track(id, "activity_completed", { activity: "quiz", correct: false });
    }
    recordProgress(store, id, { type: "ACTIVITY_COMPLETED", activity: "quiz", correct }, t, track);
    const profile = store.profile(id)!;
    const body = {
      correct,
      correctIndex: run.answerIndex,
      explanation: run.explanation,
      rewardCoins,
      rewardReputation,
      warPointsAwarded,
      attemptsRemaining: Math.max(0, QUIZ_DAILY_LIMIT - store.quizAttemptsToday(id, day)),
      profile,
    };
    store.setIdemResponse(id, key, body);
    return body;
  });

  // ---- Campus Scavenger Hunt: ordered, server-attested checkpoints ----
  app.post("/api/v1/activities/hunt/start", { config: { rateLimit: { max: 8, timeWindow: "1 minute" } } }, async (req, reply) => {
    const id = who(req);
    if (!id) return deny(reply);
    const t = now();
    const day = new Date(t).toISOString().slice(0, 10);
    const existing = huntRuns.get(id);
    if (existing && !existing.completed && t - existing.startedAt <= HUNT_RUN_TTL_MS) {
      const next = HUNT_STOPS[existing.nextStep];
      if (next) return { runId: existing.runId, step: existing.nextStep, totalSteps: HUNT_STOPS.length, clue: next.clue, landmark: next.landmark, attemptsRemaining: Math.max(0, HUNT_DAILY_LIMIT - store.huntAttemptsToday(id, day)) };
      huntRuns.delete(id);
    } else if (existing) huntRuns.delete(id);

    if (store.huntAttemptsToday(id, day) >= HUNT_DAILY_LIMIT) {
      return reply.code(429).send({ error: "daily_limit", message: "You have used today's three scavenger-hunt attempts. Come back tomorrow." });
    }
    const grantKey = `${id}:${HUNT_START_POINT_ID}`;
    const exp = store.grants.get(grantKey);
    if (!exp || exp < t) return reply.code(403).send({ error: "not_in_range", message: "Walk to the Scavenger Hunt board in Student Commons first." });
    store.grants.delete(grantKey);
    store.noteHuntAttempt(id, day);
    const run: HuntRun = { runId: randomUUID(), playerId: id, startedAt: t, nextStep: 0, completed: false };
    huntRuns.set(id, run);
    track(id, "activity_started", { activity: "scavenger_hunt" });
    return { runId: run.runId, step: 0, totalSteps: HUNT_STOPS.length, clue: HUNT_STOPS[0]!.clue, landmark: HUNT_STOPS[0]!.landmark, attemptsRemaining: Math.max(0, HUNT_DAILY_LIMIT - store.huntAttemptsToday(id, day)) };
  });

  app.post("/api/v1/activities/hunt/checkpoint", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const id = who(req);
    if (!id) return deny(reply);
    const rawKey = req.headers["idempotency-key"];
    if (typeof rawKey !== "string" || rawKey.length < 8 || rawKey.length > 100 || !/^[a-zA-Z0-9._:-]+$/.test(rawKey)) {
      return reply.code(400).send({ error: "idempotency_key_required", message: "A valid idempotency key is required." });
    }
    const parsed = z.object({ runId: z.string().min(1).max(80), pointId: z.string().min(1).max(40) }).strict().safeParse(req.body);
    if (!parsed.success || !HUNT_STOPS.some((stop) => stop.pointId === parsed.data.pointId)) return reply.code(400).send({ error: "invalid_request" });
    const cacheKey = `hunt-checkpoint:${rawKey}`;
    const cached = store.getIdemResponse(id, cacheKey);
    if (cached) {
      const prior = cached as { runId?: string; pointId?: string };
      if (prior.runId !== parsed.data.runId || prior.pointId !== parsed.data.pointId) return reply.code(409).send({ error: "idempotency_conflict", message: "This request key was already used for a different checkpoint." });
      return cached;
    }

    const run = huntRuns.get(id);
    if (!run || run.runId !== parsed.data.runId || run.completed) return reply.code(404).send({ error: "run_not_found", message: "Return to the Hunt board to resume or start a route." });
    const t = now();
    if (t - run.startedAt > HUNT_RUN_TTL_MS) {
      huntRuns.delete(id);
      return reply.code(410).send({ error: "run_expired", message: "This hunt expired. Return to the board to try again." });
    }
    const candidate = HUNT_STOPS.find((stop) => stop.pointId === parsed.data.pointId)!;
    const grantKey = `${id}:${candidate.pointId}`;
    const exp = store.grants.get(grantKey);
    if (!exp || exp < t) return reply.code(403).send({ error: "not_in_range", message: "Walk close to the clue location and interact with it." });
    store.grants.delete(grantKey); // one use even if this checkpoint was visited out of order
    const expected = HUNT_STOPS[run.nextStep];
    if (!expected || expected.pointId !== candidate.pointId) return reply.code(409).send({ error: "wrong_checkpoint", message: "That isn't the location named by your current clue." });
    run.nextStep++;
    const day = new Date(t).toISOString().slice(0, 10);
    const remaining = Math.max(0, HUNT_DAILY_LIMIT - store.huntAttemptsToday(id, day));

    if (run.nextStep < HUNT_STOPS.length) {
      const next = HUNT_STOPS[run.nextStep]!;
      const body = { ok: true as const, runId: run.runId, pointId: expected.pointId, complete: false, step: run.nextStep, totalSteps: HUNT_STOPS.length, clue: next.clue, landmark: next.landmark, attemptsRemaining: remaining };
      store.setIdemResponse(id, cacheKey, body);
      return body;
    }

    run.completed = true;
    const rewardCoins = 25;
    const rewardReputation = 8;
    store.appendLedger({ idempotencyKey: `scavenger-hunt:${run.runId}`, actorId: id, sourceEvent: "ACTIVITY_COMPLETED", amount: rewardCoins, metadata: { activity: "scavenger_hunt", checkpoints: HUNT_STOPS.length, season: currentSeason(t).id } });
    store.addReputation(id, rewardReputation);
    const warPointsAwarded = store.awardWarPoints(id, currentSeason(t).id, day, 15, "hunt", `hunt:${run.runId}`, t);
    recordProgress(store, id, { type: "ACTIVITY_COMPLETED", activity: "hunt" }, t, track);
    for (const a of store.recordEvent(id, { type: "ACTIVITY_REWARDED", activity: "scavenger_hunt" }, t)) track(id, "item_earned", { source: "achievement", achievement: a });
    track(id, "activity_completed", { activity: "scavenger_hunt", correct: true, warPoints: warPointsAwarded });
    const body = { ok: true as const, runId: run.runId, pointId: expected.pointId, complete: true, step: HUNT_STOPS.length, totalSteps: HUNT_STOPS.length, attemptsRemaining: remaining, rewardCoins, rewardReputation, warPointsAwarded, profile: store.profile(id)! };
    store.setIdemResponse(id, cacheKey, body);
    huntRuns.delete(id);
    return body;
  });

  registerEvents(app, { store, now, who, deny, track, season: (ms) => currentSeason(ms).id });
  registerProgress(app, { store, now, who, deny, track, season: (ms) => currentSeason(ms).id, ...(cfg.rng ? { rng: cfg.rng } : {}) });
  registerSocial(app, { store, now, season: (ms) => currentSeason(ms).id, textOpts, internalSecret: cfg.internalSecret, ...(cfg.realtimeUrl ? { realtimeUrl: cfg.realtimeUrl } : {}), who, deny, track });

  return { app, store };
}
