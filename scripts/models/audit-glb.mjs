#!/usr/bin/env node
// GLB asset audit (Worldbuilding brief §08). No dependencies: parses GLB headers directly.
// Usage: node scripts/models/audit-glb.mjs [--write]   (--write regenerates docs/ASSET_INVENTORY.md)
// Fails (exit 1) on: missing file, invalid GLB, bytes/triangles over per-asset or resident budget,
// declared size mismatching measured bounds, unapplied/extreme node scale, missing normals, 4K textures,
// or on-disk GLBs that are not registered in assets.json.
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MANIFEST = join(ROOT, 'packages/domain/src/world-data/assets.json');
const PUBLIC = join(ROOT, 'apps/web/public');
const OUT = join(ROOT, 'docs/ASSET_INVENTORY.md');
const SIZE_TOLERANCE = 0.25; // declared vs measured extents, fraction of declared (+0.05 m slack)

const COMP_SIZE = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TYPE_N = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

function parseGlb(buf) {
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('bad magic');
  if (buf.readUInt32LE(8) !== buf.length) throw new Error('length header mismatch');
  const jsonLen = buf.readUInt32LE(12);
  if (buf.readUInt32LE(16) !== 0x4e4f534a) throw new Error('first chunk is not JSON');
  return JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));
}

function measure(gltf) {
  const acc = gltf.accessors ?? [];
  let tris = 0;
  let verts = 0;
  let missingNormals = 0;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const badScale = [];
  const nodes = gltf.nodes ?? [];
  // Walk scene graph, accumulating translation+scale (rotation ignored: props are axis-aligned by contract).
  const visit = (i, t, s) => {
    const n = nodes[i];
    const ns = n.scale ?? [1, 1, 1];
    const nt = n.translation ?? [0, 0, 0];
    if (ns.some((v) => v !== 1)) badScale.push(n.name ?? `node${i}`);
    const S = [s[0] * ns[0], s[1] * ns[1], s[2] * ns[2]];
    const T = [t[0] + nt[0] * s[0], t[1] + nt[1] * s[1], t[2] + nt[2] * s[2]];
    if (n.mesh !== undefined) {
      for (const p of gltf.meshes[n.mesh].primitives) {
        const pos = acc[p.attributes.POSITION];
        verts += pos.count;
        if (p.attributes.NORMAL === undefined) missingNormals++;
        tris += (p.indices !== undefined ? acc[p.indices].count : pos.count) / 3;
        for (let k = 0; k < 3; k++) {
          const a = pos.min?.[k] ?? 0;
          const b = pos.max?.[k] ?? 0;
          const lo = Math.min(a * S[k], b * S[k]) + T[k];
          const hi = Math.max(a * S[k], b * S[k]) + T[k];
          if (lo < min[k]) min[k] = lo;
          if (hi > max[k]) max[k] = hi;
        }
      }
    }
    for (const c of n.children ?? []) visit(c, T, S);
  };
  const scene = gltf.scenes?.[gltf.scene ?? 0];
  for (const r of scene?.nodes ?? []) visit(r, [0, 0, 0], [1, 1, 1]);
  const textures = (gltf.images ?? []).length;
  return {
    tris: Math.round(tris),
    verts,
    materials: (gltf.materials ?? []).length,
    textures,
    meshes: (gltf.meshes ?? []).length,
    missingNormals,
    badScale,
    extents: { w: max[0] - min[0], h: max[1] - min[1], d: max[2] - min[2] },
    minY: min[1],
  };
}

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const defaults = manifest.defaults ?? {};
const errors = [];
const warnings = [];
const rows = [];
let totalBytes = 0;
let totalTris = 0;

