/* Collision-aware orbit camera solver (pure, unit-tested; no GL). Visual only: never affects server authority.
 * yaw rotates around the player, pitch tilts it, zoom scales distance. If a building lies between the player and
 * the wanted eye position the camera slides in along the ray so walls never block the view of your avatar. */
export interface CamBox { x: number; y: number; w: number; h: number; height: number }
export interface CamIn { camX: number; camY: number; yaw: number; pitch: number; zoom: number; boxes: readonly CamBox[]; worldW?: number; worldH?: number; scale?: number }
export interface CamOut { eye: [number, number, number]; target: [number, number, number]; clearance: number; wanted: number }
export const DEFAULT_PITCH = Math.atan2(32, Math.hypot(22, 27));
export const PITCH_MIN = 0.32, PITCH_MAX = 1.25, ZOOM_MIN = 0.55, ZOOM_MAX = 1.6;
const BASE_DIST = Math.hypot(22, 27, 32), BASE_H = Math.hypot(22, 27);
export const clampPitch = (p: number) => Math.max(PITCH_MIN, Math.min(PITCH_MAX, Number.isFinite(p) ? p : DEFAULT_PITCH));
export const clampZoom = (z: number) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Number.isFinite(z) ? z : 1));
const blocked = (x: number, y: number, z: number, boxes: readonly CamBox[]) => {
  if (y < 0.7) return true; // never dip under the ground plane
  for (const b of boxes) if (x > b.x - 0.3 && x < b.x + b.w + 0.3 && z > b.y - 0.3 && z < b.y + b.h + 0.3 && y < b.height + 0.4) return true;
  return false;
};
export function solveOrbitCamera(i: CamIn): CamOut {
  const yaw = Number.isFinite(i.yaw) ? i.yaw : 0, pitch = clampPitch(i.pitch), zoom = clampZoom(i.zoom);
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const ux = (22 * cy + 27 * sy) / BASE_H, uz = (-22 * sy + 27 * cy) / BASE_H; // horizontal unit vector toward eye
  const wanted = BASE_DIST * zoom * (i.scale ?? 1), hx = Math.cos(pitch) * ux, hz = Math.cos(pitch) * uz, vy = Math.sin(pitch);
  const target: [number, number, number] = [i.camX, 0, i.camY], fy = 1.4; // aim ray from head height
  const pt = (t: number): [number, number, number] => [i.camX + hx * t, fy + vy * t, i.camY + hz * t];
  const minT = wanted * 0.3;
  let t = wanted;
  if (!(blocked(...pt(wanted), i.boxes) === false)) {
    let lo = minT, hi = wanted; // binary search the furthest free distance along the ray
    for (let k = 0; k < 12; k++) { const m = (lo + hi) / 2; if (blocked(...pt(m), i.boxes)) hi = m; else lo = m; }
    t = lo;
  } else {
    for (let s = 1; s <= 16; s++) { const m = wanted * s / 16; if (blocked(...pt(m), i.boxes)) { let lo = minT, hi = m; for (let k = 0; k < 10; k++) { const q = (lo + hi) / 2; if (blocked(...pt(q), i.boxes)) hi = q; else lo = q; } t = Math.max(minT, lo); break; } }
  }
  const e = pt(t);
  if (i.worldW) e[0] = Math.max(-20, Math.min(i.worldW + 20, e[0]));
  if (i.worldH) e[2] = Math.max(-20, Math.min(i.worldH + 20, e[2]));
  return { eye: e, target, clearance: t / wanted, wanted };
}

/* ---------- Walk cameras: first-person (eye height) and close chase. Visual only; the server never sees them. ----------
 * heading: radians, forward on the ground plane is (sin h, cos h) in (x, z). Increasing heading turns LEFT.
 * look pitch: radians, positive looks up. */
export const FP_EYE = 1.62, FP_FOV = 1.2 /* ~69deg vertical */, LOOK_MAX = 1.25;
export const clampLook = (p: number) => Math.max(-LOOK_MAX, Math.min(LOOK_MAX, Number.isFinite(p) ? p : 0));
export const wrapHeading = (h: number) => { const t = Number.isFinite(h) ? h : 0; return Math.atan2(Math.sin(t), Math.cos(t)); };
/** Unit ground-plane vectors for a heading. Right is the screen-right of a right-handed lookAt (y up). */
export const headingForward = (h: number): [number, number] => [Math.sin(h), Math.cos(h)];
export const headingRight = (h: number): [number, number] => [-Math.cos(h), Math.sin(h)];
export interface WalkIn { x: number; y: number; heading: number; look: number; bob?: number; boxes?: readonly CamBox[] }

export function solveFirstPersonCamera(i: WalkIn): CamOut {
  const h = Number.isFinite(i.heading) ? i.heading : 0, p = clampLook(i.look), cp = Math.cos(p);
  const eye: [number, number, number] = [i.x, FP_EYE + (Number.isFinite(i.bob) ? (i.bob as number) : 0), i.y];
  const target: [number, number, number] = [eye[0] + Math.sin(h) * cp * 10, eye[1] + Math.sin(p) * 10, eye[2] + Math.cos(h) * cp * 10];
  return { eye, target, clearance: 1, wanted: 0 };
}

/** Over-the-shoulder chase view: behind the avatar, aimed where the avatar looks; slides in when a wall is behind. */
export function solveChaseCamera(i: WalkIn & { dist?: number }): CamOut {
  const h = Number.isFinite(i.heading) ? i.heading : 0, p = clampLook(i.look) * 0.8, cp = Math.cos(p), wanted = i.dist ?? 4.3;
  const head: [number, number, number] = [i.x, 1.75, i.y];
  const dir: [number, number, number] = [-Math.sin(h) * cp, -Math.sin(p) + 0.2, -Math.cos(h) * cp];
  const dl = Math.hypot(...dir) || 1, u = [dir[0] / dl, dir[1] / dl, dir[2] / dl];
  const at = (t: number): [number, number, number] => [head[0] + u[0] * t, head[1] + u[1] * t, head[2] + u[2] * t];
  const boxes = i.boxes ?? [];
  const free = (t: number) => { const q = at(t); return q[1] > 0.5 && !blocked(q[0], q[1], q[2], boxes); };
  let t = wanted;
  if (!free(wanted)) { let lo = 0.4, hi = wanted; for (let k = 0; k < 10; k++) { const m = (lo + hi) / 2; if (free(m)) lo = m; else hi = m; } t = lo; }
  const eye = at(t);
  const target: [number, number, number] = [i.x + Math.sin(h) * 6, 1.15 + Math.sin(clampLook(i.look)) * 3, i.y + Math.cos(h) * 6];
  return { eye, target, clearance: t / wanted, wanted };
}
