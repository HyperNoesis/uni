import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseSkinnedGlb, newPose, type SkinnedModel } from "./skinned-glb";
import { applyGesture, jointModelPos, type GestureKind } from "./gesture-pose";

const load = (f: string): SkinnedModel => { const b = readFileSync(new URL(`../public/assets/characters/${f}`, import.meta.url)); return parseSkinnedGlb(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, { maxTriangles: 60000, maxJoints: 64 }); };
const KINDS: GestureKind[] = ["stop", "reach", "hold", "give", "take", "inspect", "thumbs", "beckon"];
describe.each(["campus_m.glb", "campus_f.glb"])("gestures on %s", (file) => {
  const m = load(file);
  const fwd = (p: ReturnType<typeof newPose>, j: string) => jointModelPos(m, p, j)!;
  it("keeps every pose finite and unit-length for every gesture", () => {
    for (const k of KINDS) { const p = newPose(m); expect(applyGesture(m, p, k, 1, 0.7)).toBe(true); for (const v of p.r) expect(Number.isFinite(v)).toBe(true); for (let i = 0; i < m.jointCount; i++) expect(Math.hypot(p.r[i * 4]!, p.r[i * 4 + 1]!, p.r[i * 4 + 2]!, p.r[i * 4 + 3]!)).toBeCloseTo(1, 3); }
  });
  it("stop/give put the hand clearly in front of the body; reach puts it by the hip; inspect holds it at chest height in front", () => {
    const rest = fwd(newPose(m), "hand.R"), sh = fwd(newPose(m), "upper_arm.R");
    const p1 = newPose(m); applyGesture(m, p1, "give", 1); expect(fwd(p1, "hand.R")[2] - sh[2]).toBeGreaterThan(0.35);
    const p2 = newPose(m); applyGesture(m, p2, "stop", 1); expect(fwd(p2, "hand.R")[2] - sh[2]).toBeGreaterThan(0.2); expect(fwd(p2, "hand.R")[1]).toBeGreaterThan(fwd(p2, "forearm.R")[1]);
    const p3 = newPose(m); applyGesture(m, p3, "reach", 1); expect(fwd(p3, "hand.R")[1]).toBeLessThan(sh[1] - 0.3);
    const p4 = newPose(m); applyGesture(m, p4, "inspect", 1); expect(fwd(p4, "hand.R")[1]).toBeGreaterThan(sh[1] - 0.6); expect(fwd(p4, "hand.R")[2] - sh[2]).toBeGreaterThan(0.1);
  });
  it("weight 0 leaves the animated pose untouched and weight blends in between", () => {
    const a = newPose(m), b = newPose(m), c = newPose(m); applyGesture(m, b, "stop", 0); expect(Array.from(b.r)).toEqual(Array.from(a.r));
    applyGesture(m, c, "give", 0.5); const h0 = fwd(a, "hand.R")[2], h1 = fwd(c, "hand.R")[2]; const full = newPose(m); applyGesture(m, full, "give", 1); expect(h1).toBeGreaterThan(h0); expect(h1).toBeLessThan(fwd(full, "hand.R")[2]);
  });
});
