import { randomUUID } from "node:crypto";
import { MOD_ACTION_MS, SOCIAL, chatAllowed, dmKey, groupKey, pairKey, type ModAction, type ReportContext, type ReportReason } from "@campus/domain";

// Phase 5 social state: friendships, blocks, mutes, groups, chat, reports and moderation. The server owns every rule here;
// clients only send intents. Persisted inside the Store snapshot (optional field, so older snapshots still load).

export interface Friendship { a: string; b: string; requester: string; status: "pending" | "accepted"; at: string }
export interface Group { id: string; name: string; description: string; campus: string; ownerId: string; createdAt: string; members: Record<string, { role: "owner" | "member"; at: string }>; banned: string[] }
export interface StoredMessage { id: string; conv: string; from: string; text: string; at: string }
export interface Report { id: string; reporter: string; target: string; reason: ReportReason; context: ReportContext; note: string; evidence: { messageId: string; text: string } | null; status: "open" | "actioned" | "dismissed"; createdAt: string; resolvedAt: string | null; action?: ModAction; moderator?: string }
export interface ModRecord { id: string; reportId: string | null; target: string; action: ModAction | "auto_hold"; moderator: string; until: string | null; at: string }
export interface SocialSnapshot { friendships: Friendship[]; blocks: [string, string[]][]; mutes: [string, string[]][]; groups: Group[]; messages: StoredMessage[]; reports: Report[]; modLog: ModRecord[]; sanctions: [string, number][]; warnings: [string, number][] }

export interface SocialDeps { exists(id: string): boolean; campusOf(id: string): string | undefined; dirty(): void }
type Err<C extends string> = { ok: false; code: C };
const err = <C extends string>(code: C): Err<C> => ({ ok: false, code });
const DAY = 86_400_000;

export class SocialState {
  private friendships = new Map<string, Friendship>();
  private blocks = new Map<string, Set<string>>();
  private mutes = new Map<string, Set<string>>();
  private groups = new Map<string, Group>();
  private messages = new Map<string, StoredMessage[]>();
  private reports: Report[] = [];
  private modLog: ModRecord[] = [];
  private sanctions = new Map<string, number>();
  private warnings = new Map<string, number>();
  private sendTimes = new Map<string, number[]>(); // rate-limit memory only
  private lastText = new Map<string, { text: string; at: number }>();
  private online = new Set<string>(); // presence: in memory, never persisted
  constructor(private deps: SocialDeps) {}

  // ---------- presence ----------
  setOnline(id: string, on: boolean): void { if (on) this.online.add(id); else this.online.delete(id); }
  isOnline(id: string): boolean { return this.online.has(id); }

  // ---------- blocks and mutes ----------
  hasBlocked(by: string, target: string): boolean { return this.blocks.get(by)?.has(target) ?? false; }
  blockedEitherWay(a: string, b: string): boolean { return this.hasBlocked(a, b) || this.hasBlocked(b, a); }
  /** Everyone with a block relation to `id` in either direction (realtime hides these pairs). */
  blockPeers(id: string): string[] {
    const out = new Set<string>(this.blocks.get(id) ?? []);
    for (const [by, set] of this.blocks) if (set.has(id)) out.add(by);
    return [...out];
  }
  blockedList(id: string): string[] { return [...(this.blocks.get(id) ?? [])]; }
  mutedList(id: string): string[] { return [...(this.mutes.get(id) ?? [])]; }
  block(me: string, target: string): { ok: true } | Err<"self" | "not_found"> {
    if (me === target) return err("self");
    if (!this.deps.exists(target)) return err("not_found");
    const s = this.blocks.get(me) ?? new Set<string>(); s.add(target); this.blocks.set(me, s);
    this.friendships.delete(pairKey(me, target)); // a block ends any friendship or pending request
    this.deps.dirty();
    return { ok: true };
  }
  unblock(me: string, target: string): void { if (this.blocks.get(me)?.delete(target)) this.deps.dirty(); }
  mute(me: string, target: string): { ok: true } | Err<"self" | "not_found"> {
    if (me === target) return err("self");
    if (!this.deps.exists(target)) return err("not_found");
    const s = this.mutes.get(me) ?? new Set<string>(); s.add(target); this.mutes.set(me, s); this.deps.dirty();
    return { ok: true };
  }
  unmute(me: string, target: string): void { if (this.mutes.get(me)?.delete(target)) this.deps.dirty(); }

