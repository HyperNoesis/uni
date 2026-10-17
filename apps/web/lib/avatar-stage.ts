// @ts-nocheck
/* Avatar stage: the customiser's "lobby". A small standalone WebGL view that shows the player's own character from the front,
 * walking in place on a scrolling floor (Free Fire lobby style). Uses the same textured avatar program/atlas/wardrobe as the game,
 * so what you pick here is exactly what you look like in the world. Never throws: start() resolves null when WebGL or the models are missing. */
import { loadSkinnedCharacter, createCharacterAnimator, stepAnimation, bodyKind, CHARACTER_SETS } from "./skinned-character";
import { createAvatarProgram, loadAtlasTextures, bindBody, setLook } from "./avatar-gl";
import { SUN_DIR } from "./world-shaders";

export const STAGE_POSES = [{ id: "walk", label: "Walk", speed: 1.5, emote: null }, { id: "run", label: "Run", speed: 4.2, emote: null }, { id: "idle", label: "Idle", speed: 0, emote: null }, { id: "dance", label: "Dance", speed: 0, emote: "dance" }, { id: "wave", label: "Wave", speed: 0, emote: "wave" }, { id: "sit", label: "Sit", speed: 0, emote: "sit" }];
/** Settings = what is behind the character: CSS sky gradient, floor tint, light level. */
export const STAGE_SETTINGS = [
  { id: "lobby", label: "Lobby", sky: ["#1b2a52", "#0c1228"], floor: [0.16, 0.2, 0.34], line: [0.45, 0.62, 1.0], night: 0.55, glow: "rgba(80,140,255,.35)" },
  { id: "lawn", label: "Campus lawn", sky: ["#8fd0ff", "#dff3ff"], floor: [0.22, 0.46, 0.2], line: [0.9, 0.95, 0.8], night: 0, glow: "rgba(255,240,180,.35)" },
  { id: "sunset", label: "Sunset", sky: ["#ff9a5c", "#5b2a6e"], floor: [0.34, 0.2, 0.22], line: [1.0, 0.7, 0.4], night: 0.2, glow: "rgba(255,170,90,.4)" },
  { id: "studio", label: "Studio", sky: ["#3a3d46", "#14151a"], floor: [0.2, 0.2, 0.22], line: [0.85, 0.85, 0.9], night: 0.1, glow: "rgba(255,255,255,.25)" },
];

const FLOOR_V = `attribute vec2 aP; uniform mat4 uMvp; varying vec2 vP; void main(){ vP=aP; gl_Position=uMvp*vec4(aP.x,0.0,aP.y,1.0); }`;
const FLOOR_F = `precision mediump float; varying vec2 vP; uniform float uScroll; uniform vec3 uFloor; uniform vec3 uLine;
void main(){ float r=length(vP); float fade=(1.0-smoothstep(0.8,6.5,r))*0.85; vec2 g=vec2(vP.x, vP.y+uScroll);
 float lx=1.0-smoothstep(0.0,0.035,abs(fract(g.x*0.8+0.5)-0.5)), lz=1.0-smoothstep(0.0,0.035,abs(fract(g.y*0.8+0.5)-0.5)); float ln=max(lx,lz)*0.55;
 float ring=smoothstep(0.05,0.0,abs(r-1.35))*.8+smoothstep(0.04,0.0,abs(r-2.2))*.35; float shadow=1.0-0.62*(1.0-smoothstep(0.15,0.75,length(vec2(vP.x*1.1,vP.y*1.35))));
 vec3 c=uFloor*(0.75+0.25*(1.0-r/8.0))*shadow+uLine*(ln+ring)*.6; float a=fade; gl_FragColor=vec4(c*a,a); }`;

function mat4Persp(f, aspect, n, fa) { const o = new Float32Array(16), t = 1 / Math.tan(f / 2); o[0] = t / aspect; o[5] = t; o[10] = (fa + n) / (n - fa); o[11] = -1; o[14] = 2 * fa * n / (n - fa); return o; }
function mat4Look(e, c, up) { let zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2], l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l; let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx; l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l; const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx; return new Float32Array([xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0, -(xx * e[0] + xy * e[1] + xz * e[2]), -(yx * e[0] + yy * e[1] + yz * e[2]), -(zx * e[0] + zy * e[1] + zz * e[2]), 1]); }
function mul(a, b) { const o = new Float32Array(16); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; } return o; }

