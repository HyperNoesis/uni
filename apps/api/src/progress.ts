import { JOB_BY_ID, QUEST_BY_ID, SHIFT, dailyQuestIds, dayKey, prevDay, type QuestEvent } from "@campus/domain";

// Progression state: daily quests, streaks, activity stats and the player's job. Only server-verified events call onEvent;
// no client path sets progress. Persisted inside the Store snapshot (optional field, so older snapshots load).

export interface QuestState { id: string; progress: number; claimed: boolean }
export interface PlayerProgress {
  streak: number; bestStreak: number; lastDay: string | null; day: string; quests: QuestState[];
  jobId: string | null; shiftDay: string; shiftsPaid: number; shiftsWorked: number;
  quizCorrect: number; reactionPlays: number; reactionBestMs: number | null; huntsDone: number;
}
export type ProgressSnapshot = [string, PlayerProgress][];

const fresh = (id: string, day: string): PlayerProgress => ({
  streak: 0, bestStreak: 0, lastDay: null, day, quests: dailyQuestIds(id, day).map((q) => ({ id: q, progress: 0, claimed: false })),
  jobId: null, shiftDay: day, shiftsPaid: 0, shiftsWorked: 0, quizCorrect: 0, reactionPlays: 0, reactionBestMs: null, huntsDone: 0,
});

export class ProgressState {
  private players = new Map<string, PlayerProgress>();
  constructor(private deps: { dirty(): void }) {}

  /** Returns the player's progress rolled over to today (new quests, fresh shift allowance). */
  get(id: string, nowMs: number): PlayerProgress {
    const day = dayKey(nowMs);
    let p = this.players.get(id);
    if (!p) { p = fresh(id, day); this.players.set(id, p); }
    if (p.day !== day) { p.day = day; p.quests = dailyQuestIds(id, day).map((q) => ({ id: q, progress: 0, claimed: false })); }
    if (p.shiftDay !== day) { p.shiftDay = day; p.shiftsPaid = 0; }
    return p;
  }

  /** Counts a day of play toward the streak. Returns the streak length when it grew today, else null. */
  markActive(id: string, nowMs: number): number | null {
    const p = this.get(id, nowMs), today = dayKey(nowMs);
    if (p.lastDay === today) return null;
    p.streak = p.lastDay === prevDay(today) ? p.streak + 1 : 1;
    p.lastDay = today; p.bestStreak = Math.max(p.bestStreak, p.streak);
    this.deps.dirty();
    return p.streak;
  }

  /** Advances today's quests and stats from a verified event. Returns quest ids that just became complete. */
  onEvent(id: string, e: QuestEvent, nowMs: number): string[] {
    const p = this.get(id, nowMs), done: string[] = [];
    for (const q of p.quests) {
      const def = QUEST_BY_ID.get(q.id)!;
      if (q.progress >= def.target) continue;
      q.progress = Math.min(def.target, q.progress + def.count(e));
      if (q.progress >= def.target) done.push(q.id);
    }
    if (e.type === "ACTIVITY_COMPLETED") {
      if (e.activity === "quiz" && e.correct) p.quizCorrect++;
      if (e.activity === "hunt") p.huntsDone++;
      if (e.activity === "reaction") { p.reactionPlays++; if (e.reactionMs !== undefined) p.reactionBestMs = p.reactionBestMs === null ? e.reactionMs : Math.min(p.reactionBestMs, e.reactionMs); }
    }
    if (e.type === "SHIFT_COMPLETED") p.shiftsWorked++;
    this.deps.dirty();
    return done;
  }

  canClaim(id: string, questId: string, nowMs: number): "ok" | "not_found" | "not_complete" | "already_claimed" {
    const q = this.get(id, nowMs).quests.find((x) => x.id === questId), def = QUEST_BY_ID.get(questId);
    if (!q || !def) return "not_found";
    if (q.claimed) return "already_claimed";
    return q.progress >= def.target ? "ok" : "not_complete";
  }
  markClaimed(id: string, questId: string, nowMs: number): void { const q = this.get(id, nowMs).quests.find((x) => x.id === questId); if (q) { q.claimed = true; this.deps.dirty(); } }

  // ---- jobs ----
  jobOf(id: string, nowMs: number): string | null { return this.get(id, nowMs).jobId; }
  setJob(id: string, jobId: string | null, nowMs: number): void { this.get(id, nowMs).jobId = jobId; this.deps.dirty(); }
  shiftsLeft(id: string, nowMs: number): number { return Math.max(0, SHIFT.dailyPaid - this.get(id, nowMs).shiftsPaid); }
  noteShiftPaid(id: string, nowMs: number): void { this.get(id, nowMs).shiftsPaid += 1; this.deps.dirty(); }

  view(id: string, nowMs: number) {
    const p = this.get(id, nowMs), today = dayKey(nowMs), job = p.jobId ? JOB_BY_ID.get(p.jobId) : undefined;
    return {
      streak: p.lastDay === today || p.lastDay === prevDay(today) ? p.streak : 0, bestStreak: p.bestStreak, playedToday: p.lastDay === today,
      quests: p.quests.map((q) => { const d = QUEST_BY_ID.get(q.id)!; return { id: q.id, title: d.title, blurb: d.blurb, target: d.target, progress: q.progress, claimed: q.claimed, coins: d.coins, reputation: d.reputation }; }),
      job: job ? { id: job.id, title: job.title, shiftsLeft: this.shiftsLeft(id, nowMs), shiftsWorked: p.shiftsWorked } : null,
      stats: { quizCorrect: p.quizCorrect, reactionPlays: p.reactionPlays, reactionBestMs: p.reactionBestMs, huntsDone: p.huntsDone, shiftsWorked: p.shiftsWorked },
    };
  }

  toSnapshot(): ProgressSnapshot { return [...this.players].map(([k, v]) => [k, structuredClone(v)]); }
  restore(s: ProgressSnapshot | undefined): void { this.players.clear(); for (const [k, v] of s ?? []) this.players.set(k, { ...fresh(k, v.day ?? "1970-01-01"), ...v }); }
}
