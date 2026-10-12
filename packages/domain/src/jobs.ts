// Campus jobs: pick a job at the Job Center, then work short server-timed shifts at its workplace.
// Content is original and local. The server holds the answers; pay is clamped by accuracy and a daily shift cap.
export const SHIFT = { tasks: 5, perTaskMs: 12_000, graceMs: 2_000, humanFloorMs: 250, cooldownMs: 30_000, dailyPaid: 3, perfectBonusPct: 20 } as const;

export interface TaskTemplate { prompt: string; right: string; wrong: [string, string, string] }
export interface JobDef { id: string; title: string; icon: string; site: string; siteName: string; minLevel: number; basePay: number; blurb: string; tasks: readonly TaskTemplate[] }
const t = (prompt: string, right: string, a: string, b: string, c: string): TaskTemplate => ({ prompt, right, wrong: [a, b, c] });
const BINS = ["Organic bin", "Plastic bin", "Paper bin", "Glass bin"] as const;
const bin = (item: string, right: (typeof BINS)[number]) => t(`Which bin? ${item}`, right, ...(BINS.filter((x) => x !== right) as [string, string, string]));
const SHELVES = ["Science", "Literature", "Technology", "History"] as const;
const shelf = (title: string, right: (typeof SHELVES)[number]) => t(`Which shelf does "${title}" go on?`, right, ...(SHELVES.filter((x) => x !== right) as [string, string, string]));

export const JOBS: readonly JobDef[] = [
  { id: "campus_cleaner", title: "Campus Cleaner", icon: "🧹", site: "commons_cart", siteName: "Cleaning cart, Student Commons", minLevel: 1, basePay: 10, blurb: "Keep the Commons tidy: sort the rubbish into the right bins.",
    tasks: [bin("a banana peel", "Organic bin"), bin("an empty pure-water sachet", "Plastic bin"), bin("old lecture notes", "Paper bin"), bin("an empty soft-drink glass bottle", "Glass bin"), bin("an orange peel", "Organic bin"),
      bin("a plastic water bottle", "Plastic bin"), bin("a cardboard box", "Paper bin"), bin("a broken mirror piece (carefully!)", "Glass bin"), bin("leftover jollof rice", "Organic bin"), bin("yesterday's newspaper", "Paper bin")] },
  { id: "food_vendor", title: "Food Vendor", icon: "🍛", site: "food_counter", siteName: "Counter, Food Hall", minLevel: 2, basePay: 16, blurb: "Serve the lunch rush: add up orders and give the right change.",
    tasks: [t("Jollof ₦800 + chicken ₦1,200. Total?", "₦2,000", "₦1,800", "₦2,200", "₦1,900"), t("2 meat pies at ₦500 each. Total?", "₦1,000", "₦500", "₦1,500", "₦1,200"), t("Zobo ₦300 + puff-puff ₦200. Total?", "₦500", "₦400", "₦600", "₦450"),
      t("3 pure waters at ₦100 each. Total?", "₦300", "₦200", "₦400", "₦330"), t("Bill is ₦650 and they pay ₦1,000. Change?", "₦350", "₦250", "₦450", "₦400"), t("Bill is ₦1,500 and they pay ₦2,000. Change?", "₦500", "₦400", "₦600", "₦300"),
      t("2 plates of rice at ₦700 each. Total?", "₦1,400", "₦1,200", "₦1,500", "₦1,300"), t("Suya ₦1,500 + zobo ₦300. Total?", "₦1,800", "₦1,700", "₦2,000", "₦1,600"), t("Bill is ₦350 and they pay ₦500. Change?", "₦150", "₦100", "₦250", "₦200"), t("4 puff-puff at ₦200 each. Total?", "₦800", "₦600", "₦1,000", "₦900")] },
  { id: "library_assistant", title: "Library Assistant", icon: "📚", site: "library_counter", siteName: "Returns counter, Library", minLevel: 2, basePay: 18, blurb: "Shelve returned books on the right shelf.",
    tasks: [shelf("Things Fall Apart", "Literature"), shelf("Introduction to Biology", "Science"), shelf("Learn Python the Easy Way", "Technology"), shelf("A History of West Africa", "History"), shelf("Organic Chemistry Basics", "Science"),
      shelf("Purple Hibiscus", "Literature"), shelf("Computer Networks Explained", "Technology"), shelf("Pre-colonial Nigerian Kingdoms", "History"), shelf("Physics for Engineers", "Science"), shelf("Half of a Yellow Sun", "Literature")] },
  { id: "event_staff", title: "Event Staff", icon: "🎟️", site: "arena_desk", siteName: "Entrance desk, Event Arena", minLevel: 3, basePay: 24, blurb: "Keep guests safe and the entrance flowing.",
    tasks: [t("Doors open at 6:00 PM and guests queue 30 minutes early. When should your team be in position?", "5:30 PM", "6:00 PM", "6:30 PM", "7:00 PM"),
      t("A guest lost their ticket. Best response?", "Politely check their name on the guest list", "Turn them away rudely", "Let everyone in free", "Ignore them"),
      t("The aisle is blocked by bags. What do you do?", "Ask guests to move bags and keep the aisle clear", "Leave it", "Stack more bags there", "Close the exit"),
      t("The stage lights flicker. Who do you tell?", "The event lead or technician", "Nobody", "A guest", "Post it online"),
      t("A crowd starts pushing at the door. First step?", "Calmly form a steady line and call the lead", "Run away", "Shout at everyone", "Lock the door"),
      t("The hall is at capacity and a new guest arrives. You…", "Politely ask them to wait until someone leaves", "Squeeze them in", "Let them climb the stage", "Send them home angry"),
      t("A lost child is found. Best action?", "Stay with them and call the event lead", "Send them outside alone", "Ask them to wait by the road", "Ignore them"),
      t("What do you need to check guests in?", "The guest list", "A football", "A paintbrush", "A kettle"),
      t("A guest feels faint. First step?", "Help them sit somewhere cool and call the first-aider", "Tell them to stand up", "Leave them", "Give them a heavy bag"),
      t("The event is over. What is last on your list?", "Check the area and report to the lead", "Go home immediately", "Switch off the lights and leave", "Take the chairs")] },
];
export const JOB_BY_ID: ReadonlyMap<string, JobDef> = new Map(JOBS.map((j) => [j.id, j]));
export const JOB_SITES: readonly string[] = JOBS.map((j) => j.site);

