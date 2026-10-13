# Resources gathered and the realism plan (13 Oct 2026)

## Gathered in this session (staged, NOT registered in assets.json)
- `assets-library/kenney/` - 1,237 Kenney CC0 models (nature 329, food 200, fantasy-town 167, furniture 140, retro-urban 124, modular-buildings 108, city-roads 72, city-suburban 40, city-commercial 37, mini-market 20), converted with `scripts/models/batch-kenney.py` into the texture-less GLB format (palette baked to vertex colours), 15.7 MiB, 210k tris total, each <= 3,000 tris. `catalog.json` lists id, kit, tris, bytes, bounds. 4 over-budget buildings were skipped.
- Sources reachable from the sandbox: GitHub only (shorepine/kenney, J-Ponzo/gltf-universal-animation-library, KhronosGroup/glTF-Sample-Assets). NOT reachable: ambientcg.com, polyhaven.com, quaternius.com, kenney.nl, opengameart.org.

## What is still needed for "real-looking" (Free Fire-class) quality - honest scope
Kenney/Quaternius low-poly packs give shapes, not realism. Realism comes from three things CAMPUS does not have yet:
1. **Texture + PBR support in the renderer.** `apps/web/lib/glb.ts` ignores textures and `world-3d-render.ts` is a custom vertex-colour pipeline. Needed: UV + albedo/normal/roughness sampling in `world-shaders.ts`, texture atlas loading (KTX2/Basis or compressed WebP), and a quality ladder. This is the single biggest step.
2. **PBR material textures (CC0).** Download on a networked machine: ambientCG (concrete, terrazzo, tiles, paving, grass, bark, metal, glass-frosted), Poly Haven (textures, HDRI sky, trees/rocks). 1K albedo+normal+roughness per material, packed into atlases. Record each in `docs/ASSET_SOURCES.md`.
3. **Authored hero assets.** Custom-modelled hero buildings and higher-detail avatars (Quaternius/Mixamo-class characters, hair cards, face textures). Kenney-style kits will not reach the bar alone.
Then: baked AO/lightmaps for hero zones, a shadow-cascade pass, SSAO-lite or baked contact detail, filmic tonemap + bloom for signage, and measured Low/Balanced/High profiles on a real phone. Free Fire itself targets native GPUs; in a browser expect a stylised-realistic look at best, and prove it with device captures before claiming parity.

## Suggested order
a) Add texture/normal support to the shader + loader (one material first: paving). b) Swap ground/walls/roofs to PBR atlases in the hero slice. c) Import Kenney/Quaternius props where they beat current props (see ASSET_SOURCES verdict). d) Hero buildings. e) Device performance table.
