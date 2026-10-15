// Pure test for the skinned-character runtime (no GL): parses the REAL shipped GLB, samples its clips, skins on the CPU.
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseSkinnedGlb, SkinnedGlbError, newPose, sampleClip, blendPose, skinMatrices, skinToSoup, regionVertexColors, worldMatrices } from "../../apps/web/lib/skinned-glb.ts";

const file = new URL("../../apps/web/public/assets/characters/campus_body.glb", import.meta.url);
const bytes = fs.readFileSync(file);
const ab = () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const LIM = { maxTriangles: 8000, maxJoints: 64 };
const m = parseSkinnedGlb(ab(), LIM);

// --- shape & budget
assert.equal(m.jointCount, 23); assert.ok(m.triangles >= 1500 && m.triangles <= 6500, `triangles ${m.triangles}`);
assert.ok(bytes.byteLength < 450 * 1024, `size ${bytes.byteLength}`);
for (const c of ["Stand_Loop", "Idle_Loop", "Walk_Loop", "Jog_Fwd_Loop", "Sprint_Loop", "Sitting_Idle_Loop", "Dance_Loop"]) assert.ok(m.clips[c] && m.clips[c].duration > 0, `clip ${c}`);
assert.ok(m.height > 1.6 && m.height < 2.0, `bind height ${m.height}`);
assert.deepEqual(m.forward.map((v) => Math.round(v)), [0, 0, 1], "model faces +z like the game's heading 0");
for (let i = 0; i < m.jointCount; i++) assert.ok(m.parents[i] < i, "parent precedes child");
for (let v = 0; v < m.vertexCount; v++) { let s = 0; for (let k = 0; k < 4; k++) s += m.weights[v * 4 + k]; assert.ok(Math.abs(s - 1) < 1e-3, "weights sum to 1"); }

// --- rest pose reproduces the bind mesh (skin matrices == identity)
const pose = newPose(m), world = new Float32Array(m.jointCount * 16), skin = new Float32Array(m.jointCount * 16);
const sp = new Float32Array(m.vertexCount * 3), sn = new Float32Array(m.vertexCount * 3);
const place0 = { x: 0, y: 0, z: 0, yaw: 0, scale: 1 };
skinMatrices(m, pose, world, skin);
const ALL = Object.keys(m.groups);
skinToSoup(m, skin, place0, sp, sn, [], [], ALL);
let maxErr = 0; for (let i = 0; i < sp.length; i++) maxErr = Math.max(maxErr, Math.abs(sp[i] - m.positions[i]));
assert.ok(maxErr < 2e-3, `rest-pose skinning error ${maxErr}`);

// --- every clip: finite, bounded, grounded, loops cleanly
const bounds = (clip, t) => { sampleClip(m, m.clips[clip], t, true, pose); skinMatrices(m, pose, world, skin); skinToSoup(m, skin, place0, sp, sn, [], [], ALL); let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (let v = 0; v < m.vertexCount; v++) for (let k = 0; k < 3; k++) { const x = sp[v * 3 + k]; assert.ok(Number.isFinite(x), `NaN in ${clip}@${t}`); lo[k] = Math.min(lo[k], x); hi[k] = Math.max(hi[k], x); } return { lo, hi }; };
for (const [name, clip] of Object.entries(m.clips)) {
  for (let s = 0; s <= 8; s++) {
    const b = bounds(name, (s / 8) * clip.duration);
    assert.ok(b.hi[0] - b.lo[0] < 2.6 && b.hi[2] - b.lo[2] < 2.6 && b.hi[1] - b.lo[1] < 2.4, `${name} extents sane`);
    if (/Walk|Jog|Sprint|Idle_Loop|Stand_Loop/.test(name)) assert.ok(Math.abs(b.lo[1]) < (/Jog|Sprint/.test(name) ? 0.4 : 0.2), `${name}@${s} feet near ground (${b.lo[1].toFixed(3)}; running clips have a flight phase)`);
  }
}
for (const n of ["Stand_Loop", "Idle_Loop", "Walk_Loop", "Jog_Fwd_Loop", "Sprint_Loop", "Sitting_Idle_Loop", "Dance_Loop"]) {
  const a = bounds(n, 0), z = bounds(n, m.clips[n].duration);
  for (let k = 0; k < 3; k++) assert.ok(Math.abs(a.lo[k] - z.lo[k]) < 0.06 && Math.abs(a.hi[k] - z.hi[k]) < 0.06, `${n} loop seam is continuous`);
}
const sit = bounds("Sitting_Idle_Loop", 0.5); assert.ok(sit.hi[1] < 1.6, `seated body is lower than standing (${sit.hi[1].toFixed(2)})`);

