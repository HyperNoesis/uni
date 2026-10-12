// Writes collision footprints for the three south lawns (admin / research / innovation) into zone data.
// Source of truth for geometry: apps/web/lib/world-landmarks.ts lawnLayout(). Run: node scripts/world/generate-landmark-solids.mjs
// Idempotent: replaces each lawn zone's `props` wholesale (these zones had none). Node >= 22.18 strips TS types natively.
import fs from "node:fs";
import path from "node:path";
import { lawnLayout, LAWN_ZONES } from "../../apps/web/lib/world-landmarks.ts";
const dir = path.resolve(new URL(".", import.meta.url).pathname, "../../packages/domain/src/world-data/zones");
for (const id of LAWN_ZONES) {
  const f = path.join(dir, id + ".json"), z = JSON.parse(fs.readFileSync(f, "utf8"));
  const maxB = Math.max(...z.buildings.map((b) => b.y + b.h));
  z.props = lawnLayout(id, z.rect, maxB);
  fs.writeFileSync(f, JSON.stringify(z, null, 2) + "\n");
  console.log(id.padEnd(20), z.props.length, "lawn solids");
}
