// Procedural arm gestures for the skinned character (stop palm, reach to pocket, hold out, hand over, inspect, thumbs up, beckon).
// Works on the pose AFTER the clip was sampled: each bone is aimed at a target direction (shortest-arc in world space), so it does not
// depend on the rig's local axis conventions. Pure and strict-typed; covered by gesture-pose.test.ts against the real GLB.
import { worldMatrices, type Pose, type SkinnedModel } from "./skinned-glb";

export type GestureKind = "stop" | "reach" | "hold" | "give" | "take" | "inspect" | "thumbs" | "beckon" | "wave";
type V = [number, number, number];
/** Directions in body space as [outward(from the shoulder's own side), up, forward]. */
const SPEC: Record<GestureKind, { upper: V; fore: V }> = {
  stop: { upper: [0.18, -0.62, 0.55], fore: [0.02, 0.35, 0.94] }, // 'greeting': relaxed open hand offered at chest height, never a raised palm
  reach: { upper: [0.1, -0.97, -0.15], fore: [-0.25, -0.8, 0.5] },
  hold: { upper: [0.2, -0.55, 0.75], fore: [-0.08, 0.1, 0.99] },
  give: { upper: [0.1, -0.2, 0.95], fore: [0, 0.05, 1] },
  take: { upper: [0.12, -0.3, 0.92], fore: [-0.05, 0.02, 1] },
  inspect: { upper: [0.3, -0.75, 0.4], fore: [-0.35, 0.65, 0.65] },
  thumbs: { upper: [0.38, -0.68, 0.5], fore: [0.22, 0.5, 0.84] },
  beckon: { upper: [0.45, -0.5, 0.7], fore: [-0.3, 0.2, 0.9] },
  wave: { upper: [0.55, 0.1, 0.35], fore: [0.1, 0.92, 0.25] }, // friendly hand raised at shoulder height, gentle sway
};
const norm = (v: V): V => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
type Q = [number, number, number, number];
const qmul = (a: Q, b: Q): Q => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
const qconj = (a: Q): Q => [-a[0], -a[1], -a[2], a[3]];
function fromTo(a: V, b: V): Q {
  const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  if (d > 0.999999) return [0, 0, 0, 1];
  if (d < -0.999999) { const ax: V = Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]; const c: V = [a[1] * ax[2] - a[2] * ax[1], a[2] * ax[0] - a[0] * ax[2], a[0] * ax[1] - a[1] * ax[0]]; const n = norm(c); return [n[0], n[1], n[2], 0]; }
  const c: V = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const q: Q = [c[0], c[1], c[2], 1 + d]; const l = Math.hypot(q[0], q[1], q[2], q[3]); return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}
function slerp(a: Q, b: Q, k: number): Q {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]; const bb: Q = d < 0 ? [-b[0], -b[1], -b[2], -b[3]] : b; d = Math.abs(d);
  let ka = 1 - k, kb = k; if (d < 0.9995) { const th = Math.acos(d), s = Math.sin(th); ka = Math.sin((1 - k) * th) / s; kb = Math.sin(k * th) / s; }
  const o: Q = [a[0] * ka + bb[0] * kb, a[1] * ka + bb[1] * kb, a[2] * ka + bb[2] * kb, a[3] * ka + bb[3] * kb]; const l = Math.hypot(...o) || 1; return [o[0] / l, o[1] / l, o[2] / l, o[3] / l];
}
const getQ = (p: Pose, i: number): Q => [p.r[i * 4]!, p.r[i * 4 + 1]!, p.r[i * 4 + 2]!, p.r[i * 4 + 3]!];

export interface GestureRig { upper: number; fore: number; hand: number; parent: number; side: number; world: Float32Array; wq: Q[] }
const rigCache = new WeakMap<SkinnedModel, Map<"R" | "L", GestureRig>>();
/** Resolves the arm joints once per model. `side` is the sign of the model-space x axis that points outward from that arm. */
export function armRig(m: SkinnedModel, arm: "R" | "L"): GestureRig | null {
  let c = rigCache.get(m); if (!c) { c = new Map(); rigCache.set(m, c); }
  const hit = c.get(arm); if (hit) return hit;
  const upper = m.jointNames.indexOf(`upper_arm.${arm}`), fore = m.jointNames.indexOf(`forearm.${arm}`), hand = m.jointNames.indexOf(`hand.${arm}`);
  if (upper < 0 || fore < 0 || hand < 0) return null;
  const world = new Float32Array(m.jointCount * 16); worldMatrices(m, newRest(m), world);
  const side = world[hand * 16 + 12]! >= 0 ? 1 : -1; // rest pose: hand lies out to this side
  const rig: GestureRig = { upper, fore, hand, parent: m.parents[upper]!, side, world: new Float32Array(m.jointCount * 16), wq: new Array(m.jointCount) };
  c.set(arm, rig); return rig;
}
const newRest = (m: SkinnedModel): Pose => ({ t: new Float32Array(m.restT), r: new Float32Array(m.restR), s: new Float32Array(m.restS) });

function worldQuats(m: SkinnedModel, pose: Pose, out: Q[]) { for (let i = 0; i < m.jointCount; i++) { const l = getQ(pose, i), p = m.parents[i]!; out[i] = p < 0 ? l : qmul(out[p]!, l); } }
const pos = (w: Float32Array, j: number): V => [w[j * 16 + 12]!, w[j * 16 + 13]!, w[j * 16 + 14]!];

/** Blends the chosen arm toward the gesture. `w` 0..1. `time` animates beckon. Mutates `pose`. */
export function applyGesture(m: SkinnedModel, pose: Pose, kind: GestureKind, w: number, time = 0, arm: "R" | "L" = "R"): boolean {
  const rig = armRig(m, arm); if (!rig || w <= 0.001) return !!rig;
  const sp = SPEC[kind], k = Math.min(1, w), outward = rig.side * (arm === "R" ? 1 : -1) * (arm === "R" ? 1 : 1);
  const bodyDir = (v: V): V => norm([v[0] * outward, v[1], v[2]]);
  let fore = sp.fore; if (kind === "beckon") fore = [fore[0] + 0.5 * Math.sin(time * 6.5), fore[1] + 0.25 * Math.sin(time * 6.5 + 1), fore[2]];
  else if (kind === "wave") fore = [fore[0] + 0.38 * Math.sin(time * 7), fore[1], fore[2]];
  const aim = (joint: number, child: number, want: V) => {
    worldMatrices(m, pose, rig.world); worldQuats(m, pose, rig.wq);
    const a = pos(rig.world, joint), b = pos(rig.world, child), cur = norm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
    const q = fromTo(cur, want), nw = qmul(q, rig.wq[joint]!), p = m.parents[joint]!, pw = p < 0 ? ([0, 0, 0, 1] as Q) : rig.wq[p]!;
    const local = qmul(qconj(pw), nw), old = getQ(pose, joint), res = slerp(old, local, k);
    pose.r[joint * 4] = res[0]; pose.r[joint * 4 + 1] = res[1]; pose.r[joint * 4 + 2] = res[2]; pose.r[joint * 4 + 3] = res[3];
  };
  aim(rig.upper, rig.fore, bodyDir(sp.upper));
  aim(rig.fore, rig.hand, bodyDir(fore));
  return true;
}
/** Model-space position of a named joint in `pose`. */
export function jointModelPos(m: SkinnedModel, pose: Pose, name: string, scratch = new Float32Array(m.jointCount * 16)): V | null {
  const j = m.jointNames.indexOf(name); if (j < 0) return null; worldMatrices(m, pose, scratch); return pos(scratch, j);
}
