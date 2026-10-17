# Characters (realistic, textured)

Shipped bodies (22-joint rig, same 11 clips, one 2048x1024 albedo atlas + 1024x512 tint mask each):

| file | what | licence |
|---|---|---|
| `campus_m.glb` / `_lod.glb` | male, from AvatarSDK "MetaPerson" avatar (TalkingHead sample), ~7.0k / 1.9k tris | **non-commercial** (AvatarSDK). Replace before any commercial launch. |
| `campus_f.glb` / `_lod.glb` | female, from MPFB / MakeHuman-style base (TalkingHead sample), ~6.1k / 1.5k tris | CC0 |
| animations | Quaternius Universal Animation Library (Standard), retargeted by bone direction | CC0 |

`*_atlas.webp` = albedo (alpha = hair-card cut-out). `*_mask.png` = R skin, G hair, B garment: the avatar shader multiplies those
regions by the player's skin / hair colour / outfit colour, so one texture serves every customisation.
`bodyKind(avatar)` (lib/skinned-character.ts): hair braids/bun/wrap = female body, otherwise male (the catalog has no gender field yet).

Rebuild: `MESHOPT_SO=libmeshopt.so python3 scripts/models/build-realistic.py all` (needs the two source GLBs, see the script header;
libmeshopt.so is built from github.com/zeux/meshoptimizer with `g++ -O2 -shared -fPIC src/*.cpp`). Quality is checked by
`tests/visual/realistic-character.mjs` (part of `pnpm check:3d`).

Known gaps: no accessories/hair styles/hoodie/kaftan on these bodies (outfit is the authored shirt, tinted); MPFB is barefoot;
neither source is a Black person, so tone comes from the tint (face detail is flattened on the darkest tones).
The old painted Quaternius body lives on as test fixtures in `tests/visual/fixtures/painted/`.