  // ---------- friends ----------
  private rel(a: string, b: string): Friendship | undefined { return this.friendships.get(pairKey(a, b)); }
  areFriends(a: string, b: string): boolean { return this.rel(a, b)?.status === "accepted"; }
  friendsOf(id: string): string[] { return this.list(id, (f) => f.status === "accepted").map((f) => (f.a === id ? f.b : f.a)); }
  incomingOf(id: string): string[] { return this.list(id, (f) => f.status === "pending" && f.requester !== id).map((f) => f.requester); }
  outgoingOf(id: string): string[] { return this.list(id, (f) => f.status === "pending" && f.requester === id).map((f) => (f.a === id ? f.b : f.a)); }
  private list(id: string, pred: (f: Friendship) => boolean): Friendship[] { return [...this.friendships.values()].filter((f) => (f.a === id || f.b === id) && pred(f)); }

  /** Block-either-way, unknown and over-capacity targets all answer `unavailable` so a block never leaks. */
  requestFriend(from: string, to: string, nowMs: number): { ok: true; state: "requested" | "accepted"; newlyFriends: boolean } | Err<"self" | "unavailable" | "already_friends" | "too_many_requests" | "friend_limit"> {
    if (from === to) return err("self");
    if (!this.deps.exists(to) || this.blockedEitherWay(from, to)) return err("unavailable");
    const cur = this.rel(from, to);
    if (cur?.status === "accepted") return err("already_friends");
    if (cur && cur.requester === from) return { ok: true, state: "requested", newlyFriends: false }; // idempotent
    if (cur) return this.accept(from, to, nowMs) as { ok: true; state: "accepted"; newlyFriends: boolean } | Err<"friend_limit">;
    if (this.outgoingOf(from).length >= SOCIAL.maxOutgoing) return err("too_many_requests");
    if (this.incomingOf(to).length >= SOCIAL.maxIncoming) return err("unavailable");
    const [a, b] = from < to ? [from, to] : [to, from];
    this.friendships.set(pairKey(a, b), { a, b, requester: from, status: "pending", at: new Date(nowMs).toISOString() });
    this.deps.dirty();
    return { ok: true, state: "requested", newlyFriends: false };
  }
  private accept(me: string, other: string, nowMs: number): { ok: true; state: "accepted"; newlyFriends: boolean } | Err<"friend_limit"> {
    if (this.friendsOf(me).length >= SOCIAL.maxFriends || this.friendsOf(other).length >= SOCIAL.maxFriends) return err("friend_limit");
    const f = this.rel(me, other)!; f.status = "accepted"; f.at = new Date(nowMs).toISOString();
    this.deps.dirty();
    return { ok: true, state: "accepted", newlyFriends: true };
  }
  respond(me: string, other: string, accept: boolean, nowMs: number): { ok: true; state: "accepted" | "declined"; newlyFriends: boolean } | Err<"not_found" | "friend_limit"> {
    const f = this.rel(me, other);
    if (!f || f.status !== "pending" || f.requester !== other || this.blockedEitherWay(me, other)) return err("not_found");
    if (!accept) { this.friendships.delete(pairKey(me, other)); this.deps.dirty(); return { ok: true, state: "declined", newlyFriends: false }; }
    return this.accept(me, other, nowMs);
  }
  /** Unfriend or cancel your own outgoing request; idempotent. */
  removeFriend(me: string, other: string): void { if (this.friendships.delete(pairKey(me, other))) this.deps.dirty(); }

