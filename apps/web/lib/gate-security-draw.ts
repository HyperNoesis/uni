/* Drawing for the Grand Gate entry check, as renderer primitives (same idiom as the shuttle and the main-gate leaves):
 * closed car gate, pedestrian wicket (animated), Nigeria Police Hilux with flashing beacon, guard/police kit (cap, beret, baton, thumb)
 * and the 3D Campus Pass. Everything goes through the renderer's dynamic batch via the injected `draw`, so there is no extra draw call.
 * Pure geometry + colour: no GL here, which keeps it unit-testable with a recording stub.
 */
import { GATE } from "@campus/domain";

export type Shape = string;
export type DrawFn = (shape: Shape, x: number, y: number, z: number, w: number, h: number, d: number, color: string, vp: unknown, emissive?: number, rot?: number) => void;
export interface Ctx { draw: DrawFn; vp: unknown; q: "low" | "medium" | "high"; time: number }
type V3 = [number, number, number];

const NAVY = "#1f3a6e", GOLD = "#d4a64a", STEEL = "#2a2f3a";
/** Closed car gate (always shut: it is for vehicles) + the pedestrian wicket leaf at opening `open` 0..1. */
export function drawGateLeaves(c: Ctx, open: number): number {
  const { draw, vp, q } = c, Z = GATE.line, cg = GATE.carGate, wk = GATE.wicket, H = cg.height; let n = 0;
  const put = (shape: Shape, x: number, y: number, z: number, w: number, h: number, d: number, col: string, em = 0, rot = 0) => { draw(shape, x, y, z, w, h, d, col, vp, em, rot); n++; };
  const xm = (cg.x0 + cg.x1) / 2, step = q === "low" ? 0.62 : 0.31;
  for (const [x0, x1] of [[cg.x0, xm - 0.04], [xm + 0.04, cg.x1]] as const) {
    const w = x1 - x0, cx = (x0 + x1) / 2;
    put("box", cx, 0.62, Z, w, 1.15, 0.16, NAVY);                  // solid kick panel
    put("box", cx, 0.08, Z, w, 0.16, 0.2, STEEL);                   // bottom rail
    put("box", cx, 1.3, Z, w, 0.14, 0.22, GOLD);                    // gold mid rail
    put("box", cx, 2.9, Z, w, 0.1, 0.18, STEEL);
    put("box", cx, H - 0.08, Z, w, 0.16, 0.22, STEEL);              // top rail
    put("box", cx, H + 0.02, Z, w, 0.06, 0.26, GOLD);
    for (let x = x0 + 0.18; x < x1 - 0.1; x += step) { put("box", x, 2.9, Z, 0.06, 3.2, 0.07, STEEL); if (q !== "low") put("box", x, H + 0.1, Z, 0.09, 0.2, 0.09, GOLD); }
    put("box", x0 + 0.06, H / 2, Z, 0.14, H, 0.2, STEEL); put("box", x1 - 0.06, H / 2, Z, 0.14, H, 0.2, STEEL);
  }
  put("cylinder", xm, 3.0, Z + 0.14, 1.3, 0.05, 1.3, GOLD, 0, 0); put("cylinder", xm, 3.0, Z + 0.17, 1.0, 0.05, 1.0, NAVY);            // crest roundel where the leaves meet
  put("sphere", xm, 3.0, Z + 0.2, 0.34, 0.34, 0.34, "#ffe08a", 1);
  // pedestrian pictogram sign (lit blue panel, white walker) above the wicket: tells you which gate is yours
  const sx = (wk.x0 + wk.x1) / 2, sz = Z + 0.24;
  put("box", sx, 3.45, sz - 0.1, 1.5, 1.0, 0.08, "#2f6bff", 1); put("sphere", sx, 3.78, sz, 0.2, 0.2, 0.2, "#ffffff", 1); put("box", sx, 3.5, sz, 0.2, 0.42, 0.05, "#ffffff", 1);
  put("box", sx - 0.13, 3.14, sz, 0.07, 0.32, 0.05, "#ffffff", 1); put("box", sx + 0.13, 3.14, sz, 0.07, 0.32, 0.05, "#ffffff", 1);
  // two-leaf wicket: one leaf hinged on the pier, one on the tower face; both swing inward (toward the campus) and fold back along the posts, leaving the full opening clear
  const ang = Math.min(1, Math.max(0, open)) * 1.62, W = wk.x1 - wk.x0, L = W / 2 - 0.03, wh = wk.height;
  for (const side of [-1, 1] as const) {
    const hx = side < 0 ? wk.x0 : wk.x1, rot = side < 0 ? -ang : Math.PI + ang, dx = Math.cos(rot), dz = -Math.sin(rot);
    const at = (u: number, y: number, w: number, h: number, d: number, col: string, em = 0) => put("box", hx + dx * u, y, Z + dz * u, w, h, d, col, em, rot);
    at(L / 2, 0.45, L, 0.9, 0.14, NAVY); at(L / 2, 0.06, L, 0.12, 0.18, STEEL); at(L / 2, 1.5, L, 0.1, 0.2, GOLD); at(L / 2, wh - 0.05, L, 0.12, 0.2, STEEL);
    for (let u = 0.16; u < L - 0.08; u += q === "low" ? 0.4 : 0.2) at(u, 1.8, 0.05, 1.8, 0.07, STEEL);
    at(0.05, wh / 2, 0.12, wh, 0.18, STEEL); at(L - 0.05, wh / 2, 0.14, wh, 0.2, GOLD);
  }
  // entry button + status lamp on the pier face (the gate man presses it): amber while shut, green when open
  const bx = GATE.pier.x0 - 0.22; put("box", bx, 1.15, Z + 0.3, 0.16, 0.26, 0.08, STEEL); put("sphere", bx, 1.2, Z + 0.35, 0.09, 0.09, 0.09, open > 0.5 ? "#53e08a" : "#ffb347", 1);
  return n;
}

