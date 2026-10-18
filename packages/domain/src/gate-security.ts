// Grand Gate entry rules shared by the realtime server (authority) and the web client (prediction + visuals).
// The car gate and the towers/wings are always solid; the pedestrian wicket is solid until the player has been approved.
import layout from "./world-data/gate-layout.json";
import { collides, PLAYER_RADIUS, type Solid } from "./campus-map";

export const GATE = layout;
const toSolid = (s: { x: number; y: number; w: number; h: number }): Solid => ({ kind: "wall", x: s.x, y: s.y, w: s.w, h: s.h });
/** Invisible collision walls for the gate structures (also written into gate_road.json props). */
export const GATE_STATIC_SOLIDS: readonly Solid[] = layout.staticSolids.map(toSolid);
/** Extra wall that closes the pedestrian wicket for players who have not shown their pass. */
export const GATE_WICKET_SOLID: Solid = toSolid(layout.wicketSolid);
export const GATE_WICKET_BARRIER: readonly Solid[] = [GATE_WICKET_SOLID];

/** Movement blocker for a player: world solids + the wicket unless they are approved. */
export function gateBlocked(x: number, y: number, passed: boolean, r = PLAYER_RADIUS): boolean {
  return !passed && collides(x, y, r, GATE_WICKET_BARRIER);
}
/** True when the straight move (x0,y0)->(x1,y1) would pass through the closed wicket. Sampled so a long claim cannot tunnel through the thin barrier. */
export function gateSegmentBlocked(x0: number, y0: number, x1: number, y1: number, passed: boolean): boolean {
  if (passed) return false;
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.1));
  for (let i = 1; i <= n; i++) { const k = i / n; if (gateBlocked(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, false)) return true; }
  return false;
}
/** True when the point is on the arrival side of the gate (outside, south). */
export const isOutsideGate = (y: number): boolean => y > layout.line + 0.4;
/** Distance from the point to the middle of the gate line. */
export const gateDistance = (x: number, y: number): number => Math.hypot(x - layout.centre.x, y - layout.line);
/** Entry check starts when an unapproved player on the outside gets this close to the gate. */
export const inChallengeZone = (x: number, y: number): boolean => isOutsideGate(y) && x > layout.lane.x0 - 10 && x < layout.lane.x1 + 10 && y - layout.line < layout.triggerRadius;