  // ---------- groups ----------
  group(id: string): Group | undefined { return this.groups.get(id); }
  groupsOf(id: string): Group[] { return [...this.groups.values()].filter((g) => id in g.members); }
  groupsForCampus(campus: string): Group[] { return [...this.groups.values()].filter((g) => g.campus === campus).sort((a, b) => Object.keys(b.members).length - Object.keys(a.members).length || a.name.localeCompare(b.name)); }
  createGroup(owner: string, name: string, description: string, nowMs: number): { ok: true; group: Group } | Err<"not_found" | "group_limit" | "name_taken"> {
    const campus = this.deps.campusOf(owner);
    if (!campus) return err("not_found");
    if ([...this.groups.values()].filter((g) => g.ownerId === owner).length >= SOCIAL.maxGroupsOwned || this.groupsOf(owner).length >= SOCIAL.maxGroupsJoined) return err("group_limit");
    if (this.groupsForCampus(campus).some((g) => g.name.toLowerCase() === name.toLowerCase())) return err("name_taken");
    const at = new Date(nowMs).toISOString();
    const group: Group = { id: randomUUID(), name, description, campus, ownerId: owner, createdAt: at, members: { [owner]: { role: "owner", at } }, banned: [] };
    this.groups.set(group.id, group); this.deps.dirty();
    return { ok: true, group };
  }
  joinGroup(me: string, groupId: string, nowMs: number): { ok: true; joined: boolean } | Err<"unavailable" | "wrong_campus" | "group_full" | "group_limit"> {
    const g = this.groups.get(groupId);
    if (!g || g.banned.includes(me) || this.blockedEitherWay(me, g.ownerId)) return err("unavailable");
    if (me in g.members) return { ok: true, joined: false };
    if (this.deps.campusOf(me) !== g.campus) return err("wrong_campus");
    if (Object.keys(g.members).length >= SOCIAL.maxGroupMembers) return err("group_full");
    if (this.groupsOf(me).length >= SOCIAL.maxGroupsJoined) return err("group_limit");
    g.members[me] = { role: "member", at: new Date(nowMs).toISOString() }; this.deps.dirty();
    return { ok: true, joined: true };
  }
  /** The owner leaving hands the group to the longest-standing member, or deletes an empty group and its chat. */
  leaveGroup(me: string, groupId: string): void {
    const g = this.groups.get(groupId);
    if (!g || !(me in g.members)) return;
    delete g.members[me];
    const rest = Object.entries(g.members).sort((x, y) => x[1].at.localeCompare(y[1].at));
    if (rest.length === 0) { this.groups.delete(groupId); this.messages.delete(groupKey(groupId)); }
    else if (g.ownerId === me) { g.ownerId = rest[0]![0]; g.members[g.ownerId] = { ...g.members[g.ownerId]!, role: "owner" }; }
    this.deps.dirty();
  }
  kick(owner: string, groupId: string, target: string): { ok: true } | Err<"not_found" | "forbidden" | "self"> {
    const g = this.groups.get(groupId);
    if (!g) return err("not_found");
    if (g.ownerId !== owner) return err("forbidden");
    if (target === owner) return err("self");
    if (!(target in g.members)) return err("not_found");
    delete g.members[target]; g.banned.push(target); this.deps.dirty();
    return { ok: true };
  }

