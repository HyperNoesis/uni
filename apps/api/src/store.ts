import { randomUUID } from "node:crypto";
import { CAMPUS_IDS, CAMPUSES, type AchievementId, type Avatar, type CampusId, type HomeLayout, type IdentityEvent, type LayoutError, type LedgerEntry, type PlayerProfile } from "@campus/domain";
import { SocialState, type SocialSnapshot } from "./social";
import { ProgressState, type ProgressSnapshot } from "./progress";
import { WarsState, type WarSource, type WarsSnapshot } from "./wars";
import { STARTER_COINS, achievementById, achievementsFor, avatarEquals, canRename, defaultLayout, getItem, itemAllowedFor, layoutsEqual, ownedCounts, shopItem, shopOffer, starterKit, validateLayout } from "@campus/domain";

// Repository behind one class. Every mutation calls onChange; persistence.ts snapshots the store to disk
// (DECISIONS.md D-016). A Postgres adapter replaces it later; the rules here (append-only, idempotent,
// balance derived from the ledger) are the production rules.

interface PlayerRow {
  id: string;
  displayName: string;
  campus: CampusId;
  avatar: Avatar;
  bio: string;
  reputation: number;
  createdAt: string;
  renamedAt: string | null;
}

export interface ActivityRun {
  id: string;
  playerId: string;
  startedAt: number;
  delayMs: number;
  completed: boolean;
}

export interface InventoryEntry { itemId: string; qty: number; acquiredAt: string }
export interface ItemGrant { id: string; playerId: string; itemId: string; qty: number; source: string; idempotencyKey: string; at: string }
export interface HomeRecord { layout: HomeLayout; revision: number; updatedAt: string }
export const SNAPSHOT_VERSION = 2 as const;
export interface StoreSnapshot {
  version: typeof SNAPSHOT_VERSION; savedAt: string; players: PlayerRow[]; ledger: LedgerEntry[]; idemResponses: [string, unknown][];
  lastCompleted: [string, number][]; dailyCount: [string, number][]; inventories: { playerId: string; items: InventoryEntry[] }[];
  itemGrants: ItemGrant[]; homes: ({ playerId: string } & HomeRecord)[]; achievements: { playerId: string; id: string; at: string }[];
  /** Phase 5. Optional so version-2 snapshots written before social existed still load. */
  social?: SocialSnapshot;
  /** Phase 6-7. Optional so older snapshots still load. */
  progress?: ProgressSnapshot;
  wars?: WarsSnapshot;
  /** Seasonal campus competition contributions. Optional for older v2 snapshots. */
  warPoints?: [string, number][];
  warDailyPoints?: [string, number][];
  quizDaily?: [string, number][];
  /** Event attendance responses keyed by unique event occurrence and player. */
  eventRsvps?: string[];
  /** Daily scavenger-hunt starts; attempts count even if abandoned, preventing restart rerolls. */
  huntDaily?: [string, number][];
}
export type UpdateProfileResult = { ok: true; profile: PlayerProfile; unlocked: AchievementId[] } | { ok: false; code: "not_found" } | { ok: false; code: "rename_cooldown"; retryAt: string };
export type ShopPurchaseResult =
  | { ok: true; itemId: string; itemName: string; price: number; profile: PlayerProfile; inventory: InventoryEntry[]; replay: boolean }
  | { ok: false; code: "not_found" | "not_shop_item" | "insufficient_funds" | "idempotency_conflict" };
export type SaveHomeResult = { ok: true; home: HomeRecord; unlocked: AchievementId[] } | { ok: false; code: "not_found" } | { ok: false; code: "conflict"; revision: number } | { ok: false; code: "invalid"; errors: LayoutError[] };
const MAX_IDEM = 20_000, SNAP_IDEM = 5_000;

