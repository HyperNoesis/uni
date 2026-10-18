import { randomUUID } from "node:crypto";
import {
  INTERACTION_POINTS,
  SPAWN,
  canSit,
  isBlocked,
  gateBlocked,
  gateDistance,
  gateSegmentBlocked,
  zoneAt,
  WORLD,
  validateMove,
  withinRange,
  type Avatar,
  type CampusId,
  type PlayerDelta,
  type PlayerSnapshot,
  type ServerMessage,
} from "@campus/domain";

export interface Conn {
  send(msg: ServerMessage): void;
  close(): void;
}

interface Player {
  id: string;
  name: string;
  campus: CampusId;
  avatar: Avatar;
  x: number;
  y: number;
  lastInputAt: number;
  /** Movement time bank (ms): real elapsed time accrues, accepted movement spends it, so input floods cannot exceed max speed. */
  moveBankMs: number;
  ack: number;
  emote?: string;
  emoteUntil: number;
  sitX?: number;
  sitY?: number;
  conn: Conn | null;
  reconnectToken: string;
  disconnectedAt: number | null;
  lastInteractAt: number;
  /** Approved at the Grand Gate: may walk through the pedestrian wicket. Lives as long as this session (kept across reconnects). */
  gatePassed: boolean;
  msgWindowStart: number;
  msgCount: number;
  /** What this viewer has been told about each visible entity (fingerprint), for delta snapshots. */
  known: Map<string, string>;
  lastSentAt: number;
  lastSentAck: number;
  corrections: number;
  corrWindowStart: number;
  lastEmoteAt: number;
  zone: string;
}

const RECONNECT_GRACE_MS = 30_000;
const MAX_MSGS_PER_SEC = 40;
const MAX_POPULATION = 60; // per room; overflow is routed to a new instance by the server
const KEEPALIVE_MS = 1000; // an idle viewer still gets a snapshot this often (population, ack)
const ABUSE_WINDOW_MS = 10_000;
const ABUSE_WARN = 30; // corrections within the window that get logged
const ABUSE_KICK = 120; // corrections within the window that end the connection
const EMOTE_COOLDOWN_MS = 400;
const MOVE_BANK_MAX_MS = 500; // longest burst of delayed packets we will absorb
const MOVE_BANK_START_MS = 50;

export interface RoomOptions {
  now?: () => number;
  onProximity?: (playerId: string, pointId: string) => void;
  /** Suspicious behaviour for logging/anti-cheat: repeated movement corrections. `kick` also closes the connection. */
  onAbuse?: (playerId: string, kind: "warn" | "kick", detail: { corrections: number }) => void;
  /** Fired when a player enters a different zone (analytics: zone_joined). */
  onZone?: (playerId: string, zone: string) => void;
  /** Fired when a player's reconnect grace expires and they are removed. */
  onLeave?: (playerId: string) => void;
}

/** One authoritative social-plaza instance. */
export class Room {
  readonly id = randomUUID();
  private players = new Map<string, Player>();
  private byReconnect = new Map<string, string>();
  private now: () => number;
  private opts: RoomOptions;
  /** Block relations (either direction) by player id. Blocked pairs never see each other (Phase 5). */
  private hidden = new Map<string, Set<string>>();
  /** Developer diagnostics only (never sent to players). */
  private diag = { corrections: 0, rejected: { unknown_point: 0, too_far: 0, emote_sit_denied: 0 }, ticks: 0, lastTickMs: 0, maxTickMs: 0, ticksOver50ms: 0 };

  constructor(opts: RoomOptions = {}) {
    this.now = opts.now ?? Date.now;
    this.opts = opts;
  }

