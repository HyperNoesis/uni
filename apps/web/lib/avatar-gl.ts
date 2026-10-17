// @ts-nocheck
/* WebGL plumbing for the textured avatar pass, shared by the world renderer and the avatar stage (customiser preview):
 * program + uniform locations, atlas/mask texture loading, per-body and per-avatar uniforms. */
import { AVATAR_VERT, AVATAR_FRAG } from "./avatar-shader";
import { styleFor } from "./avatar-wardrobe";

export const ATLAS_UNIT = 5, MASK_UNIT = 6;
const hexRgb = (h) => { const n = parseInt(String(h).replace("#", ""), 16) || 0; return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
const NAMES = ["uMvp", "uLight", "uEye", "uNight", "uAlpha", "uShadowOn", "uShadowTexel", "uShadowQ", "uLightVP", "uShadowMap", "uTexA", "uTexM", "uSkinT", "uHairC", "uTopC", "uHairL", "uTopL",
  "uTopRect", "uBotRect", "uShoeRect", "uTopPat", "uTopAcc", "uBotKind", "uBotCut", "uShoeKind", "uShoeC"];

function compile(gl, type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "avatar shader compile failed"); return s; }

/** Throws on failure; callers fall back to the box avatar. */
export function createAvatarProgram(gl) {
  const prog = gl.createProgram(); gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, AVATAR_VERT)); gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, AVATAR_FRAG));
  [["aPos", 0], ["aNormal", 1], ["aUv", 2]].forEach(([n, i]) => gl.bindAttribLocation(prog, i, n)); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || "avatar program link failed");
  const loc = {}; for (const n of NAMES) loc[n] = gl.getUniformLocation(prog, n);
  return { prog, loc, bufs: [gl.createBuffer(), gl.createBuffer(), gl.createBuffer()] };
}

/** Atlas (unit 5) + tint mask (unit 6). Resolves {albedo, mask} or null when an image fails. Restores texture unit 0. */
export function loadAtlasTextures(gl, model) {
  return new Promise((resolve) => {
    const info = model.atlas; const mk = (unit, px) => { const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(px)); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); return t; };
    const tex = { albedo: mk(ATLAS_UNIT, [180, 150, 130, 255]), mask: mk(MASK_UNIT, [0, 0, 0, 255]) }; gl.activeTexture(gl.TEXTURE0);
    if (typeof Image === "undefined") { resolve(null); return; }
    let left = 2, bad = false; const done = () => { if (--left === 0) resolve(bad ? null : tex); };
    const load = (name, t, unit) => {
      const img = new Image(); img.onload = () => {
        try { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img); gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); } catch (e) { bad = true; }
        gl.activeTexture(gl.TEXTURE0); done();
      };
      img.onerror = () => { bad = true; done(); }; img.src = (model.baseUrl || "") + name;
    };
    load(info.albedo, tex.albedo, ATLAS_UNIT); load(info.mask, tex.mask, MASK_UNIT);
  });
}

/** Bind a body's textures and set the uniforms that belong to the body (atlas regions, reference luminances). */
export function bindBody(gl, A, tex, atlas) {
  const L = A.loc; gl.activeTexture(gl.TEXTURE0 + ATLAS_UNIT); gl.bindTexture(gl.TEXTURE_2D, tex.albedo); gl.activeTexture(gl.TEXTURE0 + MASK_UNIT); gl.bindTexture(gl.TEXTURE_2D, tex.mask); gl.activeTexture(gl.TEXTURE0);
  gl.uniform1i(L.uTexA, ATLAS_UNIT); gl.uniform1i(L.uTexM, MASK_UNIT);
  gl.uniform1f(L.uHairL, Math.max(0.05, atlas.hairLuma)); gl.uniform1f(L.uTopL, Math.max(0.05, atlas.topLuma));
  gl.uniform4fv(L.uTopRect, atlas.topRect); gl.uniform4fv(L.uBotRect, atlas.botRect); gl.uniform4fv(L.uShoeRect, atlas.shoeRect); gl.uniform1f(L.uBotCut, atlas.botCut);
}

/** Per-avatar uniforms: skin/hair/outfit tints and wardrobe styling (top pattern, trousers, shoes). */
export function setLook(gl, A, atlas, avatar) {
  const L = A.loc, sk = hexRgb(avatar.skin), R = atlas.skinRef, st = styleFor(avatar), hr = hexRgb(avatar.hairColor), tp = hexRgb(avatar.outfit);
  gl.uniform3f(L.uSkinT, Math.min(1.7, sk[0] / Math.max(0.05, R[0])), Math.min(1.7, sk[1] / Math.max(0.05, R[1])), Math.min(1.7, sk[2] / Math.max(0.05, R[2])));
  gl.uniform3f(L.uHairC, hr[0], hr[1], hr[2]); gl.uniform3f(L.uTopC, tp[0], tp[1], tp[2]);
  gl.uniform1f(L.uTopPat, st.topPat); gl.uniform3f(L.uTopAcc, st.topAcc[0], st.topAcc[1], st.topAcc[2]); gl.uniform1f(L.uBotKind, st.botKind); gl.uniform1f(L.uShoeKind, st.shoeKind); gl.uniform3f(L.uShoeC, st.shoeColor[0], st.shoeColor[1], st.shoeColor[2]);
}

/** Upload one batch (positions, normals, uvs) into the program's three buffers and point attributes 0..2 at them. */
export function uploadBatch(gl, A, k) {
  [[k.p, 3], [k.n, 3], [k.u, 2]].forEach(([arr, n], i) => { gl.bindBuffer(gl.ARRAY_BUFFER, A.bufs[i]); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.DYNAMIC_DRAW); gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, n, gl.FLOAT, false, 0, 0); });
}
