// Compiles validated zone files into the flat structures the server and client already consume.
// Pure and dependency-light (zod only) so it can also run in tooling and in tests.
import { WorldConfigSchema, ZoneDefSchema, type ZoneDef, type WorldConfig } from "./world-schema";

export interface CompiledWorld {
  config: WorldConfig;
  zones: ZoneDef[];
  spawn: { x: number; y: number };
}

export function compileWorld(worldJson: unknown, zoneJson: Record<string, unknown>): CompiledWorld {
  const config = WorldConfigSchema.parse(worldJson);
  const zones: ZoneDef[] = Object.entries(zoneJson).map(([key, raw]) => {
    const def = ZoneDefSchema.parse(raw);
    if (def.id !== key) throw new Error(`zone file "${key}" declares id "${def.id}"`);
    return def;
  });
  const seen = new Map<string, string>();
  const claim = (kind: string, id: string, zone: string) => {
    const k = `${kind}:${id}`;
    if (seen.has(k)) throw new Error(`duplicate ${kind} id "${id}" (zones ${seen.get(k)} and ${zone})`);
    seen.set(k, zone);
  };
  const inside = (r: { x: number; y: number; w: number; h: number }, o: { x: number; y: number; w: number; h: number }) =>
    r.x >= o.x && r.y >= o.y && r.x + r.w <= o.x + o.w && r.y + r.h <= o.y + o.h;
  const world = { x: 0, y: 0, w: config.width, h: config.height };
  const defaults: { x: number; y: number }[] = [];
  for (const z of zones) {
    claim("zone", z.id, z.id);
    if (!inside(z.rect, world)) throw new Error(`zone ${z.id} extends outside the world`);
    for (const b of z.buildings) {
      claim("building", b.id, z.id);
      if (!inside(b, z.rect)) throw new Error(`building ${b.id} is outside zone ${z.id}`);
      if (b.door && (b.door.x < b.x || b.door.x + b.door.w > b.x + b.w)) throw new Error(`building ${b.id} door is outside its walls`);
    }
    for (const d of z.decor) if (!inside({ x: d.x, y: d.y, w: 0.001, h: 0.001 }, world)) throw new Error(`decor ${d.model} in zone ${z.id} is outside the world`);
    for (const p of z.interactionPoints) claim("interaction", p.id, z.id);
    for (const n of z.npcs) claim("npc", n.id, z.id);
    for (const s of z.spawnPoints) { claim("spawn", s.id, z.id); if (s.default) defaults.push(s); }
  }
  if (defaults.length !== 1) throw new Error(`exactly one default spawn point is required, found ${defaults.length}`);
  return { config, zones, spawn: { x: defaults[0]!.x, y: defaults[0]!.y } };
}
