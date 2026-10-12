// World geometry and zone content shared by the realtime server (authority)
// and the web client (rendering). Units are world units; 1 unit ~ 1 tile.

import { compileWorld } from "./world-compile";
import { WORLD_JSON, ZONE_JSON } from "./world-data";

// Zones, spawn, interaction points and world constants are DATA: edit src/world-data/**/*.json.
// This module compiles them once at load (validated with zod; invalid data throws at startup).
const COMPILED = compileWorld(WORLD_JSON, ZONE_JSON);

export const WORLD = {
  width: COMPILED.config.width,
  height: COMPILED.config.height,
  maxSpeed: COMPILED.config.maxSpeed, // units per second, server-enforced
  speedTolerance: COMPILED.config.speedTolerance, // slack for network jitter
  interactRange: COMPILED.config.interactRange,
  interestRadius: COMPILED.config.interestRadius,
  snapshotHz: COMPILED.config.snapshotHz,
} as const;

/** Open string: zones are defined by data files, so new rooms need no code change. */
export type ZoneId = string;

export interface Zone {
  id: ZoneId;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  ambientAudio?: string;
}

export const ZONES: readonly Zone[] = COMPILED.zones.map((z) => ({ id: z.id, name: z.name, ...z.rect, color: z.color, ...(z.ambientAudio ? { ambientAudio: z.ambientAudio } : {}) }));

export const SPAWN = COMPILED.spawn;

export function zoneAt(x: number, y: number): Zone | undefined {
  return ZONES.find((z) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h);
}

export function clampToWorld(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.min(WORLD.width, Math.max(0, x)),
    y: Math.min(WORLD.height, Math.max(0, y)),
  };
}

export interface InteractionPoint {
  id: string;
  name: string;
  x: number;
  y: number;
  activity: "reaction" | "quiz" | "hunt" | "jobs" | "shift" | "checkin" | null;
  /** Hidden checkpoint; rendered and interactable only when it is the active clue. */
  hidden?: boolean;
}

export const INTERACTION_POINTS: readonly InteractionPoint[] = COMPILED.zones.flatMap((z) => z.interactionPoints);

/** Per-zone content (spawn points, props, NPC routes) for the map layer. */
export const ZONE_DEFS = COMPILED.zones;

import { parseAssetManifest } from "./assets";
import { ASSET_MANIFEST_JSON } from "./world-data";
/** Validated against the zone list at load; ships empty until real GLB models are added under public/assets. */
export const ASSET_MANIFEST = parseAssetManifest(ASSET_MANIFEST_JSON, ZONES.map((z) => z.id));
