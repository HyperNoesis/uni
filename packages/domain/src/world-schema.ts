// World-as-data: schema for one zone file (src/world-data/zones/<id>.json) and the global world.json.
// A zone is a self-contained content container: bounds, buildings, solid props, spawn points,
// interaction points, ambient audio tag and ambient NPC routes. Adding a room = adding a file here.
import { z } from "zod";

const id = z.string().regex(/^[a-z][a-z0-9_]{1,40}$/, "ids are lower_snake_case");
const num = z.number().finite();
const pos = z.object({ x: num, y: num });
const rect = z.object({ x: num, y: num, w: num.positive(), h: num.positive() });
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const SOLID_KINDS = ["wall", "tree", "palm", "fountain", "shelf", "counter", "pillar", "bench", "stage", "block"] as const;
export const ROOM_KINDS = ["classroom", "lab", "workshop", "dorm", "office", "clinic", "shop", "canteen", "studio", "gym", "lounge", "hall"] as const;
export const ACTIVITY_KINDS = ["reaction", "quiz", "hunt", "jobs", "shift", "checkin"] as const;

export const WorldConfigSchema = z.object({
  schemaVersion: z.literal(1),
  width: num.positive(),
  height: num.positive(),
  maxSpeed: num.positive(),
  speedTolerance: num.min(1),
  interactRange: num.positive(),
  interestRadius: num.positive(),
  snapshotHz: num.positive(),
});

export const BuildingDefSchema = rect.extend({
  id,
  name: z.string().min(1).max(40),
  /** Door gap on the south wall (x range). Null = decorative block with no entrance. */
  door: z.object({ x: num, w: num.positive() }).nullable(),
  color: hex,
  height: num.positive(),
  /** Room type; drives the generic interior dressing and door awning colour. Optional so legacy landmarks stay bespoke. */
  kind: z.enum(ROOM_KINDS).optional(),
});

export const PropDefSchema = rect.extend({ kind: z.enum(SOLID_KINDS) });

export const InteractionPointDefSchema = z.object({
  id,
  name: z.string().min(1).max(60),
  x: num,
  y: num,
  activity: z.enum(ACTIVITY_KINDS).nullable(),
  hidden: z.boolean().optional(),
});

export const NpcDefSchema = z.object({
  id,
  name: z.string().min(1).max(30),
  outfit: hex,
  skin: hex,
  speed: num.positive(),
  pauseMs: num.min(0),
  path: z.array(pos).min(2),
});

/** Non-solid scenery. `model` names a manifest asset with slot "decor:<model>"; missing models are simply not drawn. */
export const DecorDefSchema = z.object({
  model: id,
  x: num,
  y: num,
  /** Rotation about the vertical axis, radians. */
  rot: num.optional(),
  scale: num.positive().max(4).optional(),
});

export const SpawnPointDefSchema = pos.extend({ id, default: z.boolean().optional() });

export const ZoneDefSchema = z.object({
  schemaVersion: z.literal(1),
  id,
  name: z.string().min(1).max(40),
  rect,
  color: hex,
  /** Ambient audio tag; the client maps it to a sound bed. Free-form so new beds need no schema change. */
  ambientAudio: z.string().max(30).optional(),
  spawnPoints: z.array(SpawnPointDefSchema),
  buildings: z.array(BuildingDefSchema),
  props: z.array(PropDefSchema),
  interactionPoints: z.array(InteractionPointDefSchema),
  npcs: z.array(NpcDefSchema),
  decor: z.array(DecorDefSchema).default([]),
});

export type WorldConfig = z.infer<typeof WorldConfigSchema>;
export type ZoneDef = z.infer<typeof ZoneDefSchema>;
export type BuildingDef = z.infer<typeof BuildingDefSchema>;
export type DecorDef = z.infer<typeof DecorDefSchema>;
export type PropDef = z.infer<typeof PropDefSchema>;
