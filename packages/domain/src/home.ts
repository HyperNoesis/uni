import type { CampusKey } from "./campuses";
import { getItem, itemAllowedFor, type ItemDef } from "./items";
export const ROOM = { cols: 10, rows: 8, maxItems: 24, door: { x: 4, w: 2, clearRows: 2 } } as const;
export const WALL_THEMES = ["#2a3b6e", "#3d2f5e", "#1f5a4d", "#7a3b3b", "#4a4f5c"] as const;
export const FLOOR_THEMES = ["wood", "tile", "concrete"] as const;
export type Rotation = 0 | 1 | 2 | 3;
export interface PlacedItem { itemId: string; x: number; y: number; rot: Rotation }
export interface HomeLayout { theme: { wall: (typeof WALL_THEMES)[number]; floor: (typeof FLOOR_THEMES)[number] }; items: PlacedItem[] }
export type LayoutErrorCode = "too_many_items" | "unknown_item" | "campus_locked" | "not_owned" | "bad_rotation" | "out_of_bounds" | "wall_row" | "overlap" | "blocks_door" | "bad_theme";
export interface LayoutError { code: LayoutErrorCode; index: number; message: string }
export type LayoutResult = { ok: true } | { ok: false; errors: LayoutError[] };

export const footprint = (d: Pick<ItemDef, "w" | "h">, rot: Rotation) => (rot % 2 === 0 ? { w: d.w, h: d.h } : { w: d.h, h: d.w });
const inDoor = (x: number, y: number) => x >= ROOM.door.x && x < ROOM.door.x + ROOM.door.w && y >= ROOM.rows - ROOM.door.clearRows;
export function ownedCounts(entries: readonly { itemId: string; qty: number }[]): Record<string, number> {
  const o: Record<string, number> = {};
  for (const e of entries) o[e.itemId] = (o[e.itemId] ?? 0) + e.qty;
  return o;
}

/** Single source of truth for a legal room; the server runs it on every save, the client for instant feedback. */
export function validateLayout(layout: HomeLayout, owned: Readonly<Record<string, number>>, campus: CampusKey): LayoutResult {
  const errors: LayoutError[] = [];
  const err = (code: LayoutErrorCode, index: number, message: string) => void errors.push({ code, index, message });
  if (!(WALL_THEMES as readonly string[]).includes(layout.theme.wall) || !(FLOOR_THEMES as readonly string[]).includes(layout.theme.floor)) err("bad_theme", -1, "That wall or floor style is not available.");
  if (layout.items.length > ROOM.maxItems) err("too_many_items", -1, `A room holds at most ${ROOM.maxItems} items.`);
  const used: Record<string, number> = {};
  const grid = { floor: Array.from({ length: ROOM.rows }, () => Array<boolean>(ROOM.cols).fill(false)), object: Array.from({ length: ROOM.rows }, () => Array<boolean>(ROOM.cols).fill(false)), wall: [Array<boolean>(ROOM.cols).fill(false)] };
  layout.items.forEach((p, index) => {
    const d = getItem(p.itemId);
    if (!d) return err("unknown_item", index, "That item does not exist.");
    if (!itemAllowedFor(d, campus)) return err("campus_locked", index, `${d.name} belongs to another campus.`);
    used[p.itemId] = (used[p.itemId] ?? 0) + 1;
    if (used[p.itemId]! > (owned[p.itemId] ?? 0)) return err("not_owned", index, `You do not own enough ${d.name}.`);
    if (![0, 1, 2, 3].includes(p.rot)) return err("bad_rotation", index, "Invalid rotation.");
    if (!Number.isInteger(p.x) || !Number.isInteger(p.y)) return err("out_of_bounds", index, "Items snap to tiles.");
    if (d.layer === "wall") {
      if (p.rot !== 0) return err("bad_rotation", index, "Wall items cannot be rotated.");
      if (p.y !== 0) return err("wall_row", index, "Wall items hang on the wall.");
      if (p.x < 0 || p.x + d.w > ROOM.cols) return err("out_of_bounds", index, "That does not fit on the wall.");
      for (let dx = 0; dx < d.w; dx++) if (grid.wall[0]![p.x + dx]) return err("overlap", index, `${d.name} overlaps another wall item.`);
      for (let dx = 0; dx < d.w; dx++) grid.wall[0]![p.x + dx] = true;
      return;
    }
    const fp = footprint(d, p.rot);
    if (p.x < 0 || p.y < 0 || p.x + fp.w > ROOM.cols || p.y + fp.h > ROOM.rows) return err("out_of_bounds", index, `${d.name} does not fit there.`);
    const g = grid[d.layer];
    for (let dy = 0; dy < fp.h; dy++) for (let dx = 0; dx < fp.w; dx++) {
      if (g[p.y + dy]![p.x + dx]) return err("overlap", index, `${d.name} overlaps another item.`);
      if (d.layer === "object" && inDoor(p.x + dx, p.y + dy)) return err("blocks_door", index, "Keep the entrance clear.");
    }
    for (let dy = 0; dy < fp.h; dy++) for (let dx = 0; dx < fp.w; dx++) g[p.y + dy]![p.x + dx] = true;
  });
  return errors.length ? { ok: false, errors } : { ok: true };
}

/** Topmost floor-plane item covering a tile (objects over rugs), or -1. */
export function itemIndexAt(l: HomeLayout, x: number, y: number): number {
  let rug = -1;
  for (let k = l.items.length - 1; k >= 0; k--) {
    const p = l.items[k]!, d = getItem(p.itemId);
    if (!d || d.layer === "wall") continue;
    const fp = footprint(d, p.rot);
    if (x >= p.x && x < p.x + fp.w && y >= p.y && y < p.y + fp.h) { if (d.layer === "object") return k; if (rug < 0) rug = k; }
  }
  return rug;
}
export function wallIndexAt(l: HomeLayout, x: number): number {
  for (let k = l.items.length - 1; k >= 0; k--) { const d = getItem(l.items[k]!.itemId); if (d?.layer === "wall" && x >= l.items[k]!.x && x < l.items[k]!.x + d.w) return k; }
  return -1;
}
export const layoutsEqual = (a: HomeLayout, b: HomeLayout) =>
  a.theme.wall === b.theme.wall && a.theme.floor === b.theme.floor && a.items.length === b.items.length &&
  a.items.every((p, k) => p.itemId === b.items[k]!.itemId && p.x === b.items[k]!.x && p.y === b.items[k]!.y && p.rot === b.items[k]!.rot);

export const defaultLayout = (campus: CampusKey): HomeLayout => ({
  theme: { wall: WALL_THEMES[0], floor: "wood" },
  items: [
    { itemId: "rug_blue", x: 3, y: 3, rot: 0 }, { itemId: "bed_single", x: 0, y: 1, rot: 0 }, { itemId: "bookshelf", x: 2, y: 0, rot: 0 },
    { itemId: "desk", x: 7, y: 0, rot: 0 }, { itemId: "chair", x: 7, y: 1, rot: 0 }, { itemId: "lamp", x: 9, y: 0, rot: 0 },
    { itemId: "plant", x: 9, y: 5, rot: 0 }, { itemId: "poster_study", x: 1, y: 0, rot: 0 }, { itemId: "window", x: 4, y: 0, rot: 0 },
    { itemId: `banner_${campus}`, x: 6, y: 0, rot: 0 },
  ],
});
