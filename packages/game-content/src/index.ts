import { z } from "zod";
import { AMBIENT_NPCS, BUILDINGS, ZONES, isBlocked, npcAt, type ZoneId } from "@campus/domain";

const ZONE_IDS = ZONES.map((z) => z.id) as [ZoneId, ...ZoneId[]];
const Point = z.object({ x: z.number(), y: z.number() });

export const ZoneContent = z.object({
  zoneId: z.enum(ZONE_IDS),
  spawn: Point,
  ambient: z.string().min(1),
  npcAnchors: z.array(z.object({ id: z.string().min(1), at: Point })),
  visibility: z.enum(["public", "event_only"]),
});
export type ZoneContent = z.infer<typeof ZoneContent>;

export const ActivityCatalogEntry = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  status: z.enum(["live", "planned"]),
  phase: z.number().int().min(0).max(12),
});
export type ActivityCatalogEntry = z.infer<typeof ActivityCatalogEntry>;

export const SeasonConfig = z.object({ id: z.string(), name: z.string(), status: z.enum(["preseason", "active", "ended"]) });

const centre = (z: { x: number; y: number; w: number; h: number }) => ({ x: z.x + z.w / 2, y: z.y + z.h / 2 });
const AMBIENT: Record<string, string> = {
  main_gate: "traffic_and_greetings", student_commons: "crowd_chatter", academic_block: "lecture_hall_murmur",
  hostel_street: "music_and_laughter", food_court: "sizzle_and_orders", library: "quiet_pages",
  sports_ground: "whistles_and_cheers", creator_hub: "beats_and_clicks", event_arena: "crowd_roar",
  quiet_garden: "birdsong_and_water",
};

/** Spawn points sit at each zone's centre; NPC anchors sit one unit off it. Both are derived from world geometry. */
export const ZONE_CONTENT: readonly ZoneContent[] = ZONES.map((zone) => {
  const c = centre(zone);
  return {
    zoneId: zone.id,
    spawn: c,
    ambient: AMBIENT[zone.id] ?? "ambient_hum",
    npcAnchors: [{ id: `${zone.id}_npc_1`, at: { x: c.x + 1, y: c.y } }],
    visibility: zone.id === "event_arena" ? "event_only" : "public",
  };
});

export const ACTIVITY_CATALOG: readonly ActivityCatalogEntry[] = [
  { id: "reaction", name: "Reaction Challenge", status: "live", phase: 0 },
  { id: "quiz", name: "Campus Quiz", status: "live", phase: 6 },
  { id: "penalty_shootout", name: "Penalty Shootout", status: "planned", phase: 6 },
  { id: "campus_delivery", name: "Campus Delivery", status: "planned", phase: 6 },
  { id: "rhythm_tap", name: "Rhythm Tapping", status: "planned", phase: 6 },
  { id: "scavenger_hunt", name: "Scavenger Hunt", status: "planned", phase: 6 },
];

export const CURRENT_SEASON = { id: "weekly-campus-wars", name: "Weekly Campus Wars", status: "active" } as const;

/** Throws if any content is malformed, off-map, duplicated, or missing for a zone. Run at startup and in tests. */
export function validateContent(): void {
  const zones = z.array(ZoneContent).parse(ZONE_CONTENT);
  z.array(ActivityCatalogEntry).parse(ACTIVITY_CATALOG);
  SeasonConfig.parse(CURRENT_SEASON);
  const ids = new Set(zones.map((c) => c.zoneId));
  if (ids.size !== ZONES.length) throw new Error("every zone needs exactly one content entry");
  if (new Set(ACTIVITY_CATALOG.map((a) => a.id)).size !== ACTIVITY_CATALOG.length) throw new Error("duplicate activity id");
  for (const c of zones) {
    const zone = ZONES.find((z) => z.id === c.zoneId)!;
    const inside = (p: { x: number; y: number }) => p.x >= zone.x && p.x <= zone.x + zone.w && p.y >= zone.y && p.y <= zone.y + zone.h;
    if (!inside(c.spawn)) throw new Error(`spawn outside zone ${zone.id}`);
    for (const n of c.npcAnchors) if (!inside(n.at)) throw new Error(`npc ${n.id} outside zone ${zone.id}`);
    if (isBlocked(c.spawn.x, c.spawn.y)) throw new Error(`spawn inside a wall or prop in ${zone.id}`);
  }
  for (const b of BUILDINGS) if (!ZONES.some((z) => z.id === b.zoneId)) throw new Error(`building ${b.id} has unknown zone`);
  if (new Set(AMBIENT_NPCS.map((n) => n.id)).size !== AMBIENT_NPCS.length) throw new Error("duplicate ambient npc id");
  for (const n of AMBIENT_NPCS) for (let t = 0; t < 120_000; t += 1000) { const p = npcAt(n, t); if (isBlocked(p.x, p.y)) throw new Error(`ambient npc ${n.id} walks into a wall`); }
}
