# Characters (rigged GLB)
`campus_body.glb` / `campus_body_lod.glb` are GENERATED: `python3 scripts/models/paint-character.py` (inputs in `scripts/models/base/`, from Quaternius Universal Animation Library, CC0; see docs/ASSET_SOURCES.md).
Do not hand-edit. Each vertex carries `_PAINT` (material id, AO); optional geometry groups are listed in `extras.campus.groups`; colours come from `apps/web/lib/avatar-paint.ts`.
Phone budget: keep the full body under ~4k drawn tris incl. worn groups.