// ---- Nigeria Police Force Hilux: white body, blue band, black sill + bull bar, caged load bed, roof beacon bar, "POLICE" on the doors ----
const GLYPH: Record<string, string[]> = { P: ["111", "101", "111", "100", "100"], O: ["111", "101", "101", "101", "111"], L: ["100", "100", "100", "100", "111"], I: ["111", "010", "010", "010", "111"], C: ["111", "100", "100", "100", "111"], E: ["111", "100", "111", "100", "111"] };
export interface CarMesh { name: string; size: { w: number; h: number; d: number }; yOffset?: number }
/** The patrol pickup. With the streamed GLB (`mesh`) it is one draw + two blinking lenses; without it, the code-drawn fallback body is used. */
export function drawPoliceCar(c: Ctx, car: { x: number; y: number; rot: number }, mesh?: CarMesh | null): number {
  const { draw, vp, q } = c, cs = Math.cos(car.rot), sn = Math.sin(car.rot); let n = 0;
  if (mesh) {
    draw(mesh.name, car.x, (mesh.yOffset ?? 0) + mesh.size.h / 2, car.y, mesh.size.w, mesh.size.h, mesh.size.d, "#ffffff", vp, 0, car.rot); n++;
    const f = Math.floor(c.time * 3) % 2, lens = (ox: number, col: string, em: number) => { draw("box", car.x + ox * cs + 0.28 * sn, 1.935, car.y - ox * sn + 0.28 * cs, 0.5, 0.07, 0.24, col, vp, em, car.rot); n++; };
    lens(-0.36, f ? "#ff3b3b" : "#6e1414", f ? 1 : 0); lens(0.36, f ? "#16224a" : "#3b7bff", f ? 0 : 1);
    return n;
  }
  const put = (ox: number, y: number, oz: number, w: number, h: number, d: number, col: string, em = 0) => { draw("box", car.x + ox * cs + oz * sn, y, car.y - ox * sn + oz * cs, w, h, d, col, vp, em, car.rot); n++; };
  const WHITE = "#f1f3f6", BLUE = "#1c4fb5", BLACK = "#16181d", GLASS = "#22313f";
  put(0, 0.62, 0, 1.86, 0.62, 5.3, WHITE);                       // body
  put(0, 0.36, 0, 1.9, 0.2, 5.3, BLACK);                          // sill
  for (const s of [-1, 1]) { put(s * 0.94, 0.9, 0.2, 0.04, 0.2, 4.3, BLUE); put(s * 0.94, 0.7, 0.2, 0.04, 0.04, 4.3, "#e9eef7"); }
  put(0, 0.98, 1.85, 1.8, 0.14, 1.3, WHITE);                      // bonnet
  put(0, 1.5, 0.45, 1.82, 0.95, 1.75, WHITE);                     // double cab
  put(0, 2.0, 0.45, 1.8, 0.08, 1.7, WHITE);                       // roof
  for (const s of [-1, 1]) { put(s * 0.92, 1.58, 0.55, 0.04, 0.5, 1.25, GLASS); put(s * 0.92, 1.58, 1.0, 0.045, 0.52, 0.04, WHITE); }
  put(0, 1.58, 1.34, 1.6, 0.5, 0.05, GLASS); put(0, 1.5, -0.42, 1.5, 0.42, 0.04, GLASS);   // windscreen, rear window
  put(0, 0.62, 2.68, 1.7, 0.2, 0.1, BLACK);                       // front bumper
  put(0, 0.7, 2.74, 1.5, 0.08, 0.06, "#cfd6e2"); for (const x of [-0.7, 0, 0.7]) put(x, 0.92, 2.76, 0.07, 0.5, 0.07, BLACK); put(0, 1.15, 2.76, 1.5, 0.07, 0.07, BLACK); // bull bar
  for (const s of [-1, 1]) { put(s * 0.62, 0.78, 2.66, 0.34, 0.16, 0.06, "#fff7cf", 1); put(s * 0.5, 1.0, 2.42, 0.1, 0.12, 0.05, "#ff9d2e", 1); }                                // head + indicator lamps
  // load bed with cage: low walls, steel hoops, mesh roof, bench
  for (const s of [-1, 1]) put(s * 0.9, 0.95, -1.5, 0.06, 0.45, 2.3, WHITE);
  put(0, 0.95, -2.62, 1.84, 0.45, 0.06, WHITE); put(0, 0.7, -1.5, 1.7, 0.08, 2.3, "#3a3f4a"); put(0, 0.92, -1.5, 1.2, 0.1, 0.5, "#5a606c");
  if (q !== "low") for (const s of [-1, 1]) for (let z = -2.55; z <= -0.4; z += 0.43) put(s * 0.9, 1.5, z, 0.05, 1.1, 0.05, BLACK);
  put(0, 2.05, -1.5, 1.9, 0.06, 2.3, BLACK); for (const z of [-2.5, -1.5, -0.5]) put(0, 1.5, z, 1.84, 0.05, 0.05, BLACK);
  for (const s of [-1, 1]) for (const z of [1.65, -1.65]) put(s * 0.92, 0.4, z, 0.3, 0.8, 0.8, "#101216");   // wheels
  // roof beacon bar: red and blue alternate
  const f = Math.floor(c.time * 4) % 2;
  put(-0.38, 2.12, 0.5, 0.7, 0.12, 0.3, f ? "#ff3b3b" : "#7a1515", f ? 1 : 0); put(0.38, 2.12, 0.5, 0.7, 0.12, 0.3, f ? "#14224a" : "#3b7bff", f ? 0 : 1);
  // "POLICE" in white on the blue band, both doors (run-length merged pixels)
  const px = q === "low" ? 0.075 : 0.05;
  for (const side of [-1, 1]) {
    let cur = 1.0; // door runs from z=+1.0 (front) to z=-0.2 (rear); letters read front-to-back when viewed from outside
    for (const ch of "POLICE") {
      const g = GLYPH[ch]!;
      for (let r = 0; r < 5; r++) { let cx = 0; while (cx < 3) { if (g[r]![cx] === "1") { let e = cx; while (e + 1 < 3 && g[r]![e + 1] === "1") e++; const run = e - cx + 1; put(side * 0.97, 1.02 - r * px, side * (cur - (cx + run / 2) * px), 0.02, px, run * px, "#ffffff"); cx = e + 1; } else cx++; } }
      cur -= 4 * px;
    }
  }
  return n;
}

