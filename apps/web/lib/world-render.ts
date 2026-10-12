import {
  BUILDINGS, INTERACTION_POINTS, SOLIDS, WALL, WORLD, ZONES,
  type Avatar, type Building, type QualityProfile, type Solid,
} from "@campus/domain";
import { drawAvatar } from "./avatar";

// 2.5D oblique renderer for the flagship campus. Pure canvas, no assets to download, so the world is playable
// on the first frame. Everything off-screen is culled; roofs fade when the player stands under or behind them.

export interface Entity {
  id: string; name: string; x: number; y: number; avatar: Avatar;
  tagColor: string; emote?: string; npc?: boolean;
}
export interface RenderInput {
  w: number; h: number; scale: number; time: number;
  camX: number; camY: number; meId: string;
  entities: Entity[]; emoji: Record<string, string>;
  quality: QualityProfile;
  /** Currently revealed scavenger-hunt checkpoint, if the player has an active clue. */
  activeHuntPointId?: string | null;
}
export interface RenderStats { drawn: number; culled: number }

const roofAlpha = new Map<string, number>(); // smooth fades survive across frames
const shade = (hex: string, k: number): string => {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + (k >= 0 ? (255 - c) * k : c * k))));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
};

type Item = { base: number; draw: () => void };

export function drawWorld(ctx: CanvasRenderingContext2D, r: RenderInput): RenderStats {
  const { w, h, scale: s, time, quality: q } = r;
  const vx0 = r.camX - w / 2 / s - 4, vx1 = r.camX + w / 2 / s + 4;
  const vy0 = r.camY - h / 2 / s - 6, vy1 = r.camY + h / 2 / s + 4;
  const seen = (x: number, y: number, bw: number, bh: number) => x < vx1 && x + bw > vx0 && y < vy1 && y + bh > vy0;
  let drawn = 0, culled = 0;

  ctx.fillStyle = "#0a1228";
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w / 2 - r.camX * s, h / 2 - r.camY * s);

  // Ground uses low-cost colour variation and a readable campus-path network.
  ctx.fillStyle = "#2f7a55";
  ctx.fillRect(0, 0, WORLD.width * s, WORLD.height * s);
  const light = ctx.createLinearGradient(0, 0, WORLD.width * s, WORLD.height * s);
  light.addColorStop(0, "rgba(126,220,150,.10)");
  light.addColorStop(0.55, "rgba(8,47,39,.015)");
  light.addColorStop(1, "rgba(3,30,34,.20)");
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, WORLD.width * s, WORLD.height * s);
  if (q.detail) {
    ctx.fillStyle = "rgba(255,255,255,.035)";
    for (let gx = Math.max(0, Math.floor(vx0 / 4) * 4); gx < Math.min(WORLD.width, vx1); gx += 4)
      for (let gy = Math.max(0, Math.floor(vy0 / 4) * 4); gy < Math.min(WORLD.height, vy1); gy += 4)
        if (((gx + gy) / 4) % 2 === 0) ctx.fillRect(gx * s, gy * s, 4 * s, 4 * s);
  }
  // Dark curb + warm paving keeps the cross-campus routes legible from any camera position.
  ctx.fillStyle = "#8e9b7f";
  ctx.fillRect(57.5 * s, 4 * s, 5 * s, 76 * s);
  ctx.fillRect(4 * s, 35.5 * s, 112 * s, 5 * s);
  ctx.fillStyle = "#d3c5a1";
  ctx.fillRect(58 * s, 4 * s, 4 * s, 76 * s);
  ctx.fillRect(4 * s, 36 * s, 112 * s, 4 * s);
  // Paving seams add structure without using downloadable textures.
  if (q.detail) {
    ctx.strokeStyle = "rgba(89,83,64,.20)";
    ctx.lineWidth = Math.max(1, s * .035);
    for (let y = 8; y < 80; y += 4) { ctx.beginPath(); ctx.moveTo(58 * s, y * s); ctx.lineTo(62 * s, y * s); ctx.stroke(); }
    for (let x = 8; x < 116; x += 4) { ctx.beginPath(); ctx.moveTo(x * s, 36 * s); ctx.lineTo(x * s, 40 * s); ctx.stroke(); }
  }
  // A paved student-plaza widens the main route around the two activity boards.
  ctx.fillStyle = "rgba(31,49,59,.18)";
  ctx.beginPath(); ctx.ellipse(60 * s, 54 * s + s * .18, 5.6 * s, 4.1 * s, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#b9ad8c";
  ctx.beginPath(); ctx.ellipse(60 * s, 54 * s, 5.4 * s, 3.9 * s, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "rgba(255,248,220,.40)";
  ctx.lineWidth = Math.max(1, s * .08);
  ctx.beginPath(); ctx.ellipse(60 * s, 54 * s, 4.6 * s, 3.2 * s, 0, 0, Math.PI * 2); ctx.stroke();

  for (const z of ZONES) {
    if (!seen(z.x, z.y, z.w, z.h)) { culled++; continue; }
    drawn++;
    ctx.fillStyle = z.color + "33";
    ctx.fillRect(z.x * s, z.y * s, z.w * s, z.h * s);
    ctx.strokeStyle = z.color + "aa";
    ctx.lineWidth = 2;
    ctx.strokeRect(z.x * s, z.y * s, z.w * s, z.h * s);
    ctx.fillStyle = "rgba(255,255,255,.7)";
    ctx.font = `700 ${Math.max(10, s * 0.8)}px system-ui`;
    ctx.fillText(z.name, z.x * s + 8, z.y * s + s * 1.4);
  }

  // building floors and walls (visible when a roof is faded)
  for (const b of BUILDINGS) {
    if (!seen(b.x, b.y - b.height, b.w, b.h + b.height)) { culled++; continue; }
    drawn++;
    ctx.fillStyle = shade(b.color, 0.55);
    ctx.fillRect(b.x * s, b.y * s, b.w * s, b.h * s);
    if (b.door) { ctx.fillStyle = "#f3e7c9"; ctx.fillRect(b.door.x * s, (b.y + b.h - WALL) * s, b.door.w * s, WALL * s); }
  }
  for (const sol of SOLIDS) if (sol.kind === "wall" && seen(sol.x, sol.y, sol.w, sol.h)) {
    ctx.fillStyle = "#3b3552";
    ctx.fillRect(sol.x * s, sol.y * s, sol.w * s, sol.h * s);
  }

  // depth-sorted scene: props, entities and roofs all sort by their southern baseline
  const items: Item[] = [];
  for (const sol of SOLIDS) {
    if (sol.kind === "wall") continue;
    const topPad = sol.kind === "tree" ? 3.2 : 2;
    if (!seen(sol.x, sol.y - topPad, sol.w, sol.h + topPad)) { culled++; continue; }
    items.push({ base: sol.y + sol.h, draw: () => drawProp(ctx, sol, s, q) });
  }
  const me = r.entities.find((e) => e.id === r.meId);
  for (const b of BUILDINGS) {
    if (!seen(b.x, b.y - b.height, b.w, b.h + b.height)) continue;
    const covers = !!me && me.x > b.x - 1 && me.x < b.x + b.w + 1 && me.y > b.y - b.height - 1 && me.y < b.y + b.h + 0.5;
    const cur = roofAlpha.get(b.id) ?? 1;
    const next = cur + ((covers ? 0.22 : 1) - cur) * 0.2;
    roofAlpha.set(b.id, next);
    items.push({ base: b.y + b.h, draw: () => drawRoof(ctx, b, s, next, q) });
  }
  let npcShown = 0;
  for (const e of r.entities) {
    if (e.npc && ++npcShown > q.npcs) continue;
    if (!seen(e.x - 2, e.y - 5, 4, 6)) { culled++; continue; }
    items.push({ base: e.y, draw: () => drawEntity(ctx, e, s, time, e.id === r.meId, r.emoji) });
  }
  items.sort((a, b) => a.base - b.base);
  for (const it of items) { it.draw(); drawn++; }

  // interaction markers: distinct visual language for activities, with hidden hunt checkpoints revealed only by active clues.
  for (const p of INTERACTION_POINTS) {
    if ((p.hidden && p.id !== r.activeHuntPointId) || !seen(p.x - 4, p.y - 3, 8, 5)) continue;
    const pulse = 1 + Math.sin(time * 4) * 0.12;
    ctx.fillStyle = p.activity === "quiz" ? "#58e1dc" : p.activity === "reaction" ? "#ffd166" : p.activity === "hunt" ? "#65c7ff" : "#ffffff";
    ctx.beginPath(); ctx.arc(p.x * s, p.y * s, s * 0.9 * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#1b2540";
    ctx.font = `900 ${s * 0.9}px system-ui`;
    ctx.textAlign = "center";
    ctx.fillText(p.activity === "quiz" ? "Q" : p.activity === "reaction" ? "!" : p.activity === "hunt" ? "H" : "i", p.x * s, p.y * s + s * 0.32);
    ctx.fillStyle = "rgba(11,21,48,.88)";
    ctx.fillRect(p.x * s - 3.4 * s, p.y * s - 2.05 * s, 6.8 * s, 0.95 * s);
    ctx.fillStyle = p.activity === "quiz" ? "#b7fffa" : p.activity === "reaction" ? "#ffe8a8" : p.activity === "hunt" ? "#c9edff" : "#ffffff";
    ctx.font = `800 ${Math.max(8, s * 0.55)}px system-ui`;
    ctx.fillText(p.name.toUpperCase(), p.x * s, p.y * s - 1.36 * s);
    ctx.textAlign = "left";
    drawn++;
  }
  ctx.restore();
  return { drawn, culled };
}

function drawProp(ctx: CanvasRenderingContext2D, p: Solid, s: number, q: QualityProfile): void {
  const x = p.x * s, y = p.y * s, w = p.w * s, h = p.h * s;
  if (q.shadows && p.kind !== "tree") { ctx.fillStyle = "rgba(0,0,0,.2)"; ctx.beginPath(); ctx.ellipse(x + w / 2, y + h, w * 0.7, h * 0.35 + 2, 0, 0, Math.PI * 2); ctx.fill(); }
  switch (p.kind) {
    case "palm":
    case "tree": {
      // Stylised tropical palms fit the campus setting and stay vector-only for fast first paint.
      const cx = x + w / 2;
      const crownY = y - s * 1.35;
      const baseY = y + h * .7;
      if (q.shadows) { ctx.fillStyle = "rgba(0,0,0,.17)"; ctx.beginPath(); ctx.ellipse(cx + s * .25, baseY + s * .1, s * 1.15, s * .34, 0, 0, Math.PI * 2); ctx.fill(); }
      ctx.strokeStyle = "#775035"; ctx.lineWidth = Math.max(2, s * .24); ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(cx, baseY); ctx.quadraticCurveTo(cx + s * .18, y, cx - s * .03, crownY); ctx.stroke();
      ctx.strokeStyle = "#3c9156"; ctx.lineWidth = Math.max(2, s * .22);
      for (let i = 0; i <= 7; i++) {
        const a = Math.PI + i * Math.PI / 7;
        const ex = cx + Math.cos(a) * s * (1.7 + (i % 2) * .18);
        const ey = crownY + Math.sin(a) * s * (1.15 + (i % 3) * .08);
        ctx.beginPath(); ctx.moveTo(cx, crownY); ctx.quadraticCurveTo(cx + Math.cos(a) * s * .75, crownY + Math.sin(a) * s * .5, ex, ey); ctx.stroke();
      }
      ctx.fillStyle = "#57b66b"; ctx.beginPath(); ctx.arc(cx, crownY, Math.max(2, s * .22), 0, Math.PI * 2); ctx.fill();
      ctx.lineCap = "butt";
      break;
    }
    case "fountain":
      ctx.fillStyle = "#9fb0d6"; ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2.4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#4aa3ff"; ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, w / 2.5, h / 3.2, 0, 0, Math.PI * 2); ctx.fill();
      break;
    case "pillar":
      ctx.fillStyle = "#d9d2c0"; ctx.fillRect(x, y - s * 2.4, w, h + s * 2.4);
      ctx.fillStyle = "#2f6bff"; ctx.fillRect(x, y - s * 2.6, w, s * 0.5);
      break;
    case "stage":
      ctx.fillStyle = "#1fb7c9"; ctx.fillRect(x, y - s * 0.8, w, h + s * 0.8);
      ctx.fillStyle = "#0f6f7b"; ctx.fillRect(x, y + h - s * 0.2, w, s * 0.2 + s * 0.4);
      break;
    case "shelf":
      ctx.fillStyle = "#6b4a2b"; ctx.fillRect(x, y - s * 1.2, w, h + s * 1.2);
      ctx.fillStyle = "#c9a36a"; ctx.fillRect(x, y - s * 1.2, w, s * 0.25);
      if (q.detail) { for (let i = 0; i < p.w; i++) { ctx.fillStyle = ["#e8644a", "#2f6bff", "#ffd166", "#4fb286"][i % 4]!; ctx.fillRect(x + i * s + 2, y - s * 0.9, s * 0.6, s * 0.7); } }
      break;
    case "counter":
      ctx.fillStyle = "#c9a36a"; ctx.fillRect(x, y - s * 0.8, w, h + s * 0.8);
      ctx.fillStyle = "#8b6a3d"; ctx.fillRect(x, y + h - s * 0.3, w, s * 0.3);
      break;
    case "bench":
      ctx.fillStyle = "#8b6a3d"; ctx.fillRect(x, y - s * 0.5, w, h + s * 0.5);
      break;
    default:
      ctx.fillStyle = "#777"; ctx.fillRect(x, y, w, h);
  }
}

function drawRoof(ctx: CanvasRenderingContext2D, b: Building, s: number, alpha: number, q: QualityProfile): void {
  const H = b.height * s;
  const x = b.x * s, y = b.y * s, w = b.w * s, h = b.h * s;
  ctx.save();
  ctx.globalAlpha = alpha;
  if (q.shadows && alpha > 0.9) { ctx.fillStyle = "rgba(0,0,0,.18)"; ctx.fillRect(x + 4, y + h, w, s * 0.7); }
  ctx.fillStyle = shade(b.color, -0.28); // front facade
  ctx.fillRect(x, y + h - H, w, H);
  if (b.door) { ctx.fillStyle = "#1b1630"; ctx.fillRect(b.door.x * s, y + h - H * 0.85, b.door.w * s, H * 0.85); }
  if (q.detail) {
    ctx.fillStyle = "rgba(255,236,170,.75)";
    for (let wx = b.x + 1.5; wx < b.x + b.w - 2; wx += 3) {
      if (b.door && wx > b.door.x - 1.5 && wx < b.door.x + b.door.w) continue;
      ctx.fillRect(wx * s, y + h - H * 0.7, s * 1.2, H * 0.4);
    }
  }
  ctx.fillStyle = b.color; // roof (extruded up)
  ctx.fillRect(x, y - H, w, h);
  ctx.fillStyle = shade(b.color, 0.25);
  ctx.fillRect(x, y - H, w, s * 0.5);
  if (alpha > 0.6) {
    ctx.fillStyle = "rgba(255,255,255,.9)";
    ctx.font = `800 ${Math.max(10, s * 0.9)}px system-ui`;
    ctx.textAlign = "center";
    ctx.fillText(b.name, x + w / 2, y - H + h / 2 + s * 0.3);
    ctx.textAlign = "left";
  }
  ctx.restore();
}

function drawEntity(ctx: CanvasRenderingContext2D, e: Entity, s: number, time: number, isMe: boolean, emoji: Record<string, string>): void {
  const bob = Math.sin(time * 6 + e.x) * (isMe ? 0 : 0.6);
  drawAvatar(ctx, e.avatar, e.x * s, e.y * s, s / 14, bob);
  ctx.font = `700 ${Math.max(10, s * (e.npc ? 0.62 : 0.75))}px system-ui`;
  ctx.textAlign = "center";
  const ty = e.y * s - s * 3.7;
  const tw = ctx.measureText(e.name).width + 12;
  ctx.fillStyle = "rgba(11,21,48,.8)";
  ctx.fillRect(e.x * s - tw / 2, ty - s * 0.8, tw, s * 1.15);
  ctx.fillStyle = e.tagColor;
  ctx.fillRect(e.x * s - tw / 2, ty - s * 0.8, 3, s * 1.15);
  ctx.fillStyle = e.npc ? "#c9d4f2" : "#fff";
  ctx.fillText(e.name, e.x * s, ty);
  if (e.emote && e.emote in emoji) { ctx.font = `${s * 1.6}px system-ui`; ctx.fillText(emoji[e.emote]!, e.x * s, ty - s * 1.2); }
  ctx.textAlign = "left";
}