export class Store {
  private players = new Map<string, PlayerRow>();
  private ledger: LedgerEntry[] = [];
  private idemIndex = new Map<string, LedgerEntry>(); // `${actor}:${key}`
  private idemResponses = new Map<string, unknown>();
  private balances = new Map<string, number>(); // cache, reconcilable from ledger
  private inventories = new Map<string, Map<string, InventoryEntry>>();
  private itemGrants: ItemGrant[] = [];
  private grantKeys = new Set<string>();
  private homes = new Map<string, HomeRecord>();
  private unlocks = new Map<string, Map<string, string>>();
  private lastCompleted = new Map<string, number>();
  private dailyCount = new Map<string, number>(); // `${player}:${yyyy-mm-dd}`
  private warPoints = new Map<string, number>(); // `${season}:${player}`
  private warDailyPoints = new Map<string, number>(); // `${season}:${player}:${yyyy-mm-dd}`
  private quizDaily = new Map<string, number>(); // `${player}:${yyyy-mm-dd}`
  private eventRsvps = new Set<string>(); // `${occurrenceKey}|${playerId}`
  private huntDaily = new Map<string, number>(); // `${player}:${yyyy-mm-dd}`
  runs = new Map<string, ActivityRun>();
  /** Set by the persistence adapter; called after every durable mutation. */
  onChange: (() => void) | null = null;
  private dirty(): void { this.onChange?.(); }
  grants = new Map<string, number>(); // `${player}:${pointId}` -> expiry
  readonly progress = new ProgressState({ dirty: () => this.dirty() });
  readonly wars = new WarsState({ campusOf: (id) => this.players.get(id)?.campus, campusIds: () => [...CAMPUS_IDS], population: (c) => [...this.players.values()].filter((p) => p.campus === c).length, dirty: () => this.dirty() });
  readonly social = new SocialState({ exists: (id) => this.players.has(id), campusOf: (id) => this.players.get(id)?.campus, dirty: () => this.dirty() });
  /** Safe public fields only: never bio-less private data, coins or createdAt. */
  publicPlayer(id: string) { const p = this.players.get(id); return p ? { id: p.id, name: p.displayName, campus: p.campus as string, avatar: p.avatar as unknown, reputation: p.reputation } : null; }
  searchPlayers(prefix: string, limit: number): string[] { const q = prefix.toLowerCase(); return [...this.players.values()].filter((p) => p.displayName.toLowerCase().startsWith(q)).sort((a, b) => b.reputation - a.reputation || a.displayName.localeCompare(b.displayName)).slice(0, limit).map((p) => p.id); }

  createPlayer(input: { displayName: string; campus: CampusId; avatar: Avatar; bio?: string }): PlayerProfile {
    const id = randomUUID();
    const at = new Date().toISOString();
    this.players.set(id, { id, displayName: input.displayName, campus: input.campus, avatar: input.avatar, bio: input.bio ?? "", reputation: 0, createdAt: at, renamedAt: null });
    this.appendLedger({ idempotencyKey: `starter:${id}`, actorId: id, sourceEvent: "ACCOUNT_CREATED", amount: STARTER_COINS, metadata: { reason: "starter grant" } });
    for (const k of starterKit(input.campus)) this.grantItem(id, k.itemId, "starter", `starter:${id}:${k.itemId}`, k.qty, at);
    this.homes.set(id, { layout: defaultLayout(input.campus), revision: 1, updatedAt: at });
    this.apply(id, { type: "IDENTITY_CREATED" }, at);
    this.dirty();
    return this.profile(id)!;
  }

  profile(id: string): PlayerProfile | null {
    const p = this.players.get(id);
    if (!p) return null;
    return { id: p.id, displayName: p.displayName, campus: p.campus, avatar: p.avatar as PlayerProfile["avatar"], bio: p.bio, reputation: p.reputation, createdAt: p.createdAt, coins: this.balance(id) };
  }

  addReputation(id: string, amount: number): void {
    const p = this.players.get(id);
    if (p) { p.reputation += amount; this.dirty(); }
  }

  /** Text policy is the caller's job; the store owns time-based rules and achievements. A refused rename applies nothing. */
  updateProfile(id: string, patch: { displayName?: string; bio?: string; avatar?: Avatar }, nowMs: number): UpdateProfileResult {
    const p = this.players.get(id);
    if (!p) return { ok: false, code: "not_found" };
    const at = new Date(nowMs).toISOString();
    const renaming = patch.displayName !== undefined && patch.displayName !== p.displayName;
    if (renaming) { const g = canRename(p.renamedAt, nowMs); if (!g.ok) return { ok: false, code: "rename_cooldown", retryAt: g.retryAt }; }
    const events: IdentityEvent[] = [];
    if (renaming) { p.displayName = patch.displayName!; p.renamedAt = at; }
    if (patch.avatar !== undefined && !avatarEquals(patch.avatar, p.avatar)) { p.avatar = patch.avatar; events.push({ type: "AVATAR_CHANGED" }); }
    if (patch.bio !== undefined && patch.bio !== p.bio) { p.bio = patch.bio; events.push({ type: "BIO_SET", length: patch.bio.length }); }
    const unlocked = events.flatMap((e) => this.apply(id, e, at));
    this.dirty();
    return { ok: true, profile: this.profile(id)!, unlocked };
  }

