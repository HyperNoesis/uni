import { randomUUID } from "node:crypto";

// Campus Wars (Phase 7). Every point is an append-only contribution event stamped with the rule version, so any season score
// can be recomputed. Fairness: per-player daily caps (total and per source), ranking by average points per active contributor,
// and a minimum number of contributors before a campus is ranked (smaller campuses show as "Rising", never hidden).
export const WARS = {
  rule: 1,
  dailyPlayerCap: 40,
  sourceCaps: { quiz: 20, reaction: 10, hunt: 10, event: 20, social: 10, quest: 10, job: 10 },
  minContributors: 3,
} as const;
export type WarSource = keyof typeof WARS.sourceCaps;

export interface Contribution { id: string; season: string; rule: number; playerId: string; campus: string; source: WarSource; points: number; day: string; key: string; at: string }
export interface WarEntry { campus: string; score: number; totalPoints: number; contributors: number; population: number; ranked: boolean }
export interface SeasonResult { season: string; rule: number; standings: (WarEntry & { rank: number | null })[]; at: string }
export interface WarsSnapshot { contributions: Contribution[]; checkins: string[]; results: SeasonResult[] }

export interface WarsDeps { campusOf(id: string): string | undefined; campusIds(): string[]; population(campus: string): number; dirty(): void }

export class WarsState {
  private log: Contribution[] = [];
  private keys = new Set<string>();
  private checkins = new Set<string>();
  private results = new Map<string, SeasonResult>();
  constructor(private deps: WarsDeps) {}

  /** Records a contribution. Replays (same key) and over-cap requests add nothing. Returns the points actually granted. */
  award(i: { playerId: string; season: string; day: string; source: WarSource; requested: number; key: string }, nowMs: number): number {
    const campus = this.deps.campusOf(i.playerId);
    if (!campus || !Number.isFinite(i.requested) || i.requested <= 0) return 0;
    const full = `${i.season}:${i.playerId}:${i.key}`;
    if (this.keys.has(full)) return 0;
    const today = this.log.filter((c) => c.season === i.season && c.playerId === i.playerId && c.day === i.day);
    const total = today.reduce((s, c) => s + c.points, 0), src = today.filter((c) => c.source === i.source).reduce((s, c) => s + c.points, 0);
    const points = Math.max(0, Math.min(Math.floor(i.requested), WARS.dailyPlayerCap - total, WARS.sourceCaps[i.source] - src));
    if (points === 0) return 0;
    this.keys.add(full);
    this.log.push(Object.freeze({ id: randomUUID(), season: i.season, rule: WARS.rule, playerId: i.playerId, campus, source: i.source, points, day: i.day, key: i.key, at: new Date(nowMs).toISOString() }));
    this.deps.dirty();
    return points;
  }

  usedToday(playerId: string, season: string, day: string) {
    const today = this.log.filter((c) => c.season === season && c.playerId === playerId && c.day === day);
    const bySource: Partial<Record<WarSource, number>> = {};
    for (const c of today) bySource[c.source] = (bySource[c.source] ?? 0) + c.points;
    return { total: today.reduce((s, c) => s + c.points, 0), cap: WARS.dailyPlayerCap, bySource };
  }

  leaderboard(season: string): WarEntry[] {
    const per = new Map<string, Map<string, number>>();
    for (const c of this.log) if (c.season === season) { const m = per.get(c.campus) ?? new Map<string, number>(); m.set(c.playerId, (m.get(c.playerId) ?? 0) + c.points); per.set(c.campus, m); }
    return this.deps.campusIds().map((campus) => {
      const m = per.get(campus) ?? new Map<string, number>();
      const totalPoints = [...m.values()].reduce((s, n) => s + n, 0), contributors = m.size;
      return { campus, score: contributors ? Math.round(totalPoints / contributors) : 0, totalPoints, contributors, population: this.deps.population(campus), ranked: contributors >= WARS.minContributors };
    }).sort((a, b) => Number(b.ranked) - Number(a.ranked) || (a.ranked ? b.score - a.score : 0) || b.totalPoints - a.totalPoints || a.campus.localeCompare(b.campus));
  }

  me(playerId: string, season: string, day: string) {
    const campus = this.deps.campusOf(playerId);
    const mine = this.log.filter((c) => c.season === season && c.playerId === playerId);
    const points = mine.reduce((s, c) => s + c.points, 0);
    const bySource: Partial<Record<WarSource, number>> = {};
    for (const c of mine) bySource[c.source] = (bySource[c.source] ?? 0) + c.points;
    const teammates = new Map<string, number>();
    for (const c of this.log) if (c.season === season && c.campus === campus) teammates.set(c.playerId, (teammates.get(c.playerId) ?? 0) + c.points);
    const sorted = [...teammates.values()].sort((a, b) => b - a);
    return { points, bySource, campusRank: points > 0 ? sorted.indexOf(points) + 1 : null, campusContributors: teammates.size, today: this.usedToday(playerId, season, day) };
  }

  hasContributions(season: string): boolean { return this.log.some((c) => c.season === season); }
  /** Season results are frozen the first time a finished season is read; later calls return the same record. */
  snapshotSeason(season: string, nowMs: number): SeasonResult | null {
    const have = this.results.get(season);
    if (have || !this.hasContributions(season)) return have ?? null;
    let rank = 0;
    const standings = this.leaderboard(season).map((e) => ({ ...e, rank: e.ranked ? ++rank : null }));
    const r: SeasonResult = { season, rule: WARS.rule, standings, at: new Date(nowMs).toISOString() };
    this.results.set(season, r); this.deps.dirty();
    return r;
  }
  history(limit = 8): SeasonResult[] { return [...this.results.values()].sort((a, b) => b.season.localeCompare(a.season)).slice(0, limit); }

  /** One check-in per player per event occurrence. */
  checkin(key: string): boolean { if (this.checkins.has(key)) return false; this.checkins.add(key); this.deps.dirty(); return true; }

  toSnapshot(): WarsSnapshot { return { contributions: [...this.log], checkins: [...this.checkins], results: [...this.results.values()] }; }
  restore(s: WarsSnapshot | undefined): void {
    this.log = []; this.keys.clear(); this.checkins.clear(); this.results.clear();
    for (const c of s?.contributions ?? []) { this.log.push(c); this.keys.add(`${c.season}:${c.playerId}:${c.key}`); }
    for (const k of s?.checkins ?? []) this.checkins.add(k);
    for (const r of s?.results ?? []) this.results.set(r.season, r);
  }
}
