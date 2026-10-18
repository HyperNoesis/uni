// Flagship campus layout (Phase 3): buildings with enterable interiors, solid props, ambient NPCs and
// quality profiles. Pure data + pure functions, shared by the realtime server (collision authority) and
// the web client (rendering and local prediction). No dependencies.
import type { Avatar } from "./avatar";
import { WORLD, ZONE_DEFS, type ZoneId } from "./world";

export interface Rect { x: number; y: number; w: number; h: number }
export type SolidKind = "wall" | "tree" | "palm" | "fountain" | "shelf" | "counter" | "pillar" | "bench" | "stage" | "block";
export interface Solid extends Rect { kind: SolidKind }

export interface Building extends Rect {
  id: string;
  name: string;
  zoneId: ZoneId;
  /** Door gap on the south wall: x range [doorX, doorX + doorW]. Null = decorative block with no entrance. */
  door: { x: number; w: number } | null;
  color: string;
  /** Visual wall height in world units (2.5D extrusion). */
  height: number;
  /** Room type for generic interiors (optional). */
  kind?: string;
}

export const WALL = 0.8;
export const PLAYER_RADIUS = 0.45;

export const BUILDINGS: readonly Building[] = ZONE_DEFS.flatMap((z) => z.buildings.map((b) => ({ ...b, zoneId: z.id })));

/** Four wall segments; the south wall is split around the door. */
export function buildingWalls(b: Building): Solid[] {
  const s: Solid[] = [
    { kind: "wall", x: b.x, y: b.y, w: b.w, h: WALL },
    { kind: "wall", x: b.x, y: b.y, w: WALL, h: b.h },
    { kind: "wall", x: b.x + b.w - WALL, y: b.y, w: WALL, h: b.h },
  ];
  const sy = b.y + b.h - WALL;
  if (!b.door) s.push({ kind: "wall", x: b.x, y: sy, w: b.w, h: WALL });
  else {
    s.push({ kind: "wall", x: b.x, y: sy, w: b.door.x - b.x, h: WALL });
    s.push({ kind: "wall", x: b.door.x + b.door.w, y: sy, w: b.x + b.w - (b.door.x + b.door.w), h: WALL });
  }
  return s;
}

const PROPS: readonly Solid[] = ZONE_DEFS.flatMap((z) => z.props);

export const SOLIDS: readonly Solid[] = [...BUILDINGS.flatMap(buildingWalls), ...PROPS];

/** Circle-vs-rect test used for server collision authority and client prediction. */
export function collides(x: number, y: number, r = PLAYER_RADIUS, solids: readonly Solid[] = SOLIDS): boolean {
  for (const s of solids) {
    const cx = Math.min(s.x + s.w, Math.max(s.x, x));
    const cy = Math.min(s.y + s.h, Math.max(s.y, y));
    if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) return true;
  }
  return false;
}
export const isBlocked = (x: number, y: number): boolean => collides(x, y);

/** Axis-separated slide so players glide along walls instead of sticking. */
export function slideMove(x: number, y: number, nx: number, ny: number, extra?: (x: number, y: number) => boolean): { x: number; y: number } {
  const cx = Math.min(WORLD.width, Math.max(0, nx));
  const cy = Math.min(WORLD.height, Math.max(0, ny));
  const hit = (px: number, py: number) => collides(px, py) || (extra?.(px, py) ?? false);
  if (!hit(cx, cy)) return { x: cx, y: cy };
  if (!hit(cx, y)) return { x: cx, y };
  if (!hit(x, cy)) return { x, y: cy };
  return { x, y };
}

export function buildingAt(x: number, y: number): Building | undefined {
  return BUILDINGS.find((b) => x > b.x + WALL && x < b.x + b.w - WALL && y > b.y + WALL && y < b.y + b.h - WALL);
}

// ---- Ambient NPCs: deterministic loops, computed from the clock so no network sync is needed ----
export interface AmbientNpc {
  id: string;
  name: string;
  outfit: Avatar["outfit"];
  skin: Avatar["skin"];
  speed: number; // units per second
  pauseMs: number; // idle at each waypoint
  path: readonly { x: number; y: number }[];
}

export const AMBIENT_NPCS: readonly AmbientNpc[] = ZONE_DEFS.flatMap((z) => z.npcs) as readonly AmbientNpc[];

/** Position of an NPC at wall-clock time `tMs`. Pure and deterministic, so server and clients agree. */
export function npcAt(n: AmbientNpc, tMs: number): { x: number; y: number; moving: boolean } {
  const pts = n.path.length > 1 && n.path.length > 2 ? [...n.path, n.path[0]!] : [...n.path, ...n.path.slice(0, -1).reverse()];
  const legs: { a: { x: number; y: number }; b: { x: number; y: number }; ms: number }[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!, b = pts[i + 1]!;
    legs.push({ a, b, ms: (Math.hypot(b.x - a.x, b.y - a.y) / n.speed) * 1000 });
  }
  const cycle = legs.reduce((s, l) => s + l.ms + n.pauseMs, 0);
  let t = ((tMs % cycle) + cycle) % cycle;
  for (const l of legs) {
    if (t < l.ms) { const k = t / l.ms; return { x: l.a.x + (l.b.x - l.a.x) * k, y: l.a.y + (l.b.y - l.a.y) * k, moving: true }; }
    t -= l.ms;
    if (t < n.pauseMs) return { x: l.b.x, y: l.b.y, moving: false };
    t -= n.pauseMs;
  }
  return { x: pts[0]!.x, y: pts[0]!.y, moving: false };
}

// ---- Quality profiles (low-end Android first) ----
export type QualityLevel = "low" | "medium" | "high";
export interface QualityProfile { dprCap: number; npcs: number; shadows: boolean; detail: boolean; targetFps: number }
export const QUALITY_PROFILES: Record<QualityLevel, QualityProfile> = {
  low: { dprCap: 1, npcs: 3, shadows: false, detail: false, targetFps: 30 },
  medium: { dprCap: 1.5, npcs: 6, shadows: true, detail: false, targetFps: 60 },
  high: { dprCap: 2, npcs: 8, shadows: true, detail: true, targetFps: 60 },
};
/** Suggests a starting level from coarse device hints. Callers may also downgrade at runtime when frames run long. */
export function suggestQuality(hint: { cores?: number; memoryGb?: number; saveData?: boolean }): QualityLevel {
  if (hint.saveData || (hint.memoryGb !== undefined && hint.memoryGb <= 2) || (hint.cores !== undefined && hint.cores <= 4)) return "low";
  if ((hint.memoryGb !== undefined && hint.memoryGb <= 4) || (hint.cores !== undefined && hint.cores <= 6)) return "medium";
  return "high";
}
export const DOWNGRADE: Record<QualityLevel, QualityLevel> = { high: "medium", medium: "low", low: "low" };

const BENCHES: readonly Solid[] = SOLIDS.filter((s) => s.kind === "bench");
/** Distance from a point to the nearest bench edge (tiles); Infinity if none. Used for the server-validated Sit action. */
export function benchDistance(x: number, y: number): number {
  let best = Infinity;
  for (const b of BENCHES) {
    const dx = Math.max(b.x - x, 0, x - (b.x + b.w)), dy = Math.max(b.y - y, 0, y - (b.y + b.h));
    best = Math.min(best, Math.hypot(dx, dy));
  }
  return best;
}
export const SIT_RANGE = 2.2;
export function canSit(x: number, y: number): boolean { return benchDistance(x, y) <= SIT_RANGE; }
