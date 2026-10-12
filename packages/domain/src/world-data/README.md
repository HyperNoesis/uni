# World data

One JSON file per zone in `zones/`, global constants in `world.json`. Schema: `../world-schema.ts`.

**Add a room**
1. Copy any file in `zones/` to `zones/<new_id>.json` (lower_snake_case id, must match the file name).
2. Set `rect`, buildings, props, spawn points, interaction points, NPC routes, `ambientAudio`.
3. Add one import line in `index.ts`.

Startup validates every file (unique ids, everything inside the world and its zone, exactly one default spawn).
`world-data.test.ts` fails if a file is not registered. Exactly one spawn point has `"default": true`.
