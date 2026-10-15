// Pure test for the collision-aware orbit camera (no GL).
import assert from "node:assert/strict";
import { solveOrbitCamera, DEFAULT_PITCH, clampPitch, clampZoom, solveFirstPersonCamera, solveChaseCamera, headingForward, headingRight, clampLook, wrapHeading, FP_EYE } from "../../apps/web/lib/world-camera.ts";
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
// First-person: eye at head height on the player, looking along the heading; NaN-safe; pitch clamped.
const fp = solveFirstPersonCamera({ x: 10, y: 20, heading: 0, look: 0 });
assert.deepEqual(fp.eye, [10, FP_EYE, 20]);
assert.ok(fp.target[2] > fp.eye[2] && Math.abs(fp.target[0] - 10) < 1e-9, "heading 0 faces +z");
const east = solveFirstPersonCamera({ x: 0, y: 0, heading: Math.PI / 2, look: 0 });
assert.ok(east.target[0] > 9.9 && Math.abs(east.target[2]) < 1e-6, "heading pi/2 faces +x");
assert.ok(solveFirstPersonCamera({ x: 1, y: 1, heading: NaN, look: NaN }).eye.every(Number.isFinite));
assert.equal(clampLook(9), 1.25); assert.equal(clampLook(-9), -1.25); assert.ok(Math.abs(wrapHeading(7) - (7 - 2 * Math.PI)) < 1e-9);
// Walk basis: right is perpendicular to forward and equals screen-right (f x up) for a right-handed lookAt.
for (const h of [0, 0.7, 2, -2.4]) {
  const [fx, fz] = headingForward(h), [rx, rz] = headingRight(h);
  assert.ok(Math.abs(fx * rx + fz * rz) < 1e-9, "perpendicular");
  assert.ok(Math.abs(rx - -fz) < 1e-9 && Math.abs(rz - fx) < 1e-9, "right = (-fz, fx)");
}
// Chase camera sits behind the avatar and slides in when a wall is behind it.
const ch = solveChaseCamera({ x: 30, y: 30, heading: 0, look: 0, boxes: [] });
assert.ok(ch.eye[2] < 30 && ch.clearance === 1, "behind (-z) when facing +z");
const behindWall = solveChaseCamera({ x: 30, y: 30, heading: 0, look: 0, boxes: [{ x: 20, y: 26, w: 20, h: 3, height: 30 }] });
assert.ok(behindWall.clearance < 1 && behindWall.eye[2] > 29.0, "pulled in front of the wall's face");
// Never collapses into the avatar: even with a wall right behind, the eye stays at least ~0.85 m away on the ground plane.
const backToWall = solveChaseCamera({ x: 30, y: 30, heading: 0, look: 0, boxes: [{ x: 20, y: 29.5, w: 20, h: 0.4, height: 30 }] });
assert.ok(Math.hypot(backToWall.eye[0] - 30, backToWall.eye[2] - 30) >= 0.85, "camera keeps a body-length gap");
// Standing inside a room made of thin walls (door on the south side): the camera stays at full distance, it is not squeezed.
const room = [{ x: 10, y: 10, w: 10, h: 0.8, height: 3 }, { x: 10, y: 10, w: 0.8, h: 7, height: 3 }, { x: 19.2, y: 10, w: 0.8, h: 7, height: 3 }, { x: 10, y: 16.2, w: 3, h: 0.8, height: 3 }, { x: 17, y: 16.2, w: 3, h: 0.8, height: 3 }];
const inRoom = solveChaseCamera({ x: 15, y: 14, heading: 0, look: 0, boxes: room }); // facing +z (the door wall), camera behind toward the north wall
assert.ok(inRoom.clearance > 0.3 && inRoom.eye[2] > 11.1, "inside a room the eye stays inside the room, not behind the wall");
console.log("camera solver test passed");

// First-person eye is pushed out of decorative pillars (not server colliders); unaffected when clear or when the pillar is lower than the eye.
{
  const pillar = { x: 10, y: 10, w: 1, h: 1, height: 4 };
  const inside = solveFirstPersonCamera({ x: 10.5, y: 10.5, heading: 0, look: 0, boxes: [pillar] });
  const outside = inside.eye[0] < pillar.x || inside.eye[0] > pillar.x + pillar.w || inside.eye[2] < pillar.y || inside.eye[2] > pillar.y + pillar.h;
  assert.ok(outside, "eye must end outside the pillar footprint");
  const clear = solveFirstPersonCamera({ x: 20, y: 20, heading: 0, look: 0, boxes: [pillar] });
  assert.deepEqual([clear.eye[0], clear.eye[2]], [20, 20]);
  const low = solveFirstPersonCamera({ x: 10.5, y: 10.5, heading: 0, look: 0, boxes: [{ ...pillar, height: 1 }] });
  assert.deepEqual([low.eye[0], low.eye[2]], [10.5, 10.5]);
  console.log("first-person pillar push-out test passed");
}
