import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AMBIENT_NPCS, BUILDINGS, INTERACTION_POINTS, SOLIDS, ZONES, ZONE_DEFS, compileWorld, isBlocked } from "./index";
import { WORLD_JSON, ZONE_JSON } from "./world-data";

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

describe("world as data", () => {
  it("registers every zone file in ./world-data/zones (and nothing else)", () => {
    const dir = join(dirname(fileURLToPath(import.meta.url)), "world-data", "zones");
    const files = readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, "")).sort();
    expect(Object.keys(ZONE_JSON).sort()).toEqual(files);
  });
  it("compiles the shipped campus to the same content the code used to hard-code", () => {
    expect(ZONES).toHaveLength(22);
    expect(BUILDINGS).toHaveLength(160);
    expect(BUILDINGS.filter((b) => b.door).length).toBeGreaterThanOrEqual(100); // enterable rooms
    expect(INTERACTION_POINTS.filter((p) => !p.id.startsWith("rp_"))).toHaveLength(13); // hand-placed campus points
    expect(INTERACTION_POINTS.filter((p) => p.id.startsWith("rp_")).length).toBeGreaterThanOrEqual(100); // generated room points (quiz / reaction by room kind)
    expect(AMBIENT_NPCS).toHaveLength(43);
    expect(SOLIDS.filter((s) => s.kind !== "wall")).toHaveLength(86);
    expect(ZONE_DEFS.flatMap((z) => z.decor).length).toBeGreaterThan(50);
  });
  it("keeps every NPC waypoint and every spawn point walkable", () => {
    for (const n of AMBIENT_NPCS) for (const p of n.path) expect(isBlocked(p.x, p.y)).toBe(false);
    for (const z of ZONE_DEFS) for (const s of z.spawnPoints) expect(isBlocked(s.x, s.y)).toBe(false);
  });
  it("adding a room is data only: a new zone file compiles and appears in the world", () => {
    const zones = clone(ZONE_JSON) as Record<string, any>;
    zones.rooftop = { schemaVersion: 1, id: "rooftop", name: "Rooftop", rect: { x: 1, y: 1, w: 2, h: 2 }, color: "#112233", spawnPoints: [], buildings: [], props: [], interactionPoints: [], npcs: [] };
    expect(compileWorld(WORLD_JSON, zones).zones.map((z) => z.id)).toContain("rooftop");
  });
  it("rejects invalid data with a clear error", () => {
    const base = () => clone(ZONE_JSON) as Record<string, any>;
    const dupe = base(); dupe.library.interactionPoints.push({ ...dupe.student_commons.interactionPoints[0] });
    expect(() => compileWorld(WORLD_JSON, dupe)).toThrow(/duplicate interaction/);
    const outside = base(); outside.library.buildings[0].x = 200;
    expect(() => compileWorld(WORLD_JSON, outside)).toThrow(/outside/);
    const noSpawn = base(); noSpawn.main_gate.spawnPoints = [];
    expect(() => compileWorld(WORLD_JSON, noSpawn)).toThrow(/default spawn/);
    const badId = base(); badId.library.id = "Library";
    expect(() => compileWorld(WORLD_JSON, badId)).toThrow();
    const mismatch = base(); mismatch.library.id = "other_room";
    expect(() => compileWorld(WORLD_JSON, mismatch)).toThrow(/declares id/);
  });
});
