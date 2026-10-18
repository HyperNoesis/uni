// Gameplay-facing layer over skinned-glb.ts: loads the shared character, picks an animation clip from the avatar's real
// motion state, cross-fades between clips and emits the skinned body into the renderer's dynamic batch.
// Server-authoritative movement is untouched - this only decides how an already-validated avatar LOOKS.
import { parseSkinnedGlb, newPose, sampleClip, blendPose, skinMatrices, skinToSoup, regionVertexColors, type SkinnedModel, type Pose } from "./skinned-glb";
import { groupsFor, paintKey, paintVertexColors, hairIsPainted } from "./avatar-paint";
import { wardrobeGroups } from "./avatar-wardrobe";
import type { Avatar } from "@campus/domain";

export const CHARACTER_URL = "/assets/characters/campus_m.glb";
export const CHARACTER_LOD_URL = "/assets/characters/campus_m_lod.glb";
/** Realistic textured bodies (scripts/models/build-realistic.py): m = AvatarSDK male, f = MPFB female. Same 22-joint rig, same clips. */
export const CHARACTER_SETS = {
  m: { url: CHARACTER_URL, lod: CHARACTER_LOD_URL },
  f: { url: "/assets/characters/campus_f.glb", lod: "/assets/characters/campus_f_lod.glb" },
} as const;
export type BodyKind = keyof typeof CHARACTER_SETS;
/** Which body an avatar wears: the catalog `body` part (m default for legacy avatars). */
export const bodyKind = (a: Pick<Avatar, "body">): BodyKind => (a.body === "f" ? "f" : "m");
export const CHARACTER_LIMITS = { maxTriangles: 24000, maxBytes: 1400 * 1024, maxJoints: 64 };
/** Rendered body height in metres (the chibi box avatar this replaces is ~1.7 m tall, hair parts included). */
export const BODY_HEIGHT = 1.68;
export const FADE_SECONDS = 0.18;

export type Emote = "wave" | "dance" | "laugh" | "cheer" | "sit" | null | undefined;
export interface Want { clip: string; loop: boolean; rate: number }
export interface AnimState {
  cur: string; time: number; prev: string | null; prevTime: number; fade: number;
  pose: Pose; a: Pose; b: Pose; sitting: boolean;
}