  renameAvailableAt(id: string, nowMs: number): string | null {
    const p = this.players.get(id);
    if (!p) return null;
    const g = canRename(p.renamedAt, nowMs);
    return g.ok ? null : g.retryAt;
  }

  // ---------- achievements (server-verified events only) ----------
  achievements(id: string): { id: string; unlockedAt: string }[] {
    return [...(this.unlocks.get(id) ?? new Map<string, string>()).entries()].map(([aid, unlockedAt]) => ({ id: aid, unlockedAt })).sort((a, b) => a.unlockedAt.localeCompare(b.unlockedAt) || a.id.localeCompare(b.id));
  }
  recordEvent(id: string, event: IdentityEvent, nowMs: number): AchievementId[] {
    if (!this.players.has(id)) return [];
    const u = this.apply(id, event, new Date(nowMs).toISOString());
    if (u.length) this.dirty();
    return u;
  }
  private apply(id: string, e: IdentityEvent, at: string): AchievementId[] { return achievementsFor(e).filter((a) => this.unlock(id, a, at)); }
  /** One-time: grants the achievement's reputation and item exactly once. */
  private unlock(id: string, aid: AchievementId, at: string): boolean {
    const def = achievementById(aid);
    const mine = this.unlocks.get(id) ?? new Map<string, string>();
    if (!def || mine.has(aid)) return false;
    mine.set(aid, at); this.unlocks.set(id, mine);
    if (def.reputation > 0) { const p = this.players.get(id); if (p) p.reputation += def.reputation; }
    if (def.itemId) this.grantItem(id, def.itemId, "achievement", `achievement:${aid}`, 1, at);
    return true;
  }

  // ---------- inventory ----------
  /** Idempotent per (player, key); false when the key was already used. */
  grantItem(playerId: string, itemId: string, source: string, key: string, qty = 1, at = new Date().toISOString()): boolean {
    const pl = this.players.get(playerId), def = getItem(itemId);
    if (!pl || !def) throw new Error(`cannot grant ${itemId} to ${playerId}`);
    if (!itemAllowedFor(def, pl.campus)) throw new Error(`${itemId} is not available to ${pl.campus}`);
    if (!Number.isInteger(qty) || qty < 1) throw new Error("qty must be a positive integer");
    const k = `${playerId}:${key}`;
    if (this.grantKeys.has(k)) return false;
    this.grantKeys.add(k);
    this.itemGrants.push(Object.freeze({ id: randomUUID(), playerId, itemId, qty, source, idempotencyKey: key, at }));
    const inv = this.inventories.get(playerId) ?? new Map<string, InventoryEntry>();
    const cur = inv.get(itemId);
    inv.set(itemId, cur ? { ...cur, qty: cur.qty + qty } : { itemId, qty, acquiredAt: at });
    this.inventories.set(playerId, inv);
    this.dirty();
    return true;
  }
  inventory(id: string): InventoryEntry[] { return [...(this.inventories.get(id)?.values() ?? [])].map((e) => ({ ...e })).sort((a, b) => a.itemId.localeCompare(b.itemId)); }
  ownedCounts(id: string): Record<string, number> { return ownedCounts(this.inventory(id)); }
  itemGrantsFor(id: string): readonly ItemGrant[] { return this.itemGrants.filter((g) => g.playerId === id); }