  // ---------- chat ----------
  chatMutedUntil(id: string, nowMs: number): number | null { const u = this.sanctions.get(id); return u && u > nowMs ? u : null; }
  /** DMs are friends-only; groups are members-only. Anything else answers `forbidden`. */
  canAccess(viewer: string, conv: string): boolean {
    if (conv.startsWith("g:")) return viewer in (this.groups.get(conv.slice(2))?.members ?? {});
    const [, pair] = conv.split(":"); const [a, b] = (pair ?? "").split("|");
    return (viewer === a || viewer === b) && !!a && !!b && this.areFriends(a, b) && !this.blockedEitherWay(a, b);
  }
  send(conv: string, from: string, text: string, nowMs: number): { ok: true; message: StoredMessage } | { ok: false; code: "forbidden" | "chat_muted" | "rate_limited" | "duplicate"; retryMs?: number; until?: string } {
    if (!this.canAccess(from, conv)) return { ok: false, code: "forbidden" };
    const muted = this.chatMutedUntil(from, nowMs);
    if (muted) return { ok: false, code: "chat_muted", until: new Date(muted).toISOString() };
    const times = this.sendTimes.get(from) ?? [];
    const gate = chatAllowed(times, nowMs);
    if (!gate.ok) return { ok: false, code: "rate_limited", retryMs: gate.retryMs };
    const lk = `${from}:${conv}`, last = this.lastText.get(lk);
    if (last && last.text === text.toLowerCase() && nowMs - last.at < SOCIAL.duplicateWindowMs) return { ok: false, code: "duplicate" };
    this.sendTimes.set(from, [...times.filter((t) => nowMs - t < 60_000), nowMs]);
    this.lastText.set(lk, { text: text.toLowerCase(), at: nowMs });
    const message: StoredMessage = { id: randomUUID(), conv, from, text, at: new Date(nowMs).toISOString() };
    const buf = this.messages.get(conv) ?? []; buf.push(message);
    if (buf.length > SOCIAL.bufferPerConversation) buf.splice(0, buf.length - SOCIAL.bufferPerConversation);
    this.messages.set(conv, buf); this.deps.dirty();
    return { ok: true, message };
  }
  /** Blocked pairs are hidden both ways; muted senders are hidden from the muter only. */
  history(conv: string, viewer: string, after?: string): StoredMessage[] | null {
    if (!this.canAccess(viewer, conv)) return null;
    return (this.messages.get(conv) ?? []).filter((m) => (!after || m.at > after) && (m.from === viewer || (!this.blockedEitherWay(viewer, m.from) && !this.mutes.get(viewer)?.has(m.from)))).slice(-SOCIAL.historyLimit);
  }
  private findVisible(viewer: string, messageId: string): StoredMessage | undefined {
    for (const [conv, buf] of this.messages) { const m = buf.find((x) => x.id === messageId); if (m && this.canAccess(viewer, conv)) return m; }
    return undefined;
  }

