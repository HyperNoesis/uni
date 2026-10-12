import { ROOM, footprint, getItem, type HomeLayout, type ItemDef, type PlacedItem } from "@campus/domain";
type FloorTheme = HomeLayout["theme"]["floor"];
import { roundRect, shade } from "./avatar";

// Canvas renderer and hit-testing for the home room: pure functions of (layout, width). A wall band sits
// above a rows x cols floor; furniture has a darker front face for depth.
export const WALL_ROWS = 1.6;
export interface RoomMetrics { tile: number; width: number; height: number; floorTop: number }
export function roomMetrics(cssWidth: number): RoomMetrics {
  const tile = Math.max(8, Math.floor(cssWidth / ROOM.cols));
  const floorTop = Math.round(tile * WALL_ROWS);
  return { tile, width: tile * ROOM.cols, height: floorTop + tile * ROOM.rows, floorTop };
}
export type Hit = { kind: "floor"; x: number; y: number } | { kind: "wall"; x: number } | { kind: "none" };
export function hitTest(m: RoomMetrics, px: number, py: number): Hit {
  if (px < 0 || py < 0 || px >= m.width || py >= m.height) return { kind: "none" };
  const x = Math.floor(px / m.tile);
  return py < m.floorTop ? { kind: "wall", x } : { kind: "floor", x, y: Math.floor((py - m.floorTop) / m.tile) };
}
const FLOORS: Record<FloorTheme, [string, string]> = { wood: ["#b98a5b", "#a97b4e"], tile: ["#cfd6e6", "#bcc5da"], concrete: ["#8d93a3", "#838a9b"] };

export interface DrawOptions { selected?: number | null; invalid?: ReadonlySet<number>; ghost?: { item: ItemDef; x: number; y: number; rot: 0 | 1 | 2 | 3; ok: boolean } | null; showGrid?: boolean }

export function drawRoom(ctx: CanvasRenderingContext2D, layout: HomeLayout, m: RoomMetrics, o: DrawOptions = {}): void {
  const { tile: t, width: w, floorTop } = m;
  ctx.fillStyle = layout.theme.wall; ctx.fillRect(0, 0, w, floorTop);
  ctx.fillStyle = "rgba(255,255,255,0.06)"; for (let i = 0; i < ROOM.cols; i += 2) ctx.fillRect(i * t, 0, t, floorTop);
  ctx.fillStyle = shade(layout.theme.wall, -0.35); ctx.fillRect(0, floorTop - 6, w, 6);
  const [c1, c2] = FLOORS[layout.theme.floor];
  for (let y = 0; y < ROOM.rows; y++) for (let x = 0; x < ROOM.cols; x++) { ctx.fillStyle = (x + y) % 2 ? c2 : c1; ctx.fillRect(x * t, floorTop + y * t, t, t); }
  if (o.showGrid) {
    ctx.strokeStyle = "rgba(255,255,255,0.18)"; ctx.lineWidth = 1;
    for (let x = 0; x <= ROOM.cols; x++) { ctx.beginPath(); ctx.moveTo(x * t + 0.5, floorTop); ctx.lineTo(x * t + 0.5, m.height); ctx.stroke(); }
    for (let y = 0; y <= ROOM.rows; y++) { ctx.beginPath(); ctx.moveTo(0, floorTop + y * t + 0.5); ctx.lineTo(w, floorTop + y * t + 0.5); ctx.stroke(); }
  }
  ctx.fillStyle = "rgba(0,0,0,0.22)"; roundRect(ctx, ROOM.door.x * t + 4, floorTop + (ROOM.rows - 1) * t + t * 0.55, ROOM.door.w * t - 8, t * 0.35, 6); ctx.fill();

  const all = layout.items.map((p, i) => ({ p, i, d: getItem(p.itemId) })).filter((e): e is { p: PlacedItem; i: number; d: ItemDef } => !!e.d);
  const of = (l: ItemDef["layer"]) => all.filter((e) => e.d.layer === l);
  for (const e of of("wall")) drawItem(ctx, e.d, e.p, m, o, e.i);
  for (const e of of("floor")) drawItem(ctx, e.d, e.p, m, o, e.i);
  for (const e of of("object").sort((a, b) => a.p.y + footprint(a.d, a.p.rot).h - (b.p.y + footprint(b.d, b.p.rot).h))) drawItem(ctx, e.d, e.p, m, o, e.i);

  if (o.ghost) {
    const g = o.ghost, p: PlacedItem = { itemId: g.item.id, x: g.x, y: g.y, rot: g.rot };
    ctx.globalAlpha = 0.65; drawItem(ctx, g.item, p, m, {}, -1); ctx.globalAlpha = 1;
    const r = rectOf(g.item, p, m);
    ctx.strokeStyle = g.ok ? "#4fb286" : "#e8644a"; ctx.lineWidth = 3; ctx.strokeRect(r.x + 1.5, r.y + 1.5, r.w - 3, r.h - 3);
  }
}