  /**
   * Server-priced purchase. The ledger debit and inventory grant share one idempotency key.
   * If a process stops between the two mutations, replaying the same key repairs the grant
   * without charging a second time. Client-supplied prices are never accepted here.
   */
  purchaseItem(playerId: string, itemId: string, idempotencyKey: string, nowMs: number): ShopPurchaseResult {
    const player = this.profile(playerId);
    if (!player) return { ok: false, code: "not_found" };
    const item = shopItem(itemId);
    const offer = shopOffer(itemId);
    if (!item || !offer || item.source !== "shop") return { ok: false, code: "not_shop_item" };

    const ledgerKey = `shop-purchase:${idempotencyKey}`;
    const grantKey = `shop-purchase:${idempotencyKey}`;
    const prior = this.idemIndex.get(`${playerId}:${ledgerKey}`);
    if (prior) {
      if (prior.sourceEvent !== "SHOP_PURCHASE" || prior.metadata.itemId !== itemId) return { ok: false, code: "idempotency_conflict" };
      // Crash recovery: if a snapshot captured the debit before the inventory grant, repair it.
      this.grantItem(playerId, itemId, "shop", grantKey, 1, prior.createdAt);
      return { ok: true, itemId, itemName: item.name, price: -prior.amount, profile: this.profile(playerId)!, inventory: this.inventory(playerId), replay: true };
    }
    if (player.coins < offer.price) return { ok: false, code: "insufficient_funds" };

    this.appendLedger({
      idempotencyKey: ledgerKey,
      actorId: playerId,
      sourceEvent: "SHOP_PURCHASE",
      amount: -offer.price,
      metadata: { itemId, price: offer.price, itemName: item.name },
    });
    // This item is server-defined in the catalogue and not campus-restricted, so the validated grant cannot fail.
    this.grantItem(playerId, itemId, "shop", grantKey, 1, new Date(nowMs).toISOString());
    return { ok: true, itemId, itemName: item.name, price: offer.price, profile: this.profile(playerId)!, inventory: this.inventory(playerId), replay: false };
  }

  // ---------- home ----------
  home(id: string): HomeRecord | null { const h = this.homes.get(id); return h ? { layout: structuredClone(h.layout), revision: h.revision, updatedAt: h.updatedAt } : null; }
  /** Optimistic concurrency: a stale revision conflicts; re-saving the stored layout is a no-op success (safe retry). */
  saveHome(id: string, layout: HomeLayout, expectedRevision: number, nowMs: number): SaveHomeResult {
    const pl = this.players.get(id), cur = this.homes.get(id);
    if (!pl || !cur) return { ok: false, code: "not_found" };
    if (layoutsEqual(layout, cur.layout)) return { ok: true, home: this.home(id)!, unlocked: [] };
    if (expectedRevision !== cur.revision) return { ok: false, code: "conflict", revision: cur.revision };
    const v = validateLayout(layout, this.ownedCounts(id), pl.campus);
    if (!v.ok) return { ok: false, code: "invalid", errors: v.errors };
    const at = new Date(nowMs).toISOString();
    this.homes.set(id, { layout: structuredClone(layout), revision: cur.revision + 1, updatedAt: at });
    const unlocked = this.apply(id, { type: "HOME_SAVED", placed: layout.items.length }, at);
    this.dirty();
    return { ok: true, home: this.home(id)!, unlocked };
  }

  /** Append-only. Returns the existing entry for a repeated idempotency key. */
  appendLedger(e: {
    idempotencyKey: string;
    actorId: string;
    sourceEvent: string;
    amount: number;
    metadata?: Record<string, unknown>;
  }): { entry: LedgerEntry; replay: boolean } {
    const k = `${e.actorId}:${e.idempotencyKey}`;
    const existing = this.idemIndex.get(k);
    if (existing) return { entry: existing, replay: true };
    const entry: LedgerEntry = Object.freeze({
      id: randomUUID(),
      idempotencyKey: e.idempotencyKey,
      actorId: e.actorId,
      sourceEvent: e.sourceEvent,
      currency: "CAMPUS_COINS" as const,
      amount: e.amount,
      createdAt: new Date().toISOString(),
      metadata: Object.freeze({ ...(e.metadata ?? {}) }) as Record<string, unknown>,
    });
    this.ledger.push(entry);
    this.idemIndex.set(k, entry);
    this.balances.set(e.actorId, (this.balances.get(e.actorId) ?? 0) + e.amount);
    this.dirty();
    return { entry, replay: false };
  }

  balance(id: string): number {
    return this.balances.get(id) ?? 0;
  }

  /** Source of truth check used by reconciliation jobs and tests. */
  reconcile(id: string): number {
    return this.ledger.filter((l) => l.actorId === id).reduce((s, l) => s + l.amount, 0);
  }

  ledgerFor(id: string): readonly LedgerEntry[] {
    return this.ledger.filter((l) => l.actorId === id);
  }

  getIdemResponse(actor: string, key: string): unknown {
    return this.idemResponses.get(`${actor}:${key}`);
  }
  setIdemResponse(actor: string, key: string, body: unknown): void {
    this.idemResponses.set(`${actor}:${key}`, body);
    if (this.idemResponses.size > MAX_IDEM) this.idemResponses.delete(this.idemResponses.keys().next().value as string);
    this.dirty();
  }