  // ---------- reports and moderation ----------
  createReport(i: { reporter: string; target: string; reason: ReportReason; context: ReportContext; note: string; messageId?: string }, nowMs: number):
    { ok: true; report: Report; replay: boolean; autoHeld: boolean } | Err<"self" | "not_found" | "rate_limited" | "bad_evidence"> {
    if (i.reporter === i.target) return err("self");
    if (!this.deps.exists(i.target)) return err("not_found");
    const mine = this.reports.filter((r) => r.reporter === i.reporter && nowMs - Date.parse(r.createdAt) < DAY);
    const dup = mine.find((r) => r.target === i.target && r.reason === i.reason && r.status === "open");
    if (dup) return { ok: true, report: dup, replay: true, autoHeld: false };
    if (mine.length >= SOCIAL.reportsPerDay) return err("rate_limited");
    let evidence: Report["evidence"] = null;
    if (i.messageId) {
      const m = this.findVisible(i.reporter, i.messageId);
      if (!m || m.from !== i.target) return err("bad_evidence");
      evidence = { messageId: m.id, text: m.text }; // snapshot: the rolling chat buffer will eventually drop it
    }
    const report: Report = { id: randomUUID(), reporter: i.reporter, target: i.target, reason: i.reason, context: i.context, note: i.note, evidence, status: "open", createdAt: new Date(nowMs).toISOString(), resolvedAt: null };
    this.reports.push(report);
    // Several independent reporters trigger a short chat hold pending human review (never a ban, never permanent).
    const distinct = new Set(this.reports.filter((r) => r.target === i.target && r.status === "open" && nowMs - Date.parse(r.createdAt) < DAY).map((r) => r.reporter));
    let autoHeld = false;
    if (distinct.size >= SOCIAL.autoHoldReporters && !this.chatMutedUntil(i.target, nowMs)) {
      const until = nowMs + SOCIAL.autoHoldMs; this.sanctions.set(i.target, until); autoHeld = true;
      this.modLog.push(Object.freeze({ id: randomUUID(), reportId: report.id, target: i.target, action: "auto_hold" as const, moderator: "system", until: new Date(until).toISOString(), at: new Date(nowMs).toISOString() }));
    }
    this.deps.dirty();
    return { ok: true, report, replay: false, autoHeld };
  }
  openReports(): (Report & { reportCountOnTarget: number })[] {
    return this.reports.filter((r) => r.status === "open").map((r) => ({ ...r, reportCountOnTarget: this.reports.filter((x) => x.target === r.target).length }));
  }
  resolveReport(reportId: string, action: ModAction, moderator: string, nowMs: number): { ok: true; report: Report } | Err<"not_found" | "already_resolved"> {
    const r = this.reports.find((x) => x.id === reportId);
    if (!r) return err("not_found");
    if (r.status !== "open") return err("already_resolved");
    r.status = action === "dismiss" ? "dismissed" : "actioned"; r.action = action; r.moderator = moderator; r.resolvedAt = new Date(nowMs).toISOString();
    let until: string | null = null;
    if (MOD_ACTION_MS[action] > 0) { const u = Math.max(this.sanctions.get(r.target) ?? 0, nowMs + MOD_ACTION_MS[action]); this.sanctions.set(r.target, u); until = new Date(u).toISOString(); }
    if (action === "warn") this.warnings.set(r.target, (this.warnings.get(r.target) ?? 0) + 1);
    this.modLog.push(Object.freeze({ id: randomUUID(), reportId, target: r.target, action, moderator, until, at: r.resolvedAt }));
    this.deps.dirty();
    return { ok: true, report: r };
  }
  moderationFor(id: string, nowMs: number) {
    return { reportsAgainst: this.reports.filter((r) => r.target === id).length, openReportsAgainst: this.reports.filter((r) => r.target === id && r.status === "open").length, warnings: this.warnings.get(id) ?? 0,
      chatMutedUntil: this.chatMutedUntil(id, nowMs) ? new Date(this.sanctions.get(id)!).toISOString() : null, log: this.modLog.filter((m) => m.target === id).slice(-20) };
  }

  // ---------- durability ----------
  toSnapshot(): SocialSnapshot {
    return { friendships: [...this.friendships.values()], blocks: [...this.blocks].map(([k, v]) => [k, [...v]]), mutes: [...this.mutes].map(([k, v]) => [k, [...v]]), groups: [...this.groups.values()],
      messages: [...this.messages.values()].flat(), reports: [...this.reports], modLog: [...this.modLog], sanctions: [...this.sanctions], warnings: [...this.warnings] };
  }
  restore(s: SocialSnapshot | undefined): void {
    this.friendships.clear(); this.blocks.clear(); this.mutes.clear(); this.groups.clear(); this.messages.clear(); this.reports = []; this.modLog = []; this.sanctions.clear(); this.warnings.clear();
    if (!s) return;
    for (const f of s.friendships) this.friendships.set(pairKey(f.a, f.b), f);
    for (const [k, v] of s.blocks) this.blocks.set(k, new Set(v));
    for (const [k, v] of s.mutes) this.mutes.set(k, new Set(v));
    for (const g of s.groups) this.groups.set(g.id, g);
    for (const m of s.messages) { const b = this.messages.get(m.conv) ?? []; b.push(m); this.messages.set(m.conv, b); }
    this.reports = [...s.reports]; this.modLog = [...s.modLog];
    for (const [k, v] of s.sanctions) this.sanctions.set(k, v);
    for (const [k, v] of s.warnings) this.warnings.set(k, v);
  }
}
export { dmKey, groupKey };