export interface ShiftTask { prompt: string; options: string[]; answer: number }
/** Picks distinct tasks and shuffles each option list. rng must return [0,1). */
export function buildShift(job: JobDef, rng: () => number, n: number = SHIFT.tasks): ShiftTask[] {
  const pool = [...job.tasks], out: ShiftTask[] = [];
  while (out.length < n && pool.length) {
    const src = pool.splice(Math.floor(rng() * pool.length), 1)[0]!;
    const opts = [src.right, ...src.wrong];
    for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [opts[i], opts[j]] = [opts[j]!, opts[i]!]; }
    out.push({ prompt: src.prompt, options: opts, answer: opts.indexOf(src.right) });
  }
  return out;
}
export interface ShiftScore { correct: number; total: number; perfect: boolean; coins: number; reputation: number }
export function scoreShift(job: JobDef, correct: number, total: number): ShiftScore {
  const perfect = total > 0 && correct === total;
  const coins = total === 0 ? 0 : Math.round((job.basePay * correct) / total) + (perfect ? Math.round((job.basePay * SHIFT.perfectBonusPct) / 100) : 0);
  return { correct, total, perfect, coins, reputation: correct >= 4 ? 1 : 0 };
}

// ---- wire types ----
export interface JobView { id: string; title: string; icon: string; siteName: string; minLevel: number; basePay: number; blurb: string; locked: boolean; current: boolean }
export interface JobsResponse { jobs: JobView[]; currentJobId: string | null; shiftsLeft: number; shiftsWorked: number; level: number }
export interface ShiftStep { runId: string; jobTitle: string; index: number; total: number; timeLimitMs: number; remainingMs: number; prompt: string; options: string[] }
export interface ShiftFinal { correct: number; total: number; coins: number; reputation: number; perfect: boolean; paid: boolean; capped: boolean; levelUp: { from: number; to: number; title: string } | null; completedQuests: string[]; newlyUnlocked: string[] }
export interface ShiftAnswerResponse { index: number; correct: boolean; correctIndex: number; timedOut: boolean; next: ShiftStep | null; final: ShiftFinal | null }