  // Activity anti-abuse counters are durable so a restart is not a free reset.
  lastCompletedAt(id: string): number { return this.lastCompleted.get(id) ?? 0; }
  dailyUsed(id: string, day: string): number { return this.dailyCount.get(`${id}:${day}`) ?? 0; }
  noteCompletion(id: string, atMs: number, day: string, rewarded: boolean): void {
    this.lastCompleted.set(id, atMs);
    if (rewarded) this.dailyCount.set(`${id}:${day}`, this.dailyUsed(id, day) + 1);
    this.dirty();
  }
  playerCount(): number { return this.players.size; }

  quizAttemptsToday(id: string, day: string): number { return this.quizDaily.get(`${id}:${day}`) ?? 0; }
  noteQuizAttempt(id: string, day: string): void {
    const key = `${id}:${day}`;
    this.quizDaily.set(key, (this.quizDaily.get(key) ?? 0) + 1);
    this.dirty();
  }
  huntAttemptsToday(id: string, day: string): number { return this.huntDaily.get(`${id}:${day}`) ?? 0; }
  noteHuntAttempt(id: string, day: string): void {
    const key = `${id}:${day}`;
    this.huntDaily.set(key, (this.huntDaily.get(key) ?? 0) + 1);
    this.dirty();
  }

  hasEventRsvp(occurrenceKey: string, playerId: string): boolean {
    return this.eventRsvps.has(`${occurrenceKey}|${playerId}`);
  }
  eventRsvpCount(occurrenceKey: string): number {
    const prefix = `${occurrenceKey}|`;
    let count = 0;
    for (const key of this.eventRsvps) if (key.startsWith(prefix)) count++;
    return count;
  }
  setEventRsvp(occurrenceKey: string, playerId: string, attending: boolean): boolean {
    if (!this.players.has(playerId)) return false;
    const key = `${occurrenceKey}|${playerId}`;
    if (attending) {
      if (this.eventRsvps.has(key)) return false;
      this.eventRsvps.add(key);
    } else {
      if (!this.eventRsvps.has(key)) return false;
      this.eventRsvps.delete(key);
    }
    this.dirty();
    return true;
  }

  /** Awards Campus Wars points through the append-only contribution log (per-source and daily caps enforced there). */
  awardWarPoints(id: string, seasonId: string, day: string, requested: number, source: WarSource, key: string, nowMs = Date.now()): number {
    return this.wars.award({ playerId: id, season: seasonId, day, source, requested, key }, nowMs);
  }

  /** Ranking is average points per active contributor; campuses below the contributor minimum are listed as unranked. */
  campusWarLeaderboard(seasonId: string): { campus: CampusId; name: string; score: number; totalPoints: number; contributors: number; population: number; ranked: boolean }[] {
    return this.wars.leaderboard(seasonId).map((e) => ({ ...e, campus: e.campus as CampusId, name: CAMPUSES[e.campus as CampusId].name }));
  }

  leaderboard(): { campus: CampusId; score: number }[] {
    const totals = new Map<CampusId, number>();
    for (const p of this.players.values()) {
      totals.set(p.campus, (totals.get(p.campus) ?? 0) + p.reputation);
    }
    return [...totals.entries()].map(([campus, score]) => ({ campus, score })).sort((a, b) => b.score - a.score);
  }

  // ---------- durability ----------
  toSnapshot(nowMs = Date.now()): StoreSnapshot {
    const oldest = new Date(nowMs - 2 * 86_400_000).toISOString().slice(0, 10);
    const oldEventRsvpCutoff = nowMs - 90 * 86_400_000;
    // Only future/recent occurrences matter to the current event calendar; bound attendance history.
    for (const key of this.eventRsvps) {
      const atText = key.slice(key.indexOf("@") + 1, key.lastIndexOf("|"));
      const at = Date.parse(atText);
      if (!Number.isFinite(at) || at < oldEventRsvpCutoff) this.eventRsvps.delete(key);
    }
    return {
      version: SNAPSHOT_VERSION, savedAt: new Date(nowMs).toISOString(), players: [...this.players.values()].map((p) => ({ ...p })), ledger: [...this.ledger],
      idemResponses: [...this.idemResponses.entries()].slice(-SNAP_IDEM), lastCompleted: [...this.lastCompleted.entries()],
      dailyCount: [...this.dailyCount.entries()].filter(([k]) => k.slice(-10) >= oldest),
      inventories: [...this.inventories.entries()].map(([playerId, m]) => ({ playerId, items: [...m.values()] })), itemGrants: [...this.itemGrants],
      homes: [...this.homes.entries()].map(([playerId, h]) => ({ playerId, ...h })),
      achievements: [...this.unlocks.entries()].flatMap(([playerId, m]) => [...m.entries()].map(([id, at]) => ({ playerId, id, at }))),
      social: this.social.toSnapshot(),
      progress: this.progress.toSnapshot(),
      wars: this.wars.toSnapshot(),
      warPoints: [...this.warPoints.entries()],
      warDailyPoints: [...this.warDailyPoints.entries()].filter(([k]) => k.slice(-10) >= oldest),
      quizDaily: [...this.quizDaily.entries()].filter(([k]) => k.slice(-10) >= oldest),
      eventRsvps: [...this.eventRsvps],
      huntDaily: [...this.huntDaily.entries()].filter(([k]) => k.slice(-10) >= oldest),
    };
  }

