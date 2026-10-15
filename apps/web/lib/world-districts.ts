/* CAMPUS district dressing (static, decorative, visual only).
 * Generic architecture for zones that have no bespoke function in world-architecture.ts: row walkways, door aprons and
 * awnings coloured by room kind, a spine promenade with lamps, edge trees, a central plaza and, where a zone has spare
 * land, a small park. Derived entirely from zone data, so adding a district needs no code change.
 * Baked by the renderer into ONE mesh per zone/quality. Pure + dependency-free: unit-testable with a recording stub. */
import type { P, Quality } from "./world-architecture";
import { leafFringe } from "./world-flora";

export interface DistrictBuilding { x: number; y: number; w: number; h: number; height: number; door: { x: number; w: number } | null; kind?: string | undefined }
export interface DistrictZone { id: string; rect: { x: number; y: number; w: number; h: number }; buildings: readonly DistrictBuilding[] }

const KIND_ACCENT: Record<string, string> = {
  classroom: "#3675e7", lab: "#31c4d0", workshop: "#e8a24a", dorm: "#ffd166", office: "#8d98aa", clinic: "#e8644a",
  shop: "#ff8fb3", canteen: "#e8644a", studio: "#a15cff", gym: "#3f8844", lounge: "#74b050", hall: "#1f3a6e",
};
const GREENS = ["#2a8653", "#3f8844", "#277a5b", "#4d9f55"];
const rnd = (a: number, b: number) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
const STONE = "#d9ccae", STONE_LT = "#e6dcc2", PAVE = "#cdbf9d", ROAD = "#7d8a78", LANE = "#ffd166";

function tree(p: P, x: number, z: number, s: number) {
  p.cyl(x, z, .3 * s, 1.5 * s, "#6d4a2e");
  const g = GREENS[Math.floor(rnd(x, z) * GREENS.length)]!;
  p.sph(x, 2.1 * s, z, 2.2 * s, 1.9 * s, 2.2 * s, g);
  leafFringe(p, x, 2.1 * s, z, 1.1 * s, .95 * s, 1.1 * s, g, 54, x * 3 + z);
}
function lamp(p: P, x: number, z: number) {
  p.cyl(x, z, .14, 3, "#4a5468"); p.box(x - .3, z - .05, .6, .1, .08, "#4a5468", 3);
  (p.lsph ?? p.sph).call(p, x, 3.15, z, .34, .22, .34, "#fff1c4");
}
function bench(p: P, x: number, z: number) {
  p.box(x, z, 1.5, .45, .08, "#916239", .45); p.box(x + .1, z, .12, .45, .45, "#6d4a2e"); p.box(x + 1.28, z, .12, .45, .45, "#6d4a2e"); p.box(x, z + .4, 1.5, .06, .4, "#916239", .5);
}

