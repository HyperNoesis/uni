import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const renderer = readFileSync(new URL("../../apps/web/lib/world-3d-render.ts", import.meta.url), "utf8");
const play = readFileSync(new URL("../../apps/web/app/play/page.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../../apps/web/app/globals.css", import.meta.url), "utf8");

assert.match(renderer, /export function createWorld3DRenderer/);
for (const mesh of ["box", "sphere", "cone", "cylinder"]) assert.ok(renderer.includes(`createMesh(gl, "${mesh}")`), `missing ${mesh} WebGL primitive`);
for (const landmark of ["BUILDINGS", "SOLIDS", "INTERACTION_POINTS", "ZONES", "QUALITY_PROFILES"]) assert.ok(renderer.includes(`domain_1.${landmark}`), `3D scene is missing ${landmark}`);
assert.match(renderer, /gl\.enable\(gl\.DEPTH_TEST\)/, "3D depth testing must be enabled");
assert.match(renderer, /WebGL is unavailable on this browser/, "renderer must fail clearly when WebGL is unavailable");
assert.match(play, /createWorld3DRenderer\(canvas3d\)/, "actual game loop must initialize the 3D renderer");
assert.match(play, /return drawWorld\(ctx, renderInput\)/, "original 2D renderer must remain as a fallback");
assert.match(play, /function cycleRenderer\(/, "players must be able to choose the fallback renderer");
assert.match(play, /Switch between 3D and lightweight 2D campus graphics/, "renderer toggle needs an accessible label");
assert.match(play, /stageLabels/, "screen-space labels must have a dedicated canvas");
assert.match(css, /\.world canvas\.stage-webgl[\s\S]*z-index: 1/);
assert.match(css, /\.world \.hud-top[\s\S]*z-index: 4/, "HUD must render above the canvas layers");
console.log("3D renderer contract passed (source wiring only; not a WebGL/browser runtime test).");
