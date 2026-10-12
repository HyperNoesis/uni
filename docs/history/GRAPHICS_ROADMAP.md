# Graphics roadmap: toward a Free Fire look (honest scope)
1. DONE (this pass): `/character-lab` (Three.js): ACES tone mapping, PBR environment, sun + cool rim light, soft shadows, bloom, GLB + animation loading. Needs `pnpm install` (adds `three@0.170.0`). Not run here (no network): unverified.
2. NEXT: use the same GLTFLoader/AnimationMixer for in-world players (walk/run/idle from server movement state); keep the current primitive body as fallback if the GLB fails.
3. NEXT: port the world to Three.js: the existing architecture builders emit box/cyl/sph primitives; merge them per building into vertex-coloured BufferGeometry with MeshStandardMaterial, shared sun shadow, hemisphere fill, fog, bloom. Keep the old renderer as automatic fallback.
4. THEN: swap hero buildings/props for free CC0 kits (Quaternius, Kenney, Poly Pizza), recorded in the asset registry.
5. Look: warm colour grading, rim light on characters, baked AO, restrained bloom, stylised PBR. Budget: ~150 draw calls, 1K textures.
