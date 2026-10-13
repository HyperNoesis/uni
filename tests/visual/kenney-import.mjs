// Imported Kenney candidates must load through the REAL in-repo loader and carry baked colour (not default white).
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseGlb } from "../../apps/web/lib/glb.ts";
const dir = new URL("../../apps/web/public/assets/kenney-candidates/", import.meta.url);
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".glb")); assert.ok(files.length >= 4, "candidates present");
for (const f of files) {
  const b = fs.readFileSync(new URL(f, dir)); const m = parseGlb(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), { maxTriangles: 6000 });
  assert.ok(m.triangles > 10 && m.triangles <= 2500, `${f} tris ${m.triangles}`);
  assert.ok(m.positions.every(Number.isFinite) && m.normals.every(Number.isFinite), `${f} finite`);
  let nonWhite = 0; for (let i = 0; i < m.colors.length; i += 3) if (m.colors[i] < 0.97 || m.colors[i + 1] < 0.97 || m.colors[i + 2] < 0.97) nonWhite++;
  assert.ok(nonWhite / (m.colors.length / 3) > 0.9, `${f} has baked colour`);
}
console.log(`kenney-import ok: ${files.length} candidates load via parseGlb with baked colours`);
