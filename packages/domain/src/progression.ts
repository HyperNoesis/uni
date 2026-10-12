// Levels, daily quests and streaks. Pure rules; progress is only ever advanced by server-verified events.
export const MAX_LEVEL = 10;
export const LEVEL_TITLES = ["Fresher", "200 Level", "300 Level", "400 Level", "Final Year", "Graduate", "Postgrad", "Lecturer", "Professor", "Campus Legend"] as const;
const levelStart = (n: number): number => 12 * (n - 1) ** 2; // L2 12, L3 48, L4 108, L5 192 ...

export interface LevelInfo { level: number; title: string; repIntoLevel: number; repForNext: number | null; pct: number }
export function levelFor(reputation: number): LevelInfo {
  const rep = Math.max(0, Math.floor(Number.isFinite(reputation) ? reputation : 0));
  let level = 1;
  while (level < MAX_LEVEL && rep >= levelStart(level + 1)) level++;
  const start = levelStart(level), next = level < MAX_LEVEL ? levelStart(level + 1) : null;
  return { level, title: LEVEL_TITLES[level - 1]!, repIntoLevel: rep - start, repForNext: next === null ? null : next - start, pct: next === null ? 100 : Math.min(100, Math.floor(((rep - start) / (next - start)) * 100)) };
}

/** Lagos time (UTC+1, no DST) defines "today" for quests, streaks and shifts. */
export const dayKey = (ms: number): string => new Date(ms + 3_600_000).toISOString().slice(0, 10);
export const prevDay = (day: string): string => new Date(Date.parse(`${day}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

export type QuestEvent =
  | { type: "ACTIVITY_COMPLETED"; activity: "quiz" | "reaction" | "hunt"; correct?: boolean; reactionMs?: number }
  | { type: "FRIEND_ADDED" } | { type: "GROUP_JOINED" } | { type: "MESSAGE_SENT" } | { type: "SHIFT_COMPLETED" };

export interface QuestDef { id: string; title: string; blurb: string; target: number; coins: number; reputation: number; count: (e: QuestEvent) => number }
export const QUESTS: readonly QuestDef[] = [
  { id: "play_any", title: "Play a campus activity", blurb: "Finish the Quiz, Reaction Challenge or Scavenger Hunt.", target: 1, coins: 10, reputation: 1, count: (e) => (e.type === "ACTIVITY_COMPLETED" ? 1 : 0) },
  { id: "quiz_3", title: "Answer 3 quiz questions right", blurb: "Use the Campus Quiz board in the Commons.", target: 3, coins: 20, reputation: 2, count: (e) => (e.type === "ACTIVITY_COMPLETED" && e.activity === "quiz" && e.correct ? 1 : 0) },
  { id: "quick_draw", title: "Beat 400 ms in Reaction", blurb: "Tap within 400 ms of the green signal.", target: 1, coins: 15, reputation: 2, count: (e) => (e.type === "ACTIVITY_COMPLETED" && e.activity === "reaction" && (e.reactionMs ?? 9e9) <= 400 ? 1 : 0) },
  { id: "hunt_done", title: "Finish the Scavenger Hunt", blurb: "Follow all three clues around campus.", target: 1, coins: 20, reputation: 2, count: (e) => (e.type === "ACTIVITY_COMPLETED" && e.activity === "hunt" ? 1 : 0) },
  { id: "work_shift", title: "Work a shift at your job", blurb: "Pick a job at the Job Center, then work a shift.", target: 1, coins: 15, reputation: 1, count: (e) => (e.type === "SHIFT_COMPLETED" ? 1 : 0) },
  { id: "make_friend", title: "Make a new friend", blurb: "Add someone and have them accept.", target: 1, coins: 20, reputation: 2, count: (e) => (e.type === "FRIEND_ADDED" ? 1 : 0) },
  { id: "join_group", title: "Join a campus group", blurb: "Find your people in Social → Groups.", target: 1, coins: 15, reputation: 2, count: (e) => (e.type === "GROUP_JOINED" ? 1 : 0) },
  { id: "chatty", title: "Send 3 chat messages", blurb: "Say hi to friends or your group.", target: 3, coins: 12, reputation: 1, count: (e) => (e.type === "MESSAGE_SENT" ? 1 : 0) },
];
export const QUEST_BY_ID: ReadonlyMap<string, QuestDef> = new Map(QUESTS.map((x) => [x.id, x]));

const fnv = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
/** Always `play_any` plus two others chosen by a stable hash, so a player's day is the same on every device. */
export function dailyQuestIds(playerId: string, day: string): string[] {
  const rest = QUESTS.filter((x) => x.id !== "play_any").map((x) => x.id);
  const out = ["play_any"];
  let h = fnv(`${playerId}:${day}`);
  while (out.length < 3) { const i = h % rest.length; out.push(rest.splice(i, 1)[0]!); h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0; }
  return out;
}

// ---- wire types shared by API and web ----
export interface QuestView { id: string; title: string; blurb: string; target: number; progress: number; claimed: boolean; coins: number; reputation: number }
export interface ProgressResponse {
  reputation: number; coins: number; level: LevelInfo; streak: number; bestStreak: number; playedToday: boolean; quests: QuestView[];
  job: { id: string; title: string; shiftsLeft: number; shiftsWorked: number } | null;
  stats: { quizCorrect: number; reactionPlays: number; reactionBestMs: number | null; huntsDone: number; shiftsWorked: number };
}
export interface LevelUp { from: number; to: number; title: string }
export interface QuestClaimResponse { coins: number; reputation: number; levelUp: LevelUp | null; progress: ProgressResponse }
