import { describe, expect, it } from "vitest";
import { BUILDINGS, INTERACTION_POINTS, PLAYER_RADIUS, WALL, WORLD, buildingAt, collides, isBlocked } from "./index";

// Regression guard for "can't enter buildings" and "glitching into buildings": every room with a door must be reachable
// through it, every doorway must fit a player, and every room activity marker must sit inside its room on open floor.
describe("room access", () => {
  const withDoor = BUILDINGS.filter((b) => b.door);

  it("every doorway is wide enough for a player and clear on both sides", () => {
    for (const b of withDoor) {
      const d = b.door!, cx = d.x + d.w / 2;
      expect(d.w, `${b.id} door width`).toBeGreaterThanOrEqual(2 * PLAYER_RADIUS + 0.3);
      expect(d.x, `${b.id} door inside wall span`).toBeGreaterThanOrEqual(b.x + WALL);
      expect(d.x + d.w, `${b.id} door inside wall span`).toBeLessThanOrEqual(b.x + b.w - WALL);
      expect(isBlocked(cx, b.y + b.h + 0.8), `${b.id} outside the door`).toBe(false);
      expect(isBlocked(cx, b.y + b.h - WALL / 2), `${b.id} in the doorway`).toBe(false);
      expect(isBlocked(cx, b.y + b.h - WALL - 1.5), `${b.id} just inside the door`).toBe(false);
    }
  });

  it("the Enter button's walk targets are open floor (1 m outside the door, 1.5 m inside)", () => {
    for (const b of withDoor) {
      const cx = b.door!.x + b.door!.w / 2;
      expect(collides(cx, b.y + b.h + 1.0), `${b.id} out target`).toBe(false);
      expect(collides(cx, b.y + b.h - WALL - 1.5), `${b.id} in target`).toBe(false);
      expect(buildingAt(cx, b.y + b.h - WALL - 1.5)?.id, `${b.id} in target is inside its own room`).toBe(b.id);
    }
  });

  it("room activity markers sit inside their room, on open floor, in reach of the doorway", () => {
    const room = INTERACTION_POINTS.filter((p) => p.id.startsWith("rp_"));
    expect(room.length).toBeGreaterThanOrEqual(100);
    for (const p of room) {
      const b = buildingAt(p.x, p.y);
      expect(b, `${p.id} is inside a building`).toBeDefined();
      expect(isBlocked(p.x, p.y), `${p.id} not inside furniture or a wall`).toBe(false);
      expect(["quiz", "reaction"], `${p.id} uses a proximity-verified activity`).toContain(p.activity);
      const cx = b!.door!.x + b!.door!.w / 2;
      expect(Math.hypot(p.x - cx, p.y - (b!.y + b!.h - WALL - 1.5)), `${p.id} reachable from just inside the door`).toBeLessThanOrEqual(WORLD.interactRange);
    }
  });

  it("no two buildings overlap", () => {
    for (let i = 0; i < BUILDINGS.length; i++) for (let j = i + 1; j < BUILDINGS.length; j++) {
      const a = BUILDINGS[i]!, c = BUILDINGS[j]!;
      expect(a.x < c.x + c.w && c.x < a.x + a.w && a.y < c.y + c.h && c.y < a.y + a.h, `${a.id} overlaps ${c.id}`).toBe(false);
    }
  });
});
