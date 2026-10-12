// Pure test for the collision-aware orbit camera (no GL).
import assert from "node:assert/strict";
import { solveOrbitCamera, DEFAULT_PITCH, clampPitch, clampZoom } from "../../apps/web/lib/world-camera.ts";
const open = solveOrbitCamera({ camX: 60, camY: 40, yaw: 0, pitch: DEFAULT_PITCH, zoom: 1, boxes: [] });
assert.ok(Math.abs(open.eye[0] - 82) < 0.1 && Math.abs(open.eye[2] - 67) < 0.1, "default eye matches legacy offset (22,_,27)");
assert.equal(open.clearance, 1);
// A tall wall between player and eye must pull the camera in, and the eye must end outside the wall.
const wall = { x: 70, y: 50, w: 20, h: 10, height: 60 };
const hit = solveOrbitCamera({ camX: 60, camY: 40, yaw: 0, pitch: DEFAULT_PITCH, zoom: 1, boxes: [wall] });
assert.ok(hit.clearance < 1 && hit.clearance >= 0.3, `clearance ${hit.clearance}`);
const inside = hit.eye[0] > 69.7 && hit.eye[0] < 90.3 && hit.eye[2] > 49.7 && hit.eye[2] < 60.3 && hit.eye[1] < 60.4;
assert.ok(!inside, "eye pulled out of wall");
// Pitch/zoom are clamped and NaN-safe; eye never under ground.
assert.equal(clampPitch(NaN), DEFAULT_PITCH); assert.equal(clampZoom(99), 1.6);
for (const pitch of [-5, 0, 0.5, 3]) for (const yaw of [0, 1, 2.5, -3]) {
  const r = solveOrbitCamera({ camX: 5, camY: 5, yaw, pitch, zoom: 0.55, boxes: [wall] });
  assert.ok(r.eye.every(Number.isFinite) && r.eye[1] >= 0.7, "finite, above ground");
}
console.log("camera solver test passed");
