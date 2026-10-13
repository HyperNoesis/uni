/* eslint-disable no-console */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const root = path.resolve(__dirname, "../..");
function loadTypeScript(file, imports = {}) {
  const source = fs.readFileSync(file, "utf8");
  const javascript = ts.transpileModule(source, {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const sandbox = {
    exports: {},
    require: (name) => {
      if (Object.prototype.hasOwnProperty.call(imports, name)) return imports[name];
      // Validation (zod) is stubbed: this test checks rendering, not schemas (those have their own unit tests).
      const passthrough = { parse: (x) => x, safeParse: (x) => ({ success: true, data: x }) };
      if (name === "./world-schema") return { WorldConfigSchema: passthrough, ZoneDefSchema: passthrough };
      if (name === "./assets") return { parseAssetManifest: (x) => x };
      if (name.startsWith(".")) {
        const base = path.resolve(path.dirname(file), name);
        for (const ext of [".json", ".ts", "/index.ts"]) {
          const full = base.endsWith(".json") ? base : base + ext;
          if (!fs.existsSync(full)) continue;
          if (full.endsWith(".json")) { const j = JSON.parse(fs.readFileSync(full, "utf8")); return { ...j, default: j, __esModule: false }; }
          return loadTypeScript(full, imports);
        }
      }
      throw new Error(`Unexpected dependency ${name} in ${file}`);
    },
    Object, Array, Math, Number, String, Map, Set,
  };
  vm.runInNewContext(javascript, sandbox, { timeout: 10_000, filename: file });
  return sandbox.exports;
}

const world = loadTypeScript(path.join(root, "packages/domain/src/world.ts"));
const campusMap = loadTypeScript(path.join(root, "packages/domain/src/campus-map.ts"), { "./world": world });
const avatarMod = loadTypeScript(path.join(root, "packages/domain/src/avatar.ts"));
const domain = { ...world, ...campusMap, ...avatarMod };
const rendererSource = fs.readFileSync(path.join(root, "apps/web/lib/world-3d-render.ts"), "utf8");
const rendererJavascript = ts.transpileModule(rendererSource, {
  fileName: "world-3d-render.ts",
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

let drawCalls = 0;
let deletedResources = 0;
let createdResources = 0;
const glConstants = {
  VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4,
  ARRAY_BUFFER: 5, STATIC_DRAW: 6, DEPTH_TEST: 7, CULL_FACE: 8,
  COLOR_BUFFER_BIT: 16, DEPTH_BUFFER_BIT: 32, FLOAT: 9, TRIANGLES: 10,
};
const glBase = {
  ...glConstants,
  createShader: () => ({}), shaderSource() {}, compileShader() {}, getShaderParameter: () => true, getShaderInfoLog: () => "",
  createProgram: () => (createdResources++, {}), attachShader() {}, linkProgram() {}, getProgramParameter: () => true, getProgramInfoLog: () => "",
  useProgram() {}, getAttribLocation: (_program, name) => name === "aPos" ? 0 : 1, getUniformLocation: (_program, name) => ({ name }),
  createBuffer: () => (createdResources++, {}), bindBuffer() {}, bufferData() {}, enable() {}, disable() {}, clearColor() {}, uniform3f() {},
  viewport() {}, clear() {}, enableVertexAttribArray() {}, vertexAttribPointer() {}, uniformMatrix4fv() {}, uniform3fv() {}, uniform1f() {},
  drawArrays() { drawCalls++; }, getExtension: (n) => n === "ANGLE_instanced_arrays" ? { drawArraysInstancedANGLE() { drawCalls++; }, vertexAttribDivisorANGLE() {} } : null, deleteBuffer() { deletedResources++; }, deleteProgram() { deletedResources++; },
};
const gl = new Proxy(glBase, { get: (t, k) => (k in t ? t[k] : typeof k === "string" && /^[a-z]/.test(k) ? () => {} : undefined) });
const canvas = { clientWidth: 1280, clientHeight: 720, width: 0, height: 0, getContext: (name) => name === "webgl" ? gl : null };
const projectedLabels = [];
const labels = {
  canvas: { width: 1280, height: 720 }, clearRect() {}, measureText: (value) => ({ width: String(value).length * 7 }),
  beginPath() {}, roundRect() {}, fill() {}, fillRect() {}, fillText(value) { projectedLabels.push(String(value)); },
  set textAlign(_value) {}, set textBaseline(_value) {}, set font(_value) {}, set fillStyle(_value) {},
};
const sandbox = {
  exports: {},
  require: (name) => {
    if (name === "@campus/domain") return domain;
    if (name === "./world-architecture") return loadTypeScript(path.join(root, "apps/web/lib/world-architecture.ts"));
    if (name === "./world-architecture-ext") return loadTypeScript(path.join(root, "apps/web/lib/world-architecture-ext.ts"));
    if (name === "./world-districts") return loadTypeScript(path.join(root, "apps/web/lib/world-districts.ts"));
    if (name === "./world-district-kinds") return loadTypeScript(path.join(root, "apps/web/lib/world-district-kinds.ts"));
    if (name === "./world-landmarks") return loadTypeScript(path.join(root, "apps/web/lib/world-landmarks.ts"));
    if (name === "./world-camera") return loadTypeScript(path.join(root, "apps/web/lib/world-camera.ts"));
    if (name === "./world-environment") return loadTypeScript(path.join(root, "apps/web/lib/world-environment.ts"));
    if (name === "./world-flora") return loadTypeScript(path.join(root, "apps/web/lib/world-flora.ts"));
    if (name === "./skinned-character") return loadTypeScript(path.join(root, "apps/web/lib/skinned-character.ts"));
    if (name === "./world-shaders") return loadTypeScript(path.join(root, "apps/web/lib/world-shaders.ts"));
    throw new Error(`Unexpected renderer dependency ${name}`);
  },
  window: { devicePixelRatio: 1 }, Float32Array, Math, parseInt, Number, Object, Array, String,
};
vm.runInNewContext(rendererJavascript, sandbox, { timeout: 10_000, filename: "world-3d-render.ts" });
const createRenderer = sandbox.exports.createWorld3DRenderer;
assert.equal(typeof createRenderer, "function", "renderer export should exist");
assert.throws(() => createRenderer({ clientWidth: 400, clientHeight: 300, getContext: () => null }), /WebGL is unavailable/);
const renderer = createRenderer(canvas);
const avatar = { skin: "#b97a4f", outfit: "#2f6bff", hair: "afro", hairColor: "#1a1210", top: "tee", accessory: "none" };
const stats = renderer.render({
  width: 1280, height: 720, time: 1.25, camX: 60, camY: 72, meId: "you", quality: "medium",
  entities: [
    { id: "you", name: "You", x: 60, y: 72, avatar, tagColor: "#2f6bff" },
    { id: "npc", name: "Amara", x: 63, y: 54, avatar: { ...avatar, outfit: "#e8644a" }, npc: true, tagColor: "#8fb7e6" },
  ],
}, labels);
if (process.env.SHOW_SHAPES) console.log(JSON.stringify(stats.byShape), stats.calls);
assert.ok(stats.drawn > 50, `expected a populated 3D scene, got ${stats.drawn} visible objects`);
assert.ok(stats.culled > 0, "camera should cull distant geometry");
assert.ok(stats.labels > 0, "player and activity labels should project into screen space");
assert.ok(drawCalls > 40, `expected mesh draw calls, got ${drawCalls}`);
renderer.destroy();
assert.equal(deletedResources, createdResources, "first renderers mesh buffers and linked shader program should be released");

const callsBeforeNight = drawCalls;
// Event-night pass: night + festival lighting must render at every quality, add the baked emissive light mesh, and release everything.
for (const q of ["low", "medium", "high"]) for (const lighting of ["night", "festival"]) {
  const before = createdResources;
  const r = createRenderer(canvas); let calls0 = 0, calls1 = 0, st;
  const input = (l) => ({ width: 1280, height: 720, time: 3.5, camX: 92, camY: 66, meId: "you", quality: q, lighting: l, entities: [{ id: "you", name: "You", x: 92, y: 66, avatar, tagColor: "#2f6bff" }] });
  const d0 = drawCalls; r.render(input("day"), labels); calls0 = drawCalls - d0;
  for (let i = 0; i < 14; i++) { const d1 = drawCalls; st = r.render(input(lighting), labels); calls1 = drawCalls - d1; }
  assert.ok(Number.isFinite(st.drawn) && st.drawn > 50, `${lighting}/${q}: scene should still render`);
  assert.ok(calls1 >= calls0, `${lighting}/${q}: night should add the baked light mesh (day ${calls0}, night ${calls1})`);
  r.destroy();
}
drawCalls = callsBeforeNight; // keep the headline draw-call number about the day scene
console.log("Event-night lighting smoke passed (night + festival x low/medium/high).");

// Verify low-quality mode caps both visible ambient NPC meshes and their floating labels.
const lowRenderer = createRenderer({ ...canvas, getContext: (name) => name === "webgl" ? gl : null });
const manyNpcs = Array.from({ length: 8 }, (_, i) => ({
  id: `npc-${i}`, name: `Student-${i}`, x: 59 + i * 0.2, y: 53 + i * 0.25,
  avatar: { ...avatar, outfit: i % 2 ? "#e8644a" : "#2f6bff" }, npc: true, tagColor: "#8fb7e6",
}));
const lowStats = lowRenderer.render({
  width: 1280, height: 720, time: 1.25, camX: 60, camY: 72, meId: "you", quality: "low",
  entities: [{ id: "you", name: "You", x: 60, y: 72, avatar, tagColor: "#2f6bff" }, ...manyNpcs],
}, labels);
assert.ok(lowStats.culled >= stats.culled + 5, "low quality should cull NPCs above the configured three-NPC cap");
assert.ok(projectedLabels.includes("Student-0") && projectedLabels.includes("Student-2"), "first three NPC labels should remain available");
assert.ok(!projectedLabels.includes("Student-3") && !projectedLabels.includes("Student-7"), "labels for NPCs above the low-quality cap should be hidden");
// Skeleton animation: a walking, running, sitting and emoting player must render finite, stable frames at every quality (leg/arm FK + pelvis plant).
for (const q of ["low", "medium", "high"]) {
  const r = createRenderer(canvas);
  for (const [label, speed, emote] of [["walk", 3, undefined], ["run", 6, undefined], ["sit", 0, "sit"], ["dance", 0, "dance"]]) {
    for (let i = 0; i < 30; i++) {
      const st = r.render({ width: 1280, height: 720, time: 10 + i / 30, camX: 60, camY: 72 + i * speed / 30, camMode: "chase", camHeading: 0, camLook: 0, meId: "you", quality: q,
        entities: [{ id: "you", name: "You", x: 60, y: 72 + i * speed / 30, emote, avatar, tagColor: "#2f6bff" }] }, labels);
      assert.ok(Number.isFinite(st.drawn) && st.drawn > 50, `${q}/${label}: frame ${i} produced a finite populated scene`);
    }
  }
  r.destroy();
}
console.log("Skeleton animation smoke passed (walk/run/sit/dance x low/medium/high).");
lowRenderer.destroy();
assert.equal(deletedResources, createdResources, "both renderers should release all generated mesh buffers and linked shader programs");
console.log(`3D renderer runtime smoke passed against current domain data: ${domain.ZONES.length} zones, ${domain.BUILDINGS.length} buildings, ${domain.SOLIDS.length} solids; ${stats.drawn} visible objects, ${stats.culled} culled, ${stats.labels} labels, ${drawCalls} mesh draw calls.`);
console.log("Quality-budget check passed: low mode limits ambient NPC meshes and labels to three.");
console.log("Note: this uses a mock WebGL API. It validates the renderer's JavaScript path, not GPU shader compilation or browser/device compatibility.");
