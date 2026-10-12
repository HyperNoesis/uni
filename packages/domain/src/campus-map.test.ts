import { describe, expect, it } from "vitest";
import { AMBIENT_NPCS, BUILDINGS, INTERACTION_POINTS, SPAWN, WORLD, ZONES, buildingAt, collides, isBlocked, npcAt, slideMove, suggestQuality, validateMove, zoneAt } from "./index";

describe("campus map", () => {
  it("keeps spawn, interaction points and every zone centre walkable", () => {
    expect(isBlocked(SPAWN.x, SPAWN.y)).toBe(false);
    for (const p of INTERACTION_POINTS) expect(isBlocked(p.x, p.y)).toBe(false);
    for (const z of ZONES) expect(isBlocked(z.x + z.w / 2, z.y + z.h / 2)).toBe(false);
  });
  it("places every building inside its zone and inside the world", () => {
    for (const b of BUILDINGS) {
      const z = ZONES.find((zz) => zz.id === b.zoneId)!;
      expect(b.x >= z.x && b.y >= z.y && b.x + b.w <= z.x + z.w && b.y + b.h <= z.y + z.h).toBe(true);
      expect(b.x + b.w <= WORLD.width && b.y + b.h <= WORLD.height).toBe(true);
    }
  });
  it("lets players enter through a door but not through a wall", () => {
    const b = BUILDINGS.find((x) => x.id === "food_hall")!;
    const doorX = b.door!.x + b.door!.w / 2;
    expect(collides(doorX, b.y + b.h - 0.4)).toBe(false); // standing in the doorway
    expect(collides(b.x + 2, b.y + b.h - 0.4)).toBe(true); // solid wall beside the door
    expect(buildingAt(doorX, b.y + b.h - 3)?.id).toBe("food_hall");
  });
  it("keeps the main paths open from gate to every zone", () => {
    for (let y = 4; y <= 78; y += 0.5) expect(isBlocked(60, y) && !(y > 47 && y < 52)).toBe(false); // only the fountain may interrupt the spine
    for (let x = 4; x <= 116; x += 0.5) expect(isBlocked(x, 38)).toBe(false);
  });
  it("slides along walls and never ends inside a solid", () => {
    const b = BUILDINGS.find((x) => x.id === "library_hall")!;
    const r = slideMove(b.x - 1, b.y + 5, b.x + 1, b.y + 6);
    expect(isBlocked(r.x, r.y)).toBe(false);
  });
  it("server rejects claimed positions inside walls", () => {
    const b = BUILDINGS[0]!;
    const r = validateMove({ x: b.x - 1, y: b.y + 5 }, { x: b.x + 0.3, y: b.y + 5 }, 100, WORLD.maxSpeed, WORLD.speedTolerance, WORLD, isBlocked);
    expect(r.corrected).toBe(true);
    expect(r.x).toBe(b.x - 1);
  });
  it("ambient NPC paths are clear, deterministic and stay on the map", () => {
    for (const n of AMBIENT_NPCS) {
      for (let t = 0; t < 120_000; t += 500) {
        const a = npcAt(n, t), b = npcAt(n, t);
        expect(a).toEqual(b);
        expect(isBlocked(a.x, a.y)).toBe(false);
        expect(zoneAt(a.x, a.y) !== undefined || a.y > 30).toBe(true);
      }
    }
  });
  it("suggests lower quality for weak devices", () => {
    expect(suggestQuality({ memoryGb: 2 })).toBe("low");
    expect(suggestQuality({ cores: 8, memoryGb: 8 })).toBe("high");
    expect(suggestQuality({ saveData: true, cores: 8 })).toBe("low");
  });
});