export async function startAvatarStage(canvas, opts = {}) {
  let gl; try { gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: true, powerPreference: "low-power" }); } catch (e) { gl = null; }
  if (!gl) return null;
  let A; try { A = createAvatarProgram(gl); } catch (e) { return null; }
  const bodies = {};
  for (const k of Object.keys(CHARACTER_SETS)) {
    try {
      const m = await loadSkinnedCharacter(CHARACTER_SETS[k].url); if (!m || !m.uvs || !m.atlas) continue;
      const tex = await loadAtlasTextures(gl, m); if (!tex) continue;
      bodies[k] = { anim: createCharacterAnimator(m), tex, st: null };
    } catch (e) { /* skip body */ }
  }
  if (!Object.keys(bodies).length) return null;
  // floor program + 1x1 white texture on unit 0 (shadow sampler is bound but shadows are off)
  const fp = gl.createProgram(); for (const [t, s] of [[gl.VERTEX_SHADER, FLOOR_V], [gl.FRAGMENT_SHADER, FLOOR_F]]) { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh); gl.attachShader(fp, sh); } gl.bindAttribLocation(fp, 0, "aP"); gl.linkProgram(fp);
  const floorOk = gl.getProgramParameter(fp, gl.LINK_STATUS), fbuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, fbuf); const R = 16; gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-R, -R, R, -R, R, R, -R, -R, R, R, -R, R]), gl.STATIC_DRAW);
  const fl = { mvp: gl.getUniformLocation(fp, "uMvp"), scroll: gl.getUniformLocation(fp, "uScroll"), floor: gl.getUniformLocation(fp, "uFloor"), line: gl.getUniformLocation(fp, "uLine") };
  const white = gl.createTexture(); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, white); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
  const S = { avatar: opts.avatar, pose: "walk", setting: "lobby", yaw: 0, zoom: 1, raf: 0, last: 0, scroll: 0, drag: null, dead: false, tris: 0 };
  const L = A.loc; const out = { p: [], n: [], u: [] };
  const setting = () => STAGE_SETTINGS.find((s) => s.id === S.setting) || STAGE_SETTINGS[0];
  function resize() { const dpr = Math.min(2, window.devicePixelRatio || 1), w = Math.max(2, Math.round(canvas.clientWidth * dpr)), h = Math.max(2, Math.round(canvas.clientHeight * dpr)); if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; } gl.viewport(0, 0, w, h); return w / h; }
  function frame(t) {
    if (S.dead) return; S.raf = requestAnimationFrame(frame);
    if (typeof document !== "undefined" && document.hidden) { S.last = t; return; }
    const dt = Math.min(0.05, (t - (S.last || t)) / 1000); S.last = t;
    const kind = bodyKind(S.avatar), b = bodies[kind] || bodies.m || Object.values(bodies)[0]; if (!b) return;
    const pose = STAGE_POSES.find((p) => p.id === S.pose) || STAGE_POSES[0], set = setting();
    if (!b.st || b.st.__m !== b.anim.model) { b.st = b.anim.create(); b.st.__m = b.anim.model; }
    stepAnimation(b.anim.model, b.st, pose.speed, pose.emote, dt);
    S.scroll += pose.speed * dt; // the floor slides toward the camera at the walking speed: walking in place
    out.p.length = out.n.length = out.u.length = 0; const res = b.anim.emitTextured(b.st, { x: 0, z: 0, yaw: S.yaw }, out, b.anim.groups(S.avatar)); S.tris = res.tris;
    const aspect = resize(), dist = 3.25 / S.zoom, eye = [0, 1.2, dist], tgt = [0, 0.86, 0];
    const vp = mul(mat4Persp(0.62, aspect, 0.1, 60), mat4Look(eye, tgt, [0, 1, 0]));
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.disable(gl.CULL_FACE); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, white);
    if (floorOk) { gl.useProgram(fp); gl.uniformMatrix4fv(fl.mvp, false, vp); gl.uniform1f(fl.scroll, S.scroll); gl.uniform3fv(fl.floor, set.floor); gl.uniform3fv(fl.line, set.line); gl.bindBuffer(gl.ARRAY_BUFFER, fbuf); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.disableVertexAttribArray(1); gl.disableVertexAttribArray(2); gl.depthMask(false); gl.drawArrays(gl.TRIANGLES, 0, 6); gl.depthMask(true); }
    gl.useProgram(A.prog);
    gl.uniformMatrix4fv(L.uMvp, false, vp); gl.uniform3f(L.uLight, SUN_DIR[0], SUN_DIR[1], SUN_DIR[2]); gl.uniform3f(L.uEye, eye[0], eye[1], eye[2]); gl.uniform1f(L.uNight, set.night); gl.uniform1f(L.uAlpha, 1); gl.uniform1i(L.uShadowMap, 0); gl.uniform1f(L.uShadowOn, 0); gl.uniform1f(L.uShadowTexel, 1 / 1024); gl.uniform1f(L.uShadowQ, 0);
    const at = b.anim.model.atlas; bindBody(gl, A, b.tex, at); setLook(gl, A, at, S.avatar);
    [[out.p, 3], [out.n, 3], [out.u, 2]].forEach(([arr, n], i) => { gl.bindBuffer(gl.ARRAY_BUFFER, A.bufs[i]); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.DYNAMIC_DRAW); gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, n, gl.FLOAT, false, 0, 0); });
    gl.drawArrays(gl.TRIANGLES, 0, out.p.length / 3);
  }
  const down = (e) => { S.drag = { x: e.clientX, yaw: S.yaw }; try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ } };
  const move = (e) => { if (S.drag) S.yaw = S.drag.yaw + (e.clientX - S.drag.x) * 0.012; };
  const up = () => { S.drag = null; };
  const wheel = (e) => { e.preventDefault(); S.zoom = Math.min(1.8, Math.max(0.7, S.zoom * (e.deltaY < 0 ? 1.06 : 0.94))); };
  canvas.addEventListener("pointerdown", down); canvas.addEventListener("pointermove", move); canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up); canvas.addEventListener("wheel", wheel, { passive: false });
  S.raf = requestAnimationFrame(frame);
  return {
    setAvatar(a) { S.avatar = a; }, _yaw(y) { S.yaw = y; }, setPose(p) { S.pose = p; }, setSetting(s) { S.setting = s; }, resetView() { S.yaw = 0; S.zoom = 1; },
    get tris() { return S.tris; }, get bodies() { return Object.keys(bodies); },
    /** test hook: advance without rAF */ _tick(t) { S.last = t - 16; frame(t); cancelAnimationFrame(S.raf); },
    destroy() { S.dead = true; cancelAnimationFrame(S.raf); canvas.removeEventListener("pointerdown", down); canvas.removeEventListener("pointermove", move); canvas.removeEventListener("pointerup", up); canvas.removeEventListener("pointercancel", up); canvas.removeEventListener("wheel", wheel); },
  };
}
