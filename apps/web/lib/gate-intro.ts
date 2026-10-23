/* Grand Gate intro: the first-view camera move (pure data + math, no DOM, no renderer import).
 * Feed gateIntroCamera(t) into the renderer's free camera (camMode:"free", camEye/camTarget/camFov) for ~INTRO_MS, then hand over to the normal
 * third-person camera at GATE_INTRO_SPAWN. Skippable: call with t=1 / skip on first input. Deterministic. Mirrors scripts/world/preview-grand-gate.py.
 * Coordinates: x, y(up), z in world units; the gate centre is world (60, 132) (domain y == world z); the arrival side faces +z.
 */
export type IntroCam = { eye: [number, number, number]; target: [number, number, number]; fov: number };
export const INTRO_MS = 7000;
/** Recommended spawn for new players: gate forecourt, facing the gate (heading PI faces -z). Not wired into server data. */
export const GATE_INTRO_SPAWN = { x: 60, y: 184, heading: Math.PI } as const;
const KF: Array<{ t: number } & IntroCam> = [
  { t: 0.0, eye: [60, 9, 191.5], target: [60, 15, 132], fov: 70 },    // high and wide at the back of the forecourt: the whole gate on the horizon
  { t: 0.35, eye: [60, 5.5, 190.5], target: [60, 22, 132], fov: 66 }, // sink and tilt up to the crest and lit sign
  { t: 0.7, eye: [60, 3.4, 189.6], target: [60, 12, 140], fov: 62 },  // lower toward the promenade and its medallion
  { t: 1.0, eye: [60, 2.4, 188.4], target: [60, 6.5, 150], fov: 58 }, // settle behind the player (spawn y=184), gate ahead
];
const ss = (x: number) => x * x * (3 - 2 * x);
const mix = (a: number, b: number, u: number) => a + (b - a) * u;
/** aspect = viewport width / height. Portrait phones get a wider vertical FOV so the ~44 m gate still fits the narrow horizontal view. */
export function gateIntroCamera(t: number, aspect = 16 / 9): IntroCam {
  const c = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 1));
  let i = 0; while (i < KF.length - 2 && c > KF[i + 1]!.t) i++;
  const a = KF[i]!, b = KF[i + 1]!, u = ss(Math.min(1, Math.max(0, (c - a.t) / (b.t - a.t))));
  const v = (p: [number, number, number], q: [number, number, number]): [number, number, number] => [mix(p[0], q[0], u), mix(p[1], q[1], u), mix(p[2], q[2], u)];
  const fov = mix(a.fov, b.fov, u), ar = Number.isFinite(aspect) && aspect > 0 ? aspect : 16 / 9, k = Math.max(1, 0.95 / ar);
  const wide = (2 * Math.atan(Math.tan((fov * Math.PI) / 360) * k) * 180) / Math.PI;
  return { eye: v(a.eye, b.eye), target: v(a.target, b.target), fov: Math.min(100, wide) };
}
