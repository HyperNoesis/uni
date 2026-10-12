import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { JOBS, JOB_BY_ID, QUEST_BY_ID, SHIFT, buildShift, levelFor, scoreShift, type JobsResponse, type LevelUp, type ProgressResponse, type QuestEvent, type ShiftAnswerResponse, type ShiftFinal, type ShiftStep, type ShiftTask } from "@campus/domain";
import type { EventName } from "@campus/analytics";
import type { Store } from "./store";

type Track = (sessionId: string, event: EventName, props?: Record<string, string | number>) => void;
const limit = (max: number) => ({ config: { rateLimit: { max, timeWindow: "1 minute" } } });

/** Single entry point for server-verified progress: streak, quests and streak achievements. Never called from client input. */
export function recordProgress(store: Store, id: string, e: QuestEvent, nowMs: number, track: Track) {
  let streak: number | null = null; const achievements: string[] = [];
  if (e.type === "ACTIVITY_COMPLETED") {
    streak = store.progress.markActive(id, nowMs);
    if (streak !== null) achievements.push(...store.recordEvent(id, { type: "STREAK", days: streak }, nowMs));
  }
  const completedQuests = store.progress.onEvent(id, e, nowMs);
  for (const a of achievements) track(id, "item_earned", { source: "achievement", achievement: a });
  return { streak, completedQuests, achievements };
}

/** Ledger-backed grant with level-up detection. The idempotency key makes retries harmless. */
export function grant(store: Store, id: string, g: { key: string; source: string; coins: number; reputation: number; meta: Record<string, unknown> }, track: Track): LevelUp | null {
  const before = levelFor(store.profile(id)!.reputation);
  if (g.coins > 0) store.appendLedger({ idempotencyKey: g.key, actorId: id, sourceEvent: g.source, amount: g.coins, metadata: g.meta });
  if (g.reputation > 0) store.addReputation(id, g.reputation);
  const after = levelFor(store.profile(id)!.reputation);
  if (g.coins > 0) track(id, "reward_granted", { source: g.source, coins: g.coins });
  if (after.level > before.level) { track(id, "level_up", { level: after.level }); return { from: before.level, to: after.level, title: after.title }; }
  return null;
}

interface ShiftRun { id: string; playerId: string; jobId: string; startedAt: number; qStartedAt: number; idx: number; tasks: ShiftTask[]; correct: number; responses: Map<number, ShiftAnswerResponse>; done: boolean }