  /** Replaces the full set of players hidden from/to `id` (loaded from the API at join). */
  setBlocks(id: string, peers: readonly string[]): void {
    const old = this.hidden.get(id) ?? new Set<string>();
    for (const o of old) this.hidden.get(o)?.delete(id);
    this.hidden.set(id, new Set(peers));
    for (const o of peers) { const s = this.hidden.get(o) ?? new Set<string>(); s.add(id); this.hidden.set(o, s); }
  }
  /** Adds or removes one pair; the next snapshot sends `gone` (or the entity again) to both sides. */
  setBlockedPair(a: string, b: string, blocked: boolean): void {
    for (const [x, y] of [[a, b], [b, a]] as const) {
      const s = this.hidden.get(x) ?? new Set<string>();
      if (blocked) s.add(y); else s.delete(y);
      this.hidden.set(x, s);
    }
  }
  isHiddenPair(a: string, b: string): boolean { return this.hidden.get(a)?.has(b) ?? false; }

  /** Counters for the developer-only /metrics endpoint. Contains no player names or positions. */
  stats() {
    let ghosts = 0;
    for (const p of this.players.values()) if (!p.conn) ghosts++;
    return { roomId: this.id, connected: this.population, ghosts, capacity: MAX_POPULATION, ...this.diag, rejected: { ...this.diag.rejected } };
  }

  get population(): number {
    let n = 0;
    for (const p of this.players.values()) if (p.conn) n++;
    return n;
  }

  get isFull(): boolean {
    return this.population >= MAX_POPULATION;
  }

  join(
    identity: { id: string; name: string; campus: CampusId; avatar: Avatar },
    conn: Conn,
    reconnectToken?: string,
  ): Player {
    // Reconnect: same player id + valid reconnect token keeps position.
    const existing = this.players.get(identity.id);
    if (existing && reconnectToken && existing.reconnectToken === reconnectToken) {
      existing.conn?.close();
      existing.conn = conn;
      existing.disconnectedAt = null;
      this.send(existing, {
        t: "welcome",
        selfId: existing.id,
        reconnectToken: existing.reconnectToken,
        x: existing.x,
        y: existing.y,
        players: this.fullView(existing),
      });
      return existing;
    }
    // A fresh join replaces any stale session for the same player.
    if (existing) {
      existing.conn?.close();
      this.byReconnect.delete(existing.reconnectToken);
      this.players.delete(existing.id);
    }
    const jitter = () => (Math.random() - 0.5) * 6;
    let sx = SPAWN.x + jitter(), sy = SPAWN.y + jitter() / 2;
    for (let i = 0; i < 20 && isBlocked(sx, sy); i++) { sx = SPAWN.x + jitter(); sy = SPAWN.y + jitter() / 2; }
    if (isBlocked(sx, sy)) { sx = SPAWN.x; sy = SPAWN.y; }
    const p: Player = {
      ...identity,
      x: sx,
      y: sy,
      lastInputAt: this.now(),
      moveBankMs: MOVE_BANK_START_MS,
      ack: 0,
      emoteUntil: 0,
      conn,
      reconnectToken: randomUUID(),
      disconnectedAt: null,
      lastInteractAt: 0,
      gatePassed: false,
      msgWindowStart: this.now(),
      msgCount: 0,
      known: new Map(),
      lastSentAt: 0,
      lastSentAck: -1,
      corrections: 0,
      corrWindowStart: this.now(),
      lastEmoteAt: 0,
      zone: zoneAt(sx, sy)?.id ?? "",
    };
    this.players.set(p.id, p);
    this.byReconnect.set(p.reconnectToken, p.id);
    this.send(p, {
      t: "welcome",
      selfId: p.id,
      reconnectToken: p.reconnectToken,
      x: p.x,
      y: p.y,
      players: this.fullView(p),
    });
    this.opts.onZone?.(p.id, p.zone);
    return p;
  }

  /** Returns true when `conn` was the player's current connection (false if a newer one replaced it). */
  disconnect(playerId: string, conn: Conn): boolean {
    const p = this.players.get(playerId);
    if (!p || p.conn !== conn) return false; // a newer connection already replaced it
    p.conn = null;
    p.disconnectedAt = this.now();
    return true;
  }

  /** Per-connection rate limit. Returns false when the player is flooding. */
  allow(playerId: string): boolean {
    const p = this.players.get(playerId);
    if (!p) return false;
    const t = this.now();
    if (t - p.msgWindowStart > 1000) {
      p.msgWindowStart = t;
      p.msgCount = 0;
    }
    p.msgCount++;
    return p.msgCount <= MAX_MSGS_PER_SEC;
  }

