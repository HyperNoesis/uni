// Phase 5 social rules. Dependency-free so web, API and realtime share one implementation.
import { normalizeText, squash, type TextCheck, type TextOptions } from "./identity";

export const SOCIAL = {
  maxFriends: 100, maxOutgoing: 20, maxIncoming: 50, maxGroupsOwned: 3, maxGroupsJoined: 8, maxGroupMembers: 50,
  groupName: { min: 3, max: 30 }, groupDesc: 120, chatMax: 200, historyLimit: 50, bufferPerConversation: 200,
  chatMinGapMs: 1_000, chatPerMinute: 15, duplicateWindowMs: 10_000, searchMin: 3, searchLimit: 12,
  reportsPerDay: 10, reportNoteMax: 200, autoHoldReporters: 3, autoHoldMs: 60 * 60_000,
} as const;

export const REPORT_REASONS = ["harassment", "spam", "inappropriate_name", "inappropriate_chat", "cheating", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export const REPORT_CONTEXTS = ["profile", "chat", "group", "world"] as const;
export type ReportContext = (typeof REPORT_CONTEXTS)[number];
export const MOD_ACTIONS = ["dismiss", "warn", "chat_mute_24h", "chat_mute_7d"] as const;
export type ModAction = (typeof MOD_ACTIONS)[number];
export const MOD_ACTION_MS: Record<ModAction, number> = { dismiss: 0, warn: 0, chat_mute_24h: 86_400_000, chat_mute_7d: 7 * 86_400_000 };

const MSG: Record<string, string> = {
  empty: "Type a message first.", too_long: `Keep messages under ${SOCIAL.chatMax} characters.`, contact_info: "Keep emails and phone numbers private. They are not allowed in chat.",
  link: "Links are not allowed in chat.", repetition: "Please avoid long repeated characters.", blocked_term: "That message is not allowed.",
};
const EMAIL = /[a-z0-9._%+-]+\s*(@|\(at\)|\[at\])\s*[a-z0-9-]+(\.|\s*\(dot\)\s*)[a-z]{2,}/i;
const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|ng|net|org|io|co|app|xyz|me|gg|ly)\b)/i;
const PHONE = /(?:\+?\d[\s().-]*){9,}/;

/** Chat policy: same conservative hygiene as names and bios (no contact details, links or operator-blocked terms). */
export function checkChat(raw: string, o: TextOptions = {}): TextCheck {
  const text = normalizeText(raw);
  const bad = (reason: "empty" | "too_long" | "contact_info" | "link" | "repetition" | "blocked_term"): TextCheck => ({ ok: false, reason, message: MSG[reason]! });
  if (!text) return bad("empty");
  if (text.length > SOCIAL.chatMax) return bad("too_long");
  if (EMAIL.test(text) || PHONE.test(text)) return bad("contact_info");
  if (LINK.test(text)) return bad("link");
  if (/(.)\1{7,}/u.test(text)) return bad("repetition");
  const sq = squash(text);
  for (const t of o.blockedTerms ?? []) { const term = squash(t); if (term.length >= 3 && sq.includes(term)) return bad("blocked_term"); }
  return { ok: true, text };
}

export function checkGroupName(raw: string, o: TextOptions = {}): TextCheck {
  const text = normalizeText(raw);
  const fail = (reason: "empty" | "too_short" | "too_long" | "invalid_chars" | "blocked_term"): TextCheck => ({ ok: false, reason, message: reason === "too_short" ? `Use at least ${SOCIAL.groupName.min} characters.` : reason === "too_long" ? "That is too long." : reason === "empty" ? "Give your group a name." : reason === "invalid_chars" ? "Use letters, numbers, spaces and _ . - only." : "That text is not allowed." });
  if (!text) return fail("empty");
  if (text.length < SOCIAL.groupName.min) return fail("too_short");
  if (text.length > SOCIAL.groupName.max) return fail("too_long");
  if (!/^[\p{L}\p{N} _.-]+$/u.test(text)) return fail("invalid_chars");
  const c = checkChat(text, o);
  return c.ok ? { ok: true, text } : { ok: false, reason: c.reason === "blocked_term" ? "blocked_term" : "invalid_chars", message: c.message };
}

export const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);
export const dmKey = (a: string, b: string): string => `dm:${pairKey(a, b)}`;
export const groupKey = (id: string): string => `g:${id}`;

/** Sliding-window chat limiter state; pure so it is testable without timers. */
export function chatAllowed(history: readonly number[], nowMs: number): { ok: true } | { ok: false; retryMs: number } {
  const last = history[history.length - 1];
  if (last !== undefined && nowMs - last < SOCIAL.chatMinGapMs) return { ok: false, retryMs: SOCIAL.chatMinGapMs - (nowMs - last) };
  const recent = history.filter((t) => nowMs - t < 60_000);
  if (recent.length >= SOCIAL.chatPerMinute) return { ok: false, retryMs: 60_000 - (nowMs - recent[0]!) };
  return { ok: true };
}

export interface PublicPlayer { id: string; name: string; campus: string; avatar: unknown; reputation: number }
export interface FriendView extends PublicPlayer { online: boolean }
export interface GroupView { id: string; name: string; description: string; campus: string; ownerId: string; members: number; joined: boolean; owner: boolean }
export interface ChatMessage { id: string; from: string; fromName: string; text: string; at: string; mine: boolean }
export interface SocialOverview {
  friends: FriendView[]; incoming: PublicPlayer[]; outgoing: PublicPlayer[]; blocked: { id: string; name: string }[]; muted: { id: string; name: string }[]; groups: GroupView[];
  chatMutedUntil: string | null;
}