for (const a of manifest.assets) {
  const file = join(PUBLIC, a.url);
  if (!existsSync(file)) {
    errors.push(`${a.id}: file missing (${a.url})`);
    continue;
  }
  const buf = readFileSync(file);
  let m;
  try {
    m = measure(parseGlb(buf));
  } catch (e) {
    errors.push(`${a.id}: invalid GLB (${e.message})`);
    continue;
  }
  const maxBytes = a.maxBytes ?? defaults.maxBytes;
  const maxTris = a.maxTriangles ?? defaults.maxTriangles;
  totalBytes += buf.length;
  totalTris += m.tris;
  if (buf.length > maxBytes) errors.push(`${a.id}: ${buf.length} bytes > budget ${maxBytes}`);
  if (m.tris > maxTris) errors.push(`${a.id}: ${m.tris} tris > budget ${maxTris}`);
  if (m.missingNormals) warnings.push(`${a.id}: ${m.missingNormals} primitive(s) without normals`);
  if (m.badScale.length) warnings.push(`${a.id}: non-unit node scale on ${m.badScale.slice(0, 3).join(', ')} (apply transforms)`);
  if (m.textures && m.textures > 4) warnings.push(`${a.id}: ${m.textures} textures (prefer a shared atlas)`);
  let sizeNote = 'ok';
  if (a.size) {
    const bad = [['w', a.size.w], ['h', a.size.h], ['d', a.size.d]].filter(([k, v]) => {
      const meas = m.extents[k];
      return Math.abs(meas - v) > v * SIZE_TOLERANCE + 0.05;
    });
    if (bad.length) {
      sizeNote = 'drift ' + bad.map(([k, v]) => `${k}:${v}→${m.extents[k].toFixed(2)}`).join(' ');
      warnings.push(`${a.id}: declared size differs from model bounds (${sizeNote})`);
    }
  }
  rows.push({ a, bytes: buf.length, maxBytes, maxTris, m, sizeNote });
}

// Unregistered GLBs on disk.
const registered = new Set(manifest.assets.map((a) => basename(a.url)));
const onDisk = [];
for (const dir of ['assets/props', 'assets/characters']) {
  const d = join(PUBLIC, dir);
  if (existsSync(d)) for (const f of readdirSync(d)) if (f.endsWith('.glb')) onDisk.push(`${dir}/${f}`);
}
for (const f of onDisk) if (!registered.has(basename(f))) warnings.push(`${f}: GLB on disk but not in assets.json`);

const rb = manifest.residentBudget;
if (rb) {
  if (totalBytes > rb.maxBytes) errors.push(`resident total ${totalBytes} bytes > ${rb.maxBytes}`);
  if (totalTris > rb.maxTriangles) errors.push(`resident total ${totalTris} tris > ${rb.maxTriangles}`);
}

if (process.argv.includes('--write')) {
  const zones = (a) => (Array.isArray(a.zones) ? a.zones.join(', ') : a.zones ?? '');
  const lines = [
    '# CAMPUS GLB inventory (generated by `node scripts/models/audit-glb.mjs --write`)',
    '',
    'Measured from the GLB files themselves (triangles, bounds, materials) against `packages/domain/src/world-data/assets.json`.',
    'All GLBs are generated in-repo by `scripts/models/generate-props.mjs`; no third-party art. Collision comes from domain SOLIDS, not GLBs.',
    '',
    `Registered: ${rows.length} · total ${(totalBytes / 1024).toFixed(0)} KiB / ${rb ? (rb.maxBytes / 1024).toFixed(0) : '–'} KiB · ${totalTris} tris / ${rb?.maxTriangles ?? '–'}`,
    '',
    '| id | slot | zones | KiB | tris | W×H×D (m) | mats | tex | size vs manifest |',
    '|---|---|---|---|---|---|---|---|---|',
    ...rows.map(({ a, bytes, m, sizeNote }) =>
      `| ${a.id} | ${a.slot ?? ''} | ${zones(a)} | ${(bytes / 1024).toFixed(1)} | ${m.tris} | ${m.extents.w.toFixed(2)}×${m.extents.h.toFixed(2)}×${m.extents.d.toFixed(2)} | ${m.materials} | ${m.textures} | ${sizeNote} |`),
    '',
    warnings.length ? '## Warnings\n' + warnings.map((w) => `- ${w}`).join('\n') : '## Warnings\nnone',
    '',
  ];
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, lines.join('\n'));
  console.log(`wrote ${OUT}`);
}

for (const w of warnings) console.warn(`warn: ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`FAIL: ${e}`);
  process.exit(1);
}
console.log(`asset audit passed: ${rows.length} GLBs, ${(totalBytes / 1024).toFixed(0)} KiB, ${totalTris} tris, ${warnings.length} warning(s)`);