// ---- guard / police kit on top of the skinned body ----
export function drawKit(c: Ctx, kit: "guard" | "police", head: V3, handL: V3 | null, yaw: number, headW = 0.2) {
  const { draw, vp } = c, cy = Math.cos(yaw), sy = Math.sin(yaw), hw = Math.max(0.14, Math.min(0.3, headW));
  const at = (ox: number, oz: number): [number, number] => [head[0] + ox * cy + oz * sy, head[2] - ox * sy + oz * cy]; // head-local -> world
  if (kit === "guard") { // blue peaked cap: crown, gold band, visor
    const [cx, cz] = at(0, -0.02 * hw); draw("sphere", cx, head[1] + hw * 0.46, cz, hw * 1.22, hw * 0.62, hw * 1.28, "#1c3f8f", vp);
    draw("cylinder", cx, head[1] + hw * 0.3, cz, hw * 1.2, hw * 0.1, hw * 1.2, "#d4a64a", vp);
    const [vx, vz] = at(0, hw * 0.66); draw("box", vx, head[1] + hw * 0.3, vz, hw * 0.95, hw * 0.06, hw * 0.5, "#102a63", vp, 0, yaw);
  } else { // black beret with a gold badge
    const [cx, cz] = at(-0.03 * hw, -0.04 * hw); draw("sphere", cx, head[1] + hw * 0.5, cz, hw * 1.4, hw * 0.4, hw * 1.4, "#14161a", vp);
    const [px, pz] = at(0, hw * 0.52); draw("sphere", px, head[1] + hw * 0.5, pz, hw * 0.22, hw * 0.22, hw * 0.12, "#d4a64a", vp);
  }
  if (kit === "guard" && handL) { // baton: a solid black stick held in the left fist, hanging at the side with a lighter tip
    draw("cylinder", handL[0], handL[1] - 0.14, handL[2], 0.04, 0.5, 0.04, "#16181d", vp);
    draw("cylinder", handL[0], handL[1] - 0.4, handL[2], 0.046, 0.06, 0.046, "#d4a64a", vp);
  }
}
export function drawThumb(c: Ctx, hand: V3, skin: string, yaw: number) {
  const { draw, vp } = c; draw("sphere", hand[0], hand[1], hand[2], 0.12, 0.1, 0.12, skin, vp); draw("box", hand[0] + Math.sin(yaw) * 0.0, hand[1] + 0.085, hand[2] + Math.cos(yaw) * 0.0, 0.04, 0.11, 0.045, skin, vp, 0, yaw);
}