function rectOf(d: ItemDef, p: PlacedItem, m: RoomMetrics) {
  if (d.layer === "wall") return { x: p.x * m.tile, y: 0, w: d.w * m.tile, h: m.floorTop };
  const fp = footprint(d, p.rot);
  return { x: p.x * m.tile, y: m.floorTop + p.y * m.tile, w: fp.w * m.tile, h: fp.h * m.tile };
}

function drawItem(ctx: CanvasRenderingContext2D, d: ItemDef, p: PlacedItem, m: RoomMetrics, o: DrawOptions, index: number): void {
  const r = rectOf(d, p, m);
  ctx.save();
  const pad = d.layer === "floor" ? 0 : 3, x = r.x + pad, y = r.y + pad, w = r.w - pad * 2, h = r.h - pad * 2, t = m.tile, c = d.color, a = d.accent;
  const circle = (cx: number, cy: number, rad: number) => { ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.fill(); };
  switch (d.art) {
    case "rug": ctx.fillStyle = c; roundRect(ctx, x + 4, y + 4, w - 8, h - 8, 10); ctx.fill(); ctx.strokeStyle = a; ctx.lineWidth = 3; roundRect(ctx, x + 10, y + 10, w - 20, h - 20, 6); ctx.stroke(); break;
    case "bed": block(ctx, x, y, w, h, "#8a5a3b", t); ctx.fillStyle = c; roundRect(ctx, x + 4, y + h * 0.3, w - 8, h * 0.66 - 4, 6); ctx.fill(); ctx.fillStyle = a; roundRect(ctx, x + 6, y + 6, w - 12, h * 0.2, 6); ctx.fill(); break;
    case "desk": block(ctx, x, y, w, h, c, t); ctx.fillStyle = "#2a3350"; roundRect(ctx, x + w * 0.2, y + 4, w * 0.3, h * 0.45, 3); ctx.fill(); ctx.fillStyle = "#9fd3ff"; ctx.fillRect(x + w * 0.23, y + 6, w * 0.24, h * 0.3); break;
    case "chair": ctx.fillStyle = shade(c, -0.2); roundRect(ctx, x + 6, y + 6, w - 12, h - 8, 8); ctx.fill(); ctx.fillStyle = c; roundRect(ctx, x + 8, y + 8, w - 16, h - 18, 7); ctx.fill(); break;
    case "shelf": { block(ctx, x, y, w, h, c, t); const cs = ["#e8644a", "#2f6bff", "#ffd166", "#4fb286", "#8b6fd6"]; for (let i = 0; i < 6; i++) { ctx.fillStyle = cs[i % 5]!; ctx.fillRect(x + 6 + i * ((w - 12) / 6), y + 6, (w - 12) / 6 - 2, h * 0.45); } break; }
    case "lamp": ctx.fillStyle = "rgba(255,209,102,0.25)"; circle(x + w / 2, y + h / 2, t * 0.62); ctx.fillStyle = a; ctx.fillRect(x + w / 2 - 2, y + h * 0.4, 4, h * 0.5); ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x + w * 0.2, y + h * 0.45); ctx.lineTo(x + w * 0.8, y + h * 0.45); ctx.lineTo(x + w * 0.65, y + h * 0.1); ctx.lineTo(x + w * 0.35, y + h * 0.1); ctx.closePath(); ctx.fill(); break;
    case "neon_lamp": ctx.fillStyle = "rgba(255,95,162,0.28)"; circle(x + w / 2, y + h / 2, t * 0.7); ctx.strokeStyle = c; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x + w / 2, y + h * 0.42, w * 0.26, 0, Math.PI * 2); ctx.stroke(); ctx.strokeStyle = a; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x + w / 2, y + h * 0.42, w * 0.14, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = "#2a3350"; ctx.fillRect(x + w * 0.3, y + h * 0.8, w * 0.4, h * 0.12); break;
    case "plant": ctx.fillStyle = a; roundRect(ctx, x + w * 0.28, y + h * 0.58, w * 0.44, h * 0.34, 4); ctx.fill(); ctx.fillStyle = c; circle(x + w * 0.5, y + h * 0.35, w * 0.22); circle(x + w * 0.32, y + h * 0.45, w * 0.17); circle(x + w * 0.68, y + h * 0.45, w * 0.17); break;
    case "beanbag": ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(x + w / 2, y + h * 0.58, w * 0.42, h * 0.36, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = a; ctx.beginPath(); ctx.ellipse(x + w / 2, y + h * 0.48, w * 0.26, h * 0.18, 0, 0, Math.PI * 2); ctx.fill(); break;
    case "speaker": block(ctx, x + w * 0.1, y, w * 0.8, h, c, t); ctx.fillStyle = a; circle(x + w / 2, y + h * 0.35, w * 0.14); ctx.strokeStyle = a; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x + w / 2, y + h * 0.65, w * 0.2, 0, Math.PI * 2); ctx.stroke(); break;
    case "trophy": block(ctx, x + w * 0.15, y + h * 0.1, w * 0.7, h * 0.85, a, t); ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x + w / 2, y + h * 0.38, w * 0.2, 0, Math.PI); ctx.fill(); ctx.fillRect(x + w / 2 - 2, y + h * 0.5, 4, h * 0.2); ctx.fillRect(x + w * 0.35, y + h * 0.7, w * 0.3, 4); break;
    case "typewriter": block(ctx, x + w * 0.08, y + h * 0.3, w * 0.84, h * 0.6, c, t); ctx.fillStyle = a; ctx.fillRect(x + w * 0.2, y + h * 0.08, w * 0.6, h * 0.28); ctx.fillStyle = "#9fa6b8"; for (let i = 0; i < 4; i++) ctx.fillRect(x + w * 0.18 + i * w * 0.16, y + h * 0.55, w * 0.1, h * 0.12); break;
    case "window": ctx.fillStyle = a; roundRect(ctx, x, y + 8, w, h - 22, 6); ctx.fill(); ctx.fillStyle = c; ctx.fillRect(x + 5, y + 13, w - 10, h - 32); ctx.fillStyle = a; ctx.fillRect(x + w / 2 - 2, y + 13, 4, h - 32); ctx.fillRect(x + 5, y + 8 + (h - 22) / 2, w - 10, 4); break;
    case "poster": ctx.fillStyle = "#f4f7ff"; roundRect(ctx, x + 6, y + 10, w - 12, h - 28, 4); ctx.fill(); ctx.fillStyle = c; ctx.fillRect(x + 10, y + 14, w - 20, (h - 36) * 0.6); ctx.fillStyle = a; ctx.fillRect(x + 10, y + 14 + (h - 36) * 0.68, w - 20, 4); break;
    case "banner": ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x + 8, y + 6); ctx.lineTo(x + w - 8, y + 6); ctx.lineTo(x + w - 8, y + h - 16); ctx.lineTo(x + w / 2, y + h - 26); ctx.lineTo(x + 8, y + h - 16); ctx.closePath(); ctx.fill(); ctx.fillStyle = a; circle(x + w / 2, y + h * 0.36, w * 0.14); break;
  }
  ctx.restore();
  if (o.selected === index) { ctx.save(); ctx.strokeStyle = "#ffd166"; ctx.lineWidth = 3; ctx.setLineDash([6, 4]); ctx.strokeRect(r.x + 1.5, r.y + 1.5, r.w - 3, r.h - 3); ctx.restore(); }
  if (o.invalid?.has(index)) { ctx.save(); ctx.strokeStyle = "#e8644a"; ctx.lineWidth = 3; ctx.strokeRect(r.x + 1.5, r.y + 1.5, r.w - 3, r.h - 3); ctx.restore(); }
}

function block(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, tile: number): void {
  const face = Math.max(4, Math.round(tile * 0.14));
  ctx.fillStyle = shade(color, -0.3); roundRect(ctx, x, y + face, w, h - face, 6); ctx.fill();
  ctx.fillStyle = color; roundRect(ctx, x, y, w, h - face, 6); ctx.fill();
}

/** Square icon of an item for the inventory tray. */
export function drawItemIcon(ctx: CanvasRenderingContext2D, d: ItemDef, size: number): void {
  const w = d.layer === "wall" ? d.w : d.w, h = d.layer === "wall" ? 1 : d.h;
  const tile = size / Math.max(w, h);
  const m: RoomMetrics = { tile, width: size, height: size, floorTop: 0 };
  ctx.save();
  ctx.translate((size - w * tile) / 2, (size - h * tile) / 2);
  drawItem(ctx, d.layer === "wall" ? { ...d, layer: "object" } : d, { itemId: d.id, x: 0, y: 0, rot: 0 }, m, {}, -1);
  ctx.restore();
}