export function buildDistrict(zone: DistrictZone, q: Quality, p: P): void {
  const { x, y, w, h } = zone.rect, cx = x + w / 2, bs = zone.buildings;
  const lowQ = q === "low";
  if (!bs.length) { boulevard(p, zone, q); return; }
  const minY = Math.min(...bs.map((b) => b.y)), maxB = Math.max(...bs.map((b) => b.y + b.h));
  // spine promenade + row walkways (slabs sit just above the zone floor)
  p.box(cx - 2.2, y + 1, 4.4, h - 2, .06, STONE_LT);
  const rows = [...new Set(bs.map((b) => b.y + b.h))].sort((a, b) => a - b);
  for (const ry of rows) p.box(x + .5, ry, w - 1, 4, .05, STONE);
  // avenue strip on the zone edge that borders another district (zones <= 45 tall are 2-row blocks of a 2x3 grid)
  if (h <= 45) {
    const top = minY - y >= 5;
    const ay = top ? y : y + h - 5.5;
    p.box(x, ay, w, 5.5, .07, ROAD);
    p.box(x, ay + 2.6, w, .2, .08, LANE, 0);
    if (!lowQ) for (let lx = x + 2; lx < x + w - 1; lx += 4) p.box(lx, ay + 2.55, 1.6, .3, .09, "#f4f1ea");
    if (x === 120 && !top) p.box(116, ay, 4, 5.5, .07, ROAD); // joins the central campus avenue
    if (x === 120 && top) p.box(116, ay, 4, 5.5, .07, ROAD);
  }
  // doors: apron + awning in the kind colour
  for (const b of bs) {
    if (!b.door) continue;
    const ac = KIND_ACCENT[b.kind ?? "office"] ?? "#8d98aa", dx = b.door.x, dw = b.door.w, sz = b.y + b.h;
    p.box(dx - .5, sz, dw + 1, 1.8, .08, PAVE);
    p.box(dx - .3, sz, dw + .6, 1.2, .14, ac, 2.25);
    if (!lowQ) { p.box(dx - .3, sz + 1.05, .1, .1, 2.25, "#4a5468"); p.box(dx + dw + .2, sz + 1.05, .1, .1, 2.25, "#4a5468"); }
    if (b.kind === "hall") { // portico: steps, round columns, entablature (smooth cylinders read as real stone)
      const n = lowQ ? 3 : 5, cz = sz + 1.0;
      p.box(b.x + .6, sz, b.w - 1.2, 2.0, .18, "#e4d4b9"); p.box(b.x + .9, sz + .5, b.w - 1.8, 1.5, .16, "#efe6d4", .18);
      for (let i = 0; i < n; i++) { const cx2 = b.x + 1.6 + i * (b.w - 3.2) / (n - 1); p.cyl(cx2, cz, .62, b.height - .1, "#f4f1ea", .34); p.cyl(cx2, cz, .8, .25, "#d8d2c4", .34); p.cyl(cx2, cz, .8, .25, "#d8d2c4", b.height + .2); }
      p.box(b.x + .8, cz - .5, b.w - 1.6, 1.0, .4, "#f4f1ea", b.height + .45);
    }
    if (q === "high") (p.lbox ?? p.box).call(p, dx + dw / 2 - .8, sz + .02, 1.6, .06, .35, "#fff1c4", 2.62); // lit door sign strip
    if (!lowQ && rnd(b.x, b.y) > .55) p.box(dx + dw + 1.2, sz + .4, .7, .7, .55, "#3f8844"); // planter by the door
  }
  // lamps + benches along the spine, central plaza
  const mid = (minY + maxB) / 2;
  for (let ly = minY + 2; ly < maxB; ly += 9) { lamp(p, cx - 1.9, ly); if (!lowQ) lamp(p, cx + 1.9, ly + 4.5); }
  p.cyl(cx, mid, 6.2, .09, PAVE, 0); p.cyl(cx, mid, 2.2, .5, "#a8e3f6"); p.cyl(cx, mid, 1.2, 1.0, "#e4d4b9");
  if (!lowQ) { bench(p, cx - 4.2, mid - .2); bench(p, cx + 2.7, mid - .2); }
  // edge trees (outer margin only, never on a walkway)
  const step = lowQ ? 9 : 6;
  for (let ty = y + 2; ty < y + h - 2; ty += step) {
    if (h <= 45 && ty > y + h - 8 && minY - y < 5) continue; // keep the avenue edge clear
    if (h <= 45 && ty < y + 8 && minY - y >= 5) continue;
    tree(p, x + .75, ty + rnd(ty, x) * 1.5, .7 + rnd(x, ty) * .3); tree(p, x + w - .75, ty + rnd(x, ty) * 1.5, .7 + rnd(ty, x + 3) * .3);
  }
  // spare land at the south end of a tall zone -> small park (lawn, pond, pavilion, trees)
  const freeTop = maxB + 4 + 1;
  // The tall zones in world-landmarks.ts LAWN_ZONES get a bespoke lawn (drawn by the renderer), not this default park.
  const lawnZone = ["admin_quarter", "research_park", "innovation_village"].includes(zone.id);
  if (!lawnZone && h > 45 && y + h - freeTop >= 12) {
    const py = freeTop + 1, ph = y + h - py - 1.5;
    p.box(x + 2, py, w - 4, ph, .05, "#4aa563");
    p.cyl(x + w * .3, py + ph * .5, Math.min(7, ph - 2), .06, "#4fc3e8");
    p.box(x + w * .62, py + ph * .35, 5, 4, .15, PAVE); for (const [ox, oz] of [[0, 0], [4.7, 0], [0, 3.7], [4.7, 3.7]]) p.box(x + w * .62 + ox, py + ph * .35 + oz, .3, .3, 2.4, "#916239", .15);
    p.box(x + w * .62 - .3, py + ph * .35 - .3, 5.6, 4.6, .2, "#c9724a", 2.55);
    for (let i = 0; i < (lowQ ? 3 : 7); i++) tree(p, x + 4 + rnd(i, x) * (w - 8), py + 1 + rnd(y, i) * (ph - 2), .8 + rnd(i, y) * .4);
    if (!lowQ) { bench(p, x + w * .3 - 3, py + ph * .5 + 4); lamp(p, x + w * .5, py + ph * .5); }
  }
}

/** Tree-lined boulevard for building-free zones (the road out of the main gate). */
function boulevard(p: P, zone: DistrictZone, q: Quality) {
  const { x, y, w, h } = zone.rect, cx = x + w / 2, lowQ = q === "low";
  p.box(cx - 4, y, 8, h, .06, ROAD); p.box(cx - .1, y, .2, h, .08, LANE);
  for (const sx of [cx - 6.2, cx + 4.2]) p.box(sx, y, 2, h, .07, STONE_LT);
  if (!lowQ) for (let ly = y + 1; ly < y + h - 1; ly += 4) p.box(cx - 3.1, ly, .12, 1.8, .09, "#f4f1ea");
  for (let ty = y + 3; ty < y + h - 1; ty += lowQ ? 10 : 6) {
    for (const [tx, k] of [[x + 3, 1], [x + w - 3, 2]] as const) tree(p, tx + rnd(ty, k) * .8, ty, .85 + rnd(ty, k + 7) * .35);
    if (ty % 12 < 6) { lamp(p, cx - 5.6, ty); lamp(p, cx + 5.6, ty + 3); }
  }
  if (!lowQ) for (let ty = y + 10; ty < y + h - 6; ty += 24) { bench(p, cx - 8.4, ty); bench(p, cx + 6.9, ty + 6); }
  // yellow "danfo"-style minibus parked at the kerb (fictional, static)
  p.box(cx + 4.4, y + 22, 1.9, 4.4, 1.3, "#ffd166", .35); p.box(cx + 4.4, y + 22, 1.9, 4.4, .25, "#222831", .7); p.box(cx + 4.45, y + 22.4, 1.8, 3.6, .5, "#8fd3ec", 1.0); p.box(cx + 4.4, y + 22, 1.9, 4.4, .12, "#31c4d0", 1.65);
}