/** Loads and validates the character. NEVER throws: any failure resolves null so the box avatar stays in use. */
export async function loadSkinnedCharacter(url = CHARACTER_URL, fetchFn: typeof fetch = (...a) => fetch(...a)): Promise<SkinnedModel | null> {
  try {
    const res = await fetchFn(url, { credentials: "omit" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    if (buf.byteLength > CHARACTER_LIMITS.maxBytes) throw new Error(`over byte budget (${buf.byteLength})`);
    const model = parseSkinnedGlb(buf, CHARACTER_LIMITS); model.baseUrl = url.slice(0, url.lastIndexOf("/") + 1); return model;
  } catch (e) {
    console.warn("[character] skinned body unavailable, using built-in avatar:", e instanceof Error ? e.message : e);
    return null;
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Which clip an avatar should play, from its measured ground speed (m/s) and active emote. Pure; unit-tested. */
export function pickClip(m: SkinnedModel, speed: number, emote: Emote): Want {
  const has = (n: string) => !!m.clips[n];
  const spd = Number.isFinite(speed) ? Math.max(0, speed) : 0;
  if (emote === "dance" && has("Dance_Loop")) return { clip: "Dance_Loop", loop: true, rate: 1 };
  if (emote === "cheer" && has("Dance_Loop")) return { clip: "Dance_Loop", loop: true, rate: 1.35 };
  if (emote === "laugh" && has("Idle_Talking_Loop")) return { clip: "Idle_Talking_Loop", loop: true, rate: 1.6 };
  if (emote === "wave" && has("Interact")) return { clip: "Interact", loop: true, rate: 1 };
  if (spd < 0.3) return { clip: has("Stand_Loop") ? "Stand_Loop" : "Idle_Loop", loop: true, rate: 1 };
  const bands: [string, number, number, number][] = [["Walk_Loop", 1.9, 0.6, 2.0], ["Jog_Fwd_Loop", 5.2, 0.75, 1.8], ["Sprint_Loop", Infinity, 0.9, 2.4]];
  for (const [name, upTo, lo, hi] of bands) {
    if (spd < upTo && has(name)) return { clip: name, loop: true, rate: clamp(spd / (m.clipSpeed[name] || 1), lo, hi) };
  }
  return { clip: "Idle_Loop", loop: true, rate: 1 };
}

export function createAnimState(m: SkinnedModel): AnimState {
  return { cur: m.clips.Stand_Loop ? "Stand_Loop" : "Idle_Loop", time: Math.random() * 2, prev: null, prevTime: 0, fade: 1, pose: newPose(m), a: newPose(m), b: newPose(m), sitting: false };
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Advance one avatar's animation by dt and leave the blended local pose in st.pose. */
export function stepAnimation(m: SkinnedModel, st: AnimState, speed: number, emote: Emote, dt: number): void {
  dt = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.25);
  let want = pickClip(m, speed, emote);
  const hasSit = !!(m.clips.Sitting_Idle_Loop);
  const sitClips = ["Sitting_Enter", "Sitting_Idle_Loop", "Sitting_Exit"];
  if (hasSit && emote === "sit") {
    // stand -> Sitting_Enter (one-shot) -> Sitting_Idle_Loop
    if (!sitClips.includes(st.cur)) want = { clip: m.clips.Sitting_Enter ? "Sitting_Enter" : "Sitting_Idle_Loop", loop: false, rate: 1 };
    else if (st.cur === "Sitting_Enter" && st.time < m.clips.Sitting_Enter!.duration) want = { clip: "Sitting_Enter", loop: false, rate: 1 };
    else want = { clip: "Sitting_Idle_Loop", loop: true, rate: 1 };
    st.sitting = true;
  } else if (st.sitting) {
    // sit ended: play Sitting_Exit once (unless the player already moves away), then normal locomotion
    if (speed > 0.6 || !m.clips.Sitting_Exit) st.sitting = false;
    else if (st.cur !== "Sitting_Exit") want = { clip: "Sitting_Exit", loop: false, rate: 1 };
    else if (st.time < m.clips.Sitting_Exit.duration) want = { clip: "Sitting_Exit", loop: false, rate: 1 };
    else st.sitting = false;
  }
  if (want.clip !== st.cur) {
    const from = m.clips[st.cur], to = m.clips[want.clip];
    st.prev = st.cur; st.prevTime = st.time; st.fade = 0;
    // Locomotion loops keep their phase so feet do not pop when speed crosses a band.
    st.time = from && to && want.loop && from.duration > 0 && /Walk|Jog|Sprint/.test(st.cur) && /Walk|Jog|Sprint/.test(want.clip) ? (st.time / from.duration) % 1 * to.duration : 0;
    st.cur = want.clip;
  }
  st.time += dt * want.rate; st.prevTime += dt; st.fade = Math.min(1, st.fade + dt / FADE_SECONDS);
  const cur = m.clips[st.cur]; if (!cur) return;
  const loop = want.loop;
  sampleClip(m, cur, st.time, loop, st.b);
  if (st.fade < 1 && st.prev && m.clips[st.prev]) { sampleClip(m, m.clips[st.prev]!, st.prevTime, true, st.a); blendPose(m, st.pose, st.a, st.b, smooth(st.fade)); }
  else { st.pose.t.set(st.b.t); st.pose.r.set(st.b.r); st.pose.s.set(st.b.s); }
}

export interface CharacterAnimator {
  model: SkinnedModel;
  /** Head width of the skinned body in metres at render scale (hair/face parts are sized for a ~0.4 m chibi head). */
  headWidth: number;
  create(): AnimState;
  /** Vertex colours for this avatar (painted materials x baked AO). Cached; plain un-painted bodies fall back to four flat regions. */
  colors(avatar: Avatar): Float32Array;
  /** Optional geometry groups this avatar wears (hood, skirt, backpack, satchel, chain) that exist in this model. */
  groups(avatar: Avatar): string[];
  /** True for realistic textured bodies: drawn through the renderer's textured avatar pass with emitTextured(), not emit(). */
  textured: boolean;
  /** Textured bodies: skin the pose and append position/normal/uv triangles (unindexed) to `out`. */
  emitTextured(st: AnimState, at: { x: number; z: number; yaw: number }, out: { p: number[]; n: number[]; u: number[] }, groups?: readonly string[]): { tris: number; head: [number, number, number] };
  /** Skin the pose in `st` and append the body (+ the given groups) to the dynamic batch arrays. Returns triangles emitted and the head's offset from its rest position (world axes). */
  emit(st: AnimState, at: { x: number; z: number; yaw: number }, col: Float32Array, out: { p: number[]; n: number[]; c: number[] }, groups?: readonly string[]): { tris: number; head: [number, number, number] };
  restHeadTop: number;
  /** World position of a named joint from the LAST emit()/emitTextured() call (so call it after emitting). Null if the joint is missing. */
  joint(name: string, at: { x: number; z: number; yaw: number }): [number, number, number] | null;
}

export { hairIsPainted };
const hex = (h: string): [number, number, number] => { const n = parseInt(String(h).replace("#", ""), 16) || 0; return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };

export function createCharacterAnimator(m: SkinnedModel, pants = "#2a3144", shoes = "#1c1f26"): CharacterAnimator {
  const K = m.jointCount, world = new Float32Array(K * 16), skin = new Float32Array(K * 16);
  const sp = new Float32Array(m.vertexCount * 3), sn = new Float32Array(m.vertexCount * 3);
  const scale = (m.bodyHeight || BODY_HEIGHT) / m.height, headIdx = Math.max(0, m.jointNames.indexOf("head"));
  const colorCache = new Map<string, Float32Array>();
  // rest-pose head joint position + head width/top (model units)
  const rest = newPose(m); skinMatrices(m, rest, world, skin);
  const headRest: [number, number, number] = [world[headIdx * 16 + 12], world[headIdx * 16 + 13], world[headIdx * 16 + 14]];
  let hx0 = Infinity, hx1 = -Infinity, top = -Infinity;
  for (let v = 0; v < m.baseVertices; v++) {
    let bestW = 0, bestJ = 0; for (let k = 0; k < 4; k++) if (m.weights[v * 4 + k] > bestW) { bestW = m.weights[v * 4 + k]; bestJ = m.joints[v * 4 + k]; }
    if (bestJ === headIdx) { hx0 = Math.min(hx0, m.positions[v * 3]); hx1 = Math.max(hx1, m.positions[v * 3]); }
    top = Math.max(top, m.positions[v * 3 + 1]);
  }
  let lowY = Infinity; for (let v = 0; v < m.baseVertices; v++) lowY = Math.min(lowY, m.positions[v * 3 + 1]);
  const yOffset = -lowY * scale; // stand the bind pose's soles on y = 0
  return {
    model: m, textured: !!m.uvs, headWidth: (hx1 - hx0) * scale, restHeadTop: top * scale + yOffset,
    create: () => createAnimState(m),
    joint(name, at) {
      const j = m.jointNames.indexOf(name); if (j < 0) return null;
      const x = world[j * 16 + 12]! * scale, y = world[j * 16 + 13]! * scale + yOffset, z = world[j * 16 + 14]! * scale, cy = Math.cos(at.yaw), sy = Math.sin(at.yaw);
      return [at.x + x * cy + z * sy, y, at.z - x * sy + z * cy];
    },
    colors(avatar) {
      const key = paintKey(avatar); let c = colorCache.get(key);
      if (!c) {
        if (colorCache.size > 64) colorCache.clear();
        c = m.paint ? paintVertexColors(m.paint, m.vertexCount, avatar) : regionVertexColors(m, [hex(avatar.skin), hex(avatar.outfit), hex(pants), hex(shoes)]);
        colorCache.set(key, c);
      }
      return c;
    },
    groups: (avatar) => (m.uvs ? wardrobeGroups(avatar) : groupsFor(avatar)).filter((g) => !!m.groups[g]),
    emitTextured(st, at, out, groups) {
      skinMatrices(m, st.pose, world, skin);
      const before = out.p.length;
      skinToSoup(m, skin, { x: at.x, y: yOffset, z: at.z, yaw: at.yaw, scale }, sp, sn, out.p, out.n, groups ?? [], out.u);
      const dx = (world[headIdx * 16 + 12] - headRest[0]) * scale, dy = (world[headIdx * 16 + 13] - headRest[1]) * scale, dz = (world[headIdx * 16 + 14] - headRest[2]) * scale;
      const cy = Math.cos(at.yaw), sy = Math.sin(at.yaw);
      return { tris: (out.p.length - before) / 9, head: [dx * cy + dz * sy, dy, -dx * sy + dz * cy] };
    },
    emit(st, at, col, out, groups) {
      skinMatrices(m, st.pose, world, skin);
      const before = out.p.length;
      skinToSoup(m, skin, { x: at.x, y: yOffset, z: at.z, yaw: at.yaw, scale }, sp, sn, out.p, out.n, groups);
      // colours follow the same index ranges the soup used: base first, then each enabled group
      const I = m.indices, pushRange = (i0: number, i1: number) => { for (let i = i0; i < i1; i++) { const v = I[i]! * 3; out.c.push(col[v]!, col[v + 1]!, col[v + 2]!); } };
      pushRange(0, m.baseIndices);
      for (const name of groups ?? []) { const g = m.groups[name]; if (g) pushRange(g.i0, g.i0 + g.iN); }
      const dx = (world[headIdx * 16 + 12] - headRest[0]) * scale, dy = (world[headIdx * 16 + 13] - headRest[1]) * scale, dz = (world[headIdx * 16 + 14] - headRest[2]) * scale;
      const cy = Math.cos(at.yaw), sy = Math.sin(at.yaw);
      return { tris: (out.p.length - before) / 9, head: [dx * cy + dz * sy, dy, -dx * sy + dz * cy] };
    },
  };
}