// ---- the Campus Pass: a thin, real-sized card (0.20 x 0.125 m) held in a hand. The GLB carries the Rejuvini mark; photo, scan and verified bar are drawn on top. ----
export interface CardMesh { name: string; size: { w: number; h: number; d: number }; yOffset?: number }
export const CARD_W = 0.2, CARD_H = 0.125;
/** `at` = card centre, `yaw` = heading of the card's FRONT normal (the face looks toward heading yaw). Vertical card, long edge horizontal. */
export function drawPass(c: Ctx, at: V3, yaw: number, o: { verified: number; scan: number; skin: string; outfit: string; glow?: number }, mesh?: CardMesh | null) {
  const { draw, vp } = c, cy = Math.cos(yaw), sy = Math.sin(yaw);
  // card-local (u right as seen from the front, v up, w out of the front face) -> world
  const P = (u: number, v: number, w: number, bw: number, bh: number, bd: number, col: string, em = 0) => draw("box", at[0] + u * cy + w * sy, at[1] + v, at[2] - u * sy + w * cy, bw, bh, bd, col, vp, em, yaw);
  if (mesh) draw(mesh.name, at[0], at[1], at[2], CARD_W, CARD_H, 0.006, "#ffffff", vp, 0, yaw); else { P(0, 0, 0, CARD_W, CARD_H, 0.006, "#14224a"); P(0, 0.05, 0.004, CARD_W - 0.01, 0.012, 0.002, GOLD); }
  const f = 0.0045;
  P(0.058, -0.004, f, 0.05, 0.062, 0.0015, o.skin); P(0.058, -0.04, f, 0.05, 0.02, 0.0015, o.outfit); // photo block
  for (let i = 0; i < 12; i++) P(-0.085 + i * 0.0085, -0.049, f, 0.004 + ((i * 7) % 3) * 0.0015, 0.014, 0.0012, "#cfd6e2"); // barcode
  if (o.verified > 0.02) P(-0.02 + 0.045 * o.verified / 2, -0.028, f + 0.0006, 0.045 * o.verified, 0.009, 0.0012, "#4be28a", 1);                      // verified bar grows
  if (o.scan > 0 && o.scan < 1) P(-0.095 + o.scan * 0.19, 0, f + 0.001, 0.004, CARD_H, 0.001, "#aef5ff", 1);                                           // scanner sweep
  if ((o.glow ?? 0) > 0.02) P(0, 0, -0.004, CARD_W + 0.012, CARD_H + 0.012, 0.002, "#8fe8ff", 1);                                                       // faint rim = "ready"
}