  /** Replaces all state; throws on an unknown version so a bad file is never half-loaded. */
  restore(s: StoreSnapshot): void {
    if (!s || s.version !== SNAPSHOT_VERSION) throw new Error(`unsupported snapshot version: ${String((s as { version?: unknown })?.version)}`);
    this.players.clear(); this.ledger = []; this.idemIndex.clear(); this.idemResponses.clear(); this.balances.clear(); this.inventories.clear();
    this.itemGrants = []; this.grantKeys.clear(); this.homes.clear(); this.unlocks.clear(); this.lastCompleted.clear(); this.dailyCount.clear();
    this.warPoints.clear(); this.warDailyPoints.clear(); this.quizDaily.clear(); this.eventRsvps.clear(); this.huntDaily.clear();
    for (const p of s.players) this.players.set(p.id, { ...p, bio: p.bio ?? "", renamedAt: p.renamedAt ?? null });
    for (const e of s.ledger) {
      const entry = Object.freeze({ ...e, metadata: Object.freeze({ ...e.metadata }) }) as LedgerEntry;
      this.ledger.push(entry); this.idemIndex.set(`${entry.actorId}:${entry.idempotencyKey}`, entry);
      this.balances.set(entry.actorId, (this.balances.get(entry.actorId) ?? 0) + entry.amount);
    }
    for (const [k, v] of s.idemResponses) this.idemResponses.set(k, v);
    for (const [k, v] of s.lastCompleted) this.lastCompleted.set(k, v);
    for (const [k, v] of s.dailyCount) this.dailyCount.set(k, v);
    for (const [k, v] of s.warPoints ?? []) this.warPoints.set(k, v);
    for (const [k, v] of s.warDailyPoints ?? []) this.warDailyPoints.set(k, v);
    for (const [k, v] of s.quizDaily ?? []) this.quizDaily.set(k, v);
    for (const [k, v] of s.huntDaily ?? []) this.huntDaily.set(k, v);
    for (const key of s.eventRsvps ?? []) {
      const separator = key.lastIndexOf("|");
      if (separator > 0 && this.players.has(key.slice(separator + 1))) this.eventRsvps.add(key);
    }
    for (const g of s.itemGrants) { this.itemGrants.push(Object.freeze({ ...g })); this.grantKeys.add(`${g.playerId}:${g.idempotencyKey}`); }
    for (const inv of s.inventories) this.inventories.set(inv.playerId, new Map(inv.items.map((x) => [x.itemId, { ...x }])));
    for (const a of s.achievements) { const m = this.unlocks.get(a.playerId) ?? new Map<string, string>(); m.set(a.id, a.at); this.unlocks.set(a.playerId, m); }
    for (const h of s.homes) {
      const pl = this.players.get(h.playerId);
      if (!pl) continue;
      // A stored room that no longer validates falls back to the starter room instead of breaking the home.
      const ok = validateLayout(h.layout, ownedCounts([...(this.inventories.get(h.playerId)?.values() ?? [])]), pl.campus).ok;
      this.homes.set(h.playerId, ok ? { layout: h.layout, revision: h.revision, updatedAt: h.updatedAt } : { layout: defaultLayout(pl.campus), revision: h.revision + 1, updatedAt: h.updatedAt });
    }
    for (const p of this.players.values()) if (!this.homes.has(p.id)) this.homes.set(p.id, { layout: defaultLayout(p.campus), revision: 1, updatedAt: p.createdAt });
    this.social.restore(s.social);
    this.progress.restore(s.progress);
    this.wars.restore(s.wars);
  }
}
