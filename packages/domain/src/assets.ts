// Asset manifest: which GLB models may replace the built-in code-drawn shapes, where they load from,
// which zones need them, and the size budgets the loader enforces. Pure + zod only.
import { z } from "zod";

const snake = /^[a-z][a-z0-9_]{0,40}$/;
export const AssetEntrySchema = z.object({
  id: z.string().regex(snake),
  /** Same-origin path only: no external hosts, no data: URLs. */
  url: z.string().regex(/^\/assets\/[A-Za-z0-9_\-./]+\.glb$/, "url must be /assets/....glb").refine((u) => !u.includes(".."), "no path traversal"),
  /** What it replaces. `prop:<kind>` replaces solids; `decor:<name>` is placed by zone `decor` lists. */
  slot: z.string().regex(/^(prop|decor|building|npc|avatar):[a-z0-9_]+$/),
  /** Zones that need it ("all" = always resident). Streamed in when the player is in/next to one. */
  zones: z.union([z.literal("all"), z.array(z.string().regex(snake)).min(1)]),
  maxBytes: z.number().int().positive().optional(),
  maxTriangles: z.number().int().positive().optional(),
  /** World-unit size the unit-normalised model is scaled to; omitted = footprint of the prop it replaces. */
  size: z.object({ w: z.number().positive(), h: z.number().positive(), d: z.number().positive() }).optional(),
  yOffset: z.number().optional(),
  /** Position of the model's bounding-box centre (x,z) and base (y) relative to its owner origin; used by avatar parts. */
  anchor: z.object({ x: z.number(), y: z.number(), z: z.number() }).optional(),
  /** Which avatar colour multiplies the model's own vertex colours (none = draw as authored). */
  tint: z.enum(["none", "hair", "outfit", "skin"]).optional(),
});

export const AssetManifestSchema = z.object({
  schemaVersion: z.literal(1),
  defaults: z.object({ maxBytes: z.number().int().positive(), maxTriangles: z.number().int().positive() }),
  /** Resident budget across everything loaded at once (enforced by the streamer, evicting old zones first). */
  residentBudget: z.object({ maxBytes: z.number().int().positive(), maxTriangles: z.number().int().positive() }),
  assets: z.array(AssetEntrySchema),
});
export type AssetEntry = z.infer<typeof AssetEntrySchema>;
export type AssetManifest = z.infer<typeof AssetManifestSchema>;

export function parseAssetManifest(raw: unknown, knownZones: readonly string[]): AssetManifest {
  const m = AssetManifestSchema.parse(raw);
  const ids = new Set<string>(), slots = new Set<string>();
  for (const a of m.assets) {
    if (ids.has(a.id)) throw new Error(`duplicate asset id "${a.id}"`);
    if (slots.has(a.slot)) throw new Error(`slot "${a.slot}" is claimed by more than one asset`);
    ids.add(a.id); slots.add(a.slot);
    if (a.zones !== "all") for (const z of a.zones) if (!knownZones.includes(z)) throw new Error(`asset ${a.id} references unknown zone "${z}"`);
  }
  return m;
}

export const assetLimits = (m: AssetManifest, a: AssetEntry) => ({
  maxBytes: Math.min(a.maxBytes ?? m.defaults.maxBytes, m.residentBudget.maxBytes),
  maxTriangles: Math.min(a.maxTriangles ?? m.defaults.maxTriangles, m.residentBudget.maxTriangles),
});

/** Assets needed while the player is in `zoneId` (zone-specific plus always-resident). */
export const assetsForZone = (m: AssetManifest, zoneId: string | undefined): AssetEntry[] =>
  m.assets.filter((a) => a.zones === "all" || (zoneId !== undefined && a.zones.includes(zoneId)));