  /** The client says the entry check is done. Accepted only while the player is near the gate (soft check: the ceremony itself is client-side). */
  gatePass(playerId: string): void {
    const p = this.players.get(playerId);
    if (!p || p.gatePassed) return;
    if (gateDistance(p.x, p.y) <= 20) p.gatePassed = true;
  }

  input(playerId: string, seq: number, x: number, y: number): void {
    const p = this.players.get(playerId);
    if (!p || !p.conn) return;
    if (seq <= p.ack) return; // stale or replayed
    const t = this.now();
    const dt = t - p.lastInputAt;
    p.lastInputAt = t;
    p.moveBankMs = Math.min(MOVE_BANK_MAX_MS, p.moveBankMs + Math.max(0, dt));
    const r = gateSegmentBlocked(p.x, p.y, x, y, p.gatePassed) ? { x: p.x, y: p.y, corrected: true } : validateMove(p, { x, y }, p.moveBankMs, WORLD.maxSpeed, WORLD.speedTolerance, WORLD, (bx, by) => isBlocked(bx, by) || gateBlocked(bx, by, p.gatePassed), 0);
    p.moveBankMs = Math.max(0, p.moveBankMs - (Math.hypot(r.x - p.x, r.y - p.y) / (WORLD.maxSpeed * WORLD.speedTolerance)) * 1000);
    p.x = r.x;
    p.y = r.y;
    p.ack = seq;
    if (p.emote === "sit" && p.emoteUntil > t && Math.hypot(p.x - (p.sitX ?? p.x), p.y - (p.sitY ?? p.y)) > 0.35) p.emoteUntil = 0; // standing up
    if (r.corrected) {
      this.diag.corrections++;
      this.send(p, { t: "correct", x: p.x, y: p.y, ack: p.ack });
      this.noteCorrection(p, t);
    }
    const z = zoneAt(p.x, p.y)?.id ?? "";
    if (z !== p.zone) { p.zone = z; if (z) this.opts.onZone?.(p.id, z); }
  }

  /** Counts movement corrections in a sliding window; logs when high, disconnects when extreme. */
  private noteCorrection(p: Player, t: number): void {
    if (t - p.corrWindowStart > ABUSE_WINDOW_MS) { p.corrWindowStart = t; p.corrections = 0; }
    p.corrections++;
    if (p.corrections === ABUSE_WARN) this.opts.onAbuse?.(p.id, "warn", { corrections: p.corrections });
    if (p.corrections >= ABUSE_KICK) {
      this.opts.onAbuse?.(p.id, "kick", { corrections: p.corrections });
      p.corrections = 0;
      p.conn?.close();
    }
  }

  emote(playerId: string, emote: string): void {
    const p = this.players.get(playerId);
    if (!p) return;
    const t = this.now();
    if (t - p.lastEmoteAt < EMOTE_COOLDOWN_MS) return;
    if (emote === "sit" && !canSit(p.x, p.y)) { this.diag.rejected.emote_sit_denied++; return; } // server decides: Sit only works beside a bench
    p.lastEmoteAt = t;
    p.emote = emote;
    p.emoteUntil = this.now() + (emote === "sit" ? 20000 : 2500);
    p.sitX = p.x; p.sitY = p.y;
  }

  interact(playerId: string, pointId: string): void {
    const p = this.players.get(playerId);
    if (!p) return;
    const t = this.now();
    if (t - p.lastInteractAt < 500) return;
    p.lastInteractAt = t;
    const pt = INTERACTION_POINTS.find((i) => i.id === pointId);
    if (!pt) {
      this.diag.rejected.unknown_point++;
      this.send(p, { t: "interaction", pointId, ok: false, activity: null, reason: "unknown_point" });
      return;
    }
    if (!withinRange(p.x, p.y, pt.x, pt.y, WORLD.interactRange)) {
      this.diag.rejected.too_far++;
      this.send(p, { t: "interaction", pointId, ok: false, activity: null, reason: "too_far" });
      return;
    }
    if (pt.activity) this.opts.onProximity?.(p.id, pt.id);
    this.send(p, { t: "interaction", pointId, ok: true, activity: pt.activity });
  }