// --- Stand_Loop is a symmetric stance (feet together), unlike the authored idles which stagger the feet ~0.4 m
{ sampleClip(m, m.clips.Stand_Loop, 0.7, true, pose); worldMatrices(m, pose, world); const i = (n) => m.jointNames.indexOf(n) * 16;
  const gap = Math.abs(world[i("foot.L") + 14] - world[i("foot.R") + 14]); assert.ok(gap < 0.12, `Stand_Loop feet fore-aft gap ${gap.toFixed(2)}`);
  sampleClip(m, m.clips.Idle_Loop, 0.7, true, pose); worldMatrices(m, pose, world); assert.ok(Math.abs(world[i("foot.L") + 14] - world[i("foot.R") + 14]) > 0.3, "authored Idle_Loop is staggered (why Stand_Loop exists)"); }
// --- locomotion speeds are plausible and ordered (drives playback-rate matching)
const { Walk_Loop: w, Jog_Fwd_Loop: j, Sprint_Loop: s } = m.clipSpeed;
assert.ok(w > 0.8 && w < 2.6, `walk speed ${w}`); assert.ok(j > w && s > j, `speeds ordered ${w} < ${j} < ${s}`);

// --- blending
const A = newPose(m), B = newPose(m), O = newPose(m);
sampleClip(m, m.clips.Idle_Loop, 0.3, true, A); sampleClip(m, m.clips.Walk_Loop, 0.3, true, B);
blendPose(m, O, A, B, 0); assert.ok(A.r.every((v, i) => Math.abs(v - O.r[i]) < 1e-5), "k=0 -> a");
blendPose(m, O, A, B, 1); assert.ok(B.r.every((v, i) => Math.abs(v - O.r[i]) < 1e-5), "k=1 -> b");
blendPose(m, O, A, B, 0.5); for (let i = 0; i < m.jointCount; i++) { const l = Math.hypot(O.r[i * 4], O.r[i * 4 + 1], O.r[i * 4 + 2], O.r[i * 4 + 3]); assert.ok(Math.abs(l - 1) < 1e-4, "blended quaternion stays unit"); }

// --- placement: heading pi/2 turns the model's +z (toes) to world +x; scale and translation apply
sampleClip(m, m.clips.Idle_Loop, 0, true, pose); skinMatrices(m, pose, world, skin);
const P0 = [], N0 = []; skinToSoup(m, skin, { x: 0, y: 0, z: 0, yaw: 0, scale: 1 }, sp, sn, P0, N0);
const front = (arr, axis) => { let best = -1e9; for (let i = axis; i < arr.length; i += 3) best = Math.max(best, arr[i]); return best; };
const zFront = front(P0, 2);
const P1 = [], N1 = []; skinToSoup(m, skin, { x: 10, y: 2, z: -5, yaw: Math.PI / 2, scale: 0.5 }, sp, sn, P1, N1);
assert.ok(Math.abs(front(P1, 0) - (10 + zFront * 0.5)) < 1e-4, "heading pi/2 -> forward is +x, scaled, translated");
assert.ok(N1.every(Number.isFinite) && Math.abs(Math.hypot(N1[0], N1[1], N1[2]) - 1) < 1e-3, "normals unit & finite");

// --- customisation colours: head is skin, feet are shoes, torso is outfit
const SKIN = [0.8, 0.5, 0.3], TOP = [0.1, 0.4, 0.9], PANTS = [0.2, 0.2, 0.25], SHOES = [0.05, 0.05, 0.05];
const col = regionVertexColors(m, [SKIN, TOP, PANTS, SHOES]);
let hiV = 0, loV = 0; for (let v = 0; v < m.vertexCount; v++) { if (m.positions[v * 3 + 1] > m.positions[hiV * 3 + 1]) hiV = v; if (m.positions[v * 3 + 1] < m.positions[loV * 3 + 1]) loV = v; }
const near = (c, v, t = 0.08) => [0, 1, 2].every((k) => Math.abs(col[v * 3 + k] - c[k]) < t);
assert.ok(near(SKIN, hiV), "top of head uses skin colour"); assert.ok(near(SHOES, loV), "sole uses shoe colour");
let outfitVerts = 0; for (let v = 0; v < m.vertexCount; v++) if (near(TOP, v, 0.02)) outfitVerts++; assert.ok(outfitVerts > 100, `torso has outfit colour (${outfitVerts})`);

// --- the parser rejects hostile / broken input instead of misrendering
const rej = (buf, why) => assert.throws(() => parseSkinnedGlb(buf, LIM), SkinnedGlbError, why);
rej(ab().slice(0, 40), "truncated"); { const x = ab(); new DataView(x).setUint32(0, 0, true); rej(x, "bad magic"); }
assert.throws(() => parseSkinnedGlb(ab(), { maxTriangles: 500, maxJoints: 64 }), SkinnedGlbError, "triangle budget enforced");
assert.throws(() => parseSkinnedGlb(ab(), { maxTriangles: 4000, maxJoints: 8 }), SkinnedGlbError, "joint budget enforced");
console.log(`skinned-glb ok: ${m.triangles} tris, ${m.jointCount} joints, ${Object.keys(m.clips).length} clips, walk ${w.toFixed(2)} / jog ${j.toFixed(2)} / sprint ${s.toFixed(2)} m/s`);