export function registerProgress(app: FastifyInstance, c: { store: Store; now: () => number; who: (req: FastifyRequest) => string | null; deny: (r: FastifyReply) => unknown; track: Track; season: (ms: number) => string; rng?: () => number }): void {
  const { store, now } = c, rng = c.rng ?? Math.random;
  const runs = new Map<string, ShiftRun>(), active = new Map<string, string>(), lastShiftAt = new Map<string, number>();
  const runTtl = SHIFT.tasks * (SHIFT.perTaskMs + SHIFT.graceMs) + 30_000;
  const near = (id: string, point: string) => { const exp = store.grants.get(`${id}:${point}`); return !!exp && exp >= now(); };

  const progressFor = (id: string): ProgressResponse => {
    const p = store.profile(id)!, v = store.progress.view(id, now());
    return { reputation: p.reputation, coins: p.coins, level: levelFor(p.reputation), streak: v.streak, bestStreak: v.bestStreak, playedToday: v.playedToday, quests: v.quests, job: v.job, stats: v.stats };
  };
  const step = (r: ShiftRun): ShiftStep => ({ runId: r.id, jobTitle: JOB_BY_ID.get(r.jobId)!.title, index: r.idx, total: r.tasks.length, timeLimitMs: SHIFT.perTaskMs, remainingMs: Math.max(0, r.qStartedAt + SHIFT.perTaskMs - now()), prompt: r.tasks[r.idx]!.prompt, options: [...r.tasks[r.idx]!.options] });
  const gc = () => { for (const [k, r] of runs) if (r.done || now() - r.startedAt > runTtl) { runs.delete(k); if (active.get(r.playerId) === k) active.delete(r.playerId); } };

  app.get("/api/v1/progress", async (req, reply) => { const id = c.who(req); return id ? progressFor(id) : c.deny(reply); });

  app.post("/api/v1/quests/:id/claim", limit(30), async (req, reply) => {
    const id = c.who(req); if (!id) return c.deny(reply);
    const qid = (req.params as { id: string }).id, t = now(), def = QUEST_BY_ID.get(qid);
    const state = store.progress.canClaim(id, qid, t);
    if (state === "not_found" || !def) return reply.code(404).send({ error: "not_found" });
    if (state === "not_complete") return reply.code(409).send({ error: "not_complete", message: "Finish the quest first." });
    if (state === "already_claimed") return reply.code(409).send({ error: "already_claimed", message: "Already claimed today." });
    const day = store.progress.get(id, t).day;
    const levelUp = grant(store, id, { key: `quest:${day}:${qid}`, source: "QUEST_CLAIMED", coins: def.coins, reputation: def.reputation, meta: { quest: qid, day } }, c.track);
    store.progress.markClaimed(id, qid, t);
    store.awardWarPoints(id, c.season(t), day, 5, "quest", `quest:${day}:${qid}`, t);
    c.track(id, "quest_claimed", { quest: qid });
    return { coins: def.coins, reputation: def.reputation, levelUp, progress: progressFor(id) };
  });

  // ---- jobs ----
  const jobsView = (id: string): JobsResponse => {
    const level = levelFor(store.profile(id)!.reputation).level, cur = store.progress.jobOf(id, now()), v = store.progress.view(id, now());
    return { jobs: JOBS.map((j) => ({ id: j.id, title: j.title, icon: j.icon, siteName: j.siteName, minLevel: j.minLevel, basePay: j.basePay, blurb: j.blurb, locked: level < j.minLevel, current: cur === j.id })), currentJobId: cur, shiftsLeft: store.progress.shiftsLeft(id, now()), shiftsWorked: v.stats.shiftsWorked, level };
  };
  app.get("/api/v1/jobs", async (req, reply) => { const id = c.who(req); return id ? jobsView(id) : c.deny(reply); });

  app.post("/api/v1/jobs/apply", limit(20), async (req, reply) => {
    const id = c.who(req); if (!id) return c.deny(reply);
    const p = z.object({ jobId: z.string().min(1).max(40) }).strict().safeParse(req.body); if (!p.success) return reply.code(400).send({ error: "invalid_request" });
    const job = JOB_BY_ID.get(p.data.jobId);
    if (!job) return reply.code(404).send({ error: "not_found" });
    if (!near(id, "job_center")) return reply.code(403).send({ error: "not_in_range", message: "Walk up to the Job Center first." });
    if (levelFor(store.profile(id)!.reputation).level < job.minLevel) return reply.code(403).send({ error: "level_too_low", message: `You need level ${job.minLevel} for this job.` });
    if (active.has(id)) return reply.code(409).send({ error: "shift_in_progress", message: "Finish your current shift first." });
    const was = store.progress.jobOf(id, now());
    store.progress.setJob(id, job.id, now());
    const unlocked = was === job.id ? [] : store.recordEvent(id, { type: "JOB_STARTED" }, now());
    if (was !== job.id) c.track(id, "job_started", { job: job.id });
    return { ...jobsView(id), newlyUnlocked: unlocked };
  });
  app.post("/api/v1/jobs/quit", limit(20), async (req, reply) => {
    const id = c.who(req); if (!id) return c.deny(reply);
    if (active.has(id)) return reply.code(409).send({ error: "shift_in_progress", message: "Finish your current shift first." });
    store.progress.setJob(id, null, now()); return jobsView(id);
  });

  app.post("/api/v1/jobs/shift/start", limit(30), async (req, reply) => {
    const id = c.who(req); if (!id) return c.deny(reply);
    gc();
    const jobId = store.progress.jobOf(id, now()), job = jobId ? JOB_BY_ID.get(jobId) : undefined;
    if (!job) return reply.code(409).send({ error: "no_job", message: "Get a job at the Job Center first." });
    if (!near(id, job.site)) return reply.code(403).send({ error: "not_in_range", message: `Go to your workplace: ${job.siteName}.` });
    const existing = active.get(id) ? runs.get(active.get(id)!) : undefined;
    if (existing && !existing.done) return step(existing); // resume after a refresh or reconnect
    if (store.progress.shiftsLeft(id, now()) <= 0) return reply.code(429).send({ error: "no_shifts_left", message: "You've worked all your paid shifts today. Come back tomorrow." });
    const wait = (lastShiftAt.get(id) ?? 0) + SHIFT.cooldownMs - now();
    if (wait > 0) return reply.code(429).send({ error: "cooldown", retryMs: wait, message: "Take a short break before the next shift." });
    const run: ShiftRun = { id: randomUUID(), playerId: id, jobId: job.id, startedAt: now(), qStartedAt: now(), idx: 0, tasks: buildShift(job, rng), correct: 0, responses: new Map(), done: false };
    runs.set(run.id, run); active.set(id, run.id);
    c.track(id, "activity_started", { activity: "shift", job: job.id });
    return step(run);
  });

  app.post("/api/v1/jobs/shift/answer", limit(60), async (req, reply) => {
    const id = c.who(req); if (!id) return c.deny(reply);
    const p = z.object({ runId: z.string().min(1).max(64), index: z.number().int().min(0).max(20), choice: z.number().int().min(-1).max(3) }).strict().safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: "invalid_request" });
    const run = runs.get(p.data.runId);
    if (!run || run.playerId !== id) return reply.code(404).send({ error: "run_not_found" });
    const replay = run.responses.get(p.data.index);
    if (replay) return replay; // retried submission: same outcome, no second payment
    if (run.done || now() - run.startedAt > runTtl) { run.done = true; return reply.code(410).send({ error: "run_expired", message: "That shift expired. Start a new one." }); }
    if (p.data.index !== run.idx) return reply.code(409).send({ error: "out_of_order" });

    const t = now(), ms = t - run.qStartedAt, task = run.tasks[run.idx]!;
    const timedOut = p.data.choice < 0 || ms > SHIFT.perTaskMs + SHIFT.graceMs;
    const correct = !timedOut && ms >= SHIFT.humanFloorMs && p.data.choice === task.answer;
    if (correct) run.correct++;
    run.idx += 1; run.qStartedAt = t;

    const out: ShiftAnswerResponse = { index: p.data.index, correct, correctIndex: task.answer, timedOut, next: null, final: null };
    if (run.idx < run.tasks.length) out.next = step(run);
    else {
      run.done = true; active.delete(id); lastShiftAt.set(id, t);
      const job = JOB_BY_ID.get(run.jobId)!, score = scoreShift(job, run.correct, run.tasks.length);
      const left = store.progress.shiftsLeft(id, t), paid = left > 0 && score.coins > 0, capped = left <= 0;
      let levelUp: LevelUp | null = null;
      if (paid) { levelUp = grant(store, id, { key: `shift:${run.id}`, source: "SHIFT_COMPLETED", coins: score.coins, reputation: score.reputation, meta: { job: job.id, runId: run.id, correct: score.correct } }, c.track); store.progress.noteShiftPaid(id, t); }
      const day = store.progress.get(id, t).day;
      if (paid) store.awardWarPoints(id, c.season(t), day, 4, "job", `shift:${run.id}`, t);
      const prog = recordProgress(store, id, { type: "SHIFT_COMPLETED" }, t, c.track);
      c.track(id, "shift_completed", { job: job.id, correct: score.correct, paid: paid ? 1 : 0 });
      const final: ShiftFinal = { correct: score.correct, total: score.total, coins: paid ? score.coins : 0, reputation: paid ? score.reputation : 0, perfect: score.perfect, paid, capped, levelUp, completedQuests: prog.completedQuests, newlyUnlocked: prog.achievements };
      out.final = final;
    }
    run.responses.set(p.data.index, out);
    return out;
  });
}