  private snap(o: Player): PlayerSnapshot {
    return { id: o.id, name: o.name, campus: o.campus, avatar: o.avatar, x: round(o.x), y: round(o.y), emote: o.emoteUntil > this.now() ? o.emote : undefined };
  }
  private fingerprint(o: Player): string {
    return `${round(o.x)}|${round(o.y)}|${o.emoteUntil > this.now() ? o.emote ?? "" : ""}`;
  }
  /** Interest management: other connected players within the interest radius (the viewer is never echoed back). */
  private visibleTo(viewer: Player): Player[] {
    const out: Player[] = [];
    for (const o of this.players.values()) {
      if (o.id === viewer.id || !o.conn || this.isHiddenPair(viewer.id, o.id)) continue;
      if (!withinRange(viewer.x, viewer.y, o.x, o.y, WORLD.interestRadius)) continue;
      out.push(o);
    }
    return out;
  }
  /** Full state for a (re)joining viewer; resets what we think they know. */
  private fullView(viewer: Player): PlayerSnapshot[] {
    viewer.known.clear();
    const list = this.visibleTo(viewer);
    for (const o of list) viewer.known.set(o.id, this.fingerprint(o));
    return list.map((o) => this.snap(o));
  }
  /** Delta against what the viewer already knows: new entities in full, changed ones as x/y/emote, departed as ids. */
  private diff(viewer: Player): { added: PlayerSnapshot[]; moved: PlayerDelta[]; gone: string[] } {
    const added: PlayerSnapshot[] = [], moved: PlayerDelta[] = [], gone: string[] = [];
    const seen = new Set<string>();
    for (const o of this.visibleTo(viewer)) {
      seen.add(o.id);
      const fp = this.fingerprint(o);
      const prev = viewer.known.get(o.id);
      if (prev === undefined) added.push(this.snap(o));
      else if (prev !== fp) { const e = o.emoteUntil > this.now() ? o.emote : undefined; moved.push({ id: o.id, x: round(o.x), y: round(o.y), ...(e ? { emote: e } : {}) }); }
      else continue;
      viewer.known.set(o.id, fp);
    }
    for (const id of viewer.known.keys()) if (!seen.has(id)) { gone.push(id); viewer.known.delete(id); }
    return { added, moved, gone };
  }

  tick(): void {
    const t = this.now();
    const wall0 = performance.now();
    for (const p of this.players.values()) {
      if (!p.conn && p.disconnectedAt !== null && t - p.disconnectedAt > RECONNECT_GRACE_MS) {
        this.byReconnect.delete(p.reconnectToken);
        this.players.delete(p.id);
        this.hidden.delete(p.id);
        this.opts.onLeave?.(p.id);
      }
    }
    const pop = this.population;
    for (const p of this.players.values()) {
      if (!p.conn) continue;
      const d = this.diff(p);
      const changed = d.added.length > 0 || d.moved.length > 0 || d.gone.length > 0 || p.ack !== p.lastSentAck;
      if (!changed && t - p.lastSentAt < KEEPALIVE_MS) continue; // nothing new: save the bytes
      p.lastSentAt = t;
      p.lastSentAck = p.ack;
      this.send(p, { t: "snapshot", ack: p.ack, players: d.added, moved: d.moved, gone: d.gone, serverTime: t, population: pop });
    }
    const ms = performance.now() - wall0;
    this.diag.ticks++; this.diag.lastTickMs = Math.round(ms * 100) / 100; this.diag.maxTickMs = Math.max(this.diag.maxTickMs, this.diag.lastTickMs);
    if (ms > 50) this.diag.ticksOver50ms++;
  }

  get roomEmpty(): boolean {
    return this.players.size === 0;
  }

  private send(p: Player, msg: ServerMessage): void {
    p.conn?.send(msg);
  }
}

const round = (n: number) => Math.round(n * 100) / 100;
