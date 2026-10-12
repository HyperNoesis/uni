// Identity rules: text hygiene, reputation titles, rename cooldown, achievements. Dependency-free.
export const DISPLAY_NAME = { min: 2, max: 20 } as const;
export const BIO_MAX = 140;
export type TextProblem = "empty" | "too_short" | "too_long" | "invalid_chars" | "contact_info" | "link" | "repetition" | "reserved_name" | "blocked_term";
export type TextCheck = { ok: true; text: string } | { ok: false; reason: TextProblem; message: string };
const MSG: Record<TextProblem, string> = {
  empty: "Please enter something.", too_short: `Use at least ${DISPLAY_NAME.min} characters.`, too_long: "That is too long.",
  invalid_chars: "Use letters, numbers, spaces and _ . - only.", contact_info: "Keep emails and phone numbers private. They are not allowed here.",
  link: "Links are not allowed here.", repetition: "Please avoid long repeated characters.", reserved_name: "That name is reserved.", blocked_term: "That text is not allowed.",
};
const fail = (reason: TextProblem): TextCheck => ({ ok: false, reason, message: MSG[reason] });
const INVISIBLE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;
export const normalizeText = (raw: string) => raw.normalize("NFKC").replace(INVISIBLE, "").replace(/\s+/g, " ").trim();
const EMAIL = /[a-z0-9._%+-]+\s*(@|\(at\)|\[at\])\s*[a-z0-9-]+(\.|\s*\(dot\)\s*)[a-z]{2,}/i;
const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|ng|net|org|io|co|app|xyz|me|gg|ly)\b)/i;
const PHONE = /(?:\+?\d[\s().-]*){9,}/;
const SWAP: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", $: "s" };
export const squash = (s: string) => s.toLowerCase().replace(/[013457@$]/g, (c) => SWAP[c] ?? "").replace(/[^a-z]/g, "");
export interface TextOptions { blockedTerms?: readonly string[] }
function shared(text: string, o: TextOptions): TextProblem | null {
  if (EMAIL.test(text) || PHONE.test(text)) return "contact_info";
  if (LINK.test(text)) return "link";
  if (/(.)\1{5,}/u.test(text)) return "repetition";
  const sq = squash(text);
  for (const t of o.blockedTerms ?? []) { const term = squash(t); if (term.length >= 3 && sq.includes(term)) return "blocked_term"; }
  return null;
}
const RESERVED = /^(admin|administrator|moderator|mod|staff|support|official|campus[ _.-]?(team|staff|admin|support)|system)(?![\p{L}\p{N}])/iu;
export function checkDisplayName(raw: string, o: TextOptions = {}): TextCheck {
  const text = normalizeText(raw);
  if (!text) return fail("empty");
  if (text.length < DISPLAY_NAME.min) return fail("too_short");
  if (text.length > DISPLAY_NAME.max) return fail("too_long");
  if (!/^[\p{L}\p{N} _.-]+$/u.test(text)) return fail("invalid_chars");
  if (RESERVED.test(text)) return fail("reserved_name");
  const p = shared(text, o);
  return p ? fail(p) : { ok: true, text };
}
export function checkBio(raw: string, o: TextOptions = {}): TextCheck {
  const text = normalizeText(raw);
  if (text.length > BIO_MAX) return fail("too_long");
  if (!text) return { ok: true, text };
  const p = shared(text, o);
  return p ? fail(p) : { ok: true, text };
}

export const TITLES = [{ at: 0, title: "Fresher" }, { at: 15, title: "Regular" }, { at: 50, title: "Course Rep" }, { at: 150, title: "Campus Celeb" }, { at: 400, title: "Legend" }] as const;
export function reputationTitle(rep: number) {
  const r = Number.isFinite(rep) ? Math.max(0, Math.floor(rep)) : 0;
  let idx = 0;
  TITLES.forEach((t, k) => { if (r >= t.at) idx = k; });
  const n = TITLES[idx + 1];
  return { title: TITLES[idx]!.title as string, next: n ? { title: n.title as string, at: n.at as number, remaining: n.at - r } : null };
}
export const RENAME_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
export function canRename(last: string | null, nowMs: number): { ok: true } | { ok: false; retryAt: string } {
  const t = last ? Date.parse(last) : NaN;
  if (!Number.isFinite(t)) return { ok: true };
  return nowMs >= t + RENAME_COOLDOWN_MS ? { ok: true } : { ok: false, retryAt: new Date(t + RENAME_COOLDOWN_MS).toISOString() };
}

export type AchievementId = "first_steps" | "fresh_look" | "home_sweet_home" | "storyteller" | "quick_hands" | "good_neighbour" | "joiner" | "regular" | "hired";
export interface AchievementDef { id: AchievementId; title: string; description: string; reputation: number; itemId: string | null }
export const HOME_ACHIEVEMENT_ITEMS = 5;
export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { id: "first_steps", title: "First Steps", description: "Created your CAMPUS identity.", reputation: 0, itemId: null },
  { id: "fresh_look", title: "Fresh Look", description: "Changed your look.", reputation: 2, itemId: "poster_football" },
  { id: "home_sweet_home", title: "Home Sweet Home", description: "Placed 5 items in your room.", reputation: 3, itemId: "lamp_neon" },
  { id: "storyteller", title: "Storyteller", description: "Wrote your bio.", reputation: 2, itemId: "typewriter" },
  { id: "quick_hands", title: "Quick Hands", description: "Earned your first verified activity reward.", reputation: 3, itemId: "trophy_case" },
  { id: "good_neighbour", title: "Good Neighbour", description: "Made your first friend.", reputation: 3, itemId: null },
  { id: "regular", title: "Regular", description: "Played on three days in a row.", reputation: 3, itemId: null },
  { id: "hired", title: "Hired!", description: "Started your first campus job.", reputation: 3, itemId: null },
  { id: "joiner", title: "Joiner", description: "Joined your first campus group.", reputation: 2, itemId: null },
];
/** Server-side events only; clients never report these. */
export type IdentityEvent = { type: "IDENTITY_CREATED" } | { type: "AVATAR_CHANGED" } | { type: "HOME_SAVED"; placed: number } | { type: "STREAK"; days: number } | { type: "JOB_STARTED" } | { type: "BIO_SET"; length: number } | { type: "ACTIVITY_REWARDED"; activity: string } | { type: "FRIEND_ADDED" } | { type: "GROUP_JOINED" };
export function achievementsFor(e: IdentityEvent): AchievementId[] {
  switch (e.type) {
    case "IDENTITY_CREATED": return ["first_steps"];
    case "AVATAR_CHANGED": return ["fresh_look"];
    case "HOME_SAVED": return e.placed >= HOME_ACHIEVEMENT_ITEMS ? ["home_sweet_home"] : [];
    case "BIO_SET": return e.length > 0 ? ["storyteller"] : [];
    case "ACTIVITY_REWARDED": return ["quick_hands"];
    case "FRIEND_ADDED": return ["good_neighbour"];
    case "GROUP_JOINED": return ["joiner"];
    case "STREAK": return e.days >= 3 ? ["regular"] : [];
    case "JOB_STARTED": return ["hired"];
  }
}
export const achievementById = (id: string) => ACHIEVEMENTS.find((a) => a.id === id);
