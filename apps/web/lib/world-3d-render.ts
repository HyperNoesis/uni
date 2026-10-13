// @ts-nocheck
/* Lightweight low-poly WebGL renderer. Created as an opt-in real 3D layer with 2D fallback. */
import * as domain_1 from "@campus/domain";
import { buildZoneArchitecture, hasZoneArchitecture, buildInterior, registerArchitecture } from "./world-architecture";
import { EXT_ARCH } from "./world-architecture-ext";
registerArchitecture(EXT_ARCH);
import { buildDistrict } from "./world-districts";
import { buildKindDetail } from "./world-district-kinds";
import { roofCrown, zoneGateway, southLawn, gateRoadExtras } from "./world-landmarks";
import { solveOrbitCamera, solveFirstPersonCamera, solveChaseCamera, DEFAULT_PITCH, FP_FOV } from "./world-camera";
import { environment } from "./world-environment";
import { palmTree } from "./world-flora";
import { createCharacterAnimator, stepAnimation } from "./skinned-character";
import { FRAG, SHADOW_VERT, SHADOW_VERT_I, SHADOW_FRAG, SKY_VERT, SKY_FRAG, SUN_DIR } from "./world-shaders";
// Camera blockers: thin wall segments only (not whole building footprints), so the chase camera can follow you through a
// doorway and sit inside a room instead of collapsing against your head. Visual only.
const CAM_WALLS = domain_1.BUILDINGS.flatMap((b) => domain_1.buildingWalls(b).map((w) => ({ x: w.x, y: w.y, w: w.w, h: w.h, height: b.height })));
const identity = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
function multiply(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++)
        for (let r = 0; r < 4; r++)
            o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    return o;
}
function perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far), o = new Float32Array(16);
    o[0] = f / aspect;
    o[5] = f;
    o[10] = (far + near) * nf;
    o[11] = -1;
    o[14] = 2 * far * near * nf;
    return o;
}
function lookAt(eye, center, up) {
    const norm = (v) => { const d = Math.hypot(...v) || 1; return [v[0] / d, v[1] / d, v[2] / d]; };
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const z = norm(sub(eye, center)), x = norm(cross(up, z)), y = cross(z, x);
    return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]), -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]), -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]), 1]);
}
function translate(x, y, z) { const m = identity(); m[12] = x; m[13] = y; m[14] = z; return m; }
function scale(x, y, z) { const m = identity(); m[0] = x; m[5] = y; m[10] = z; return m; }
function model(x, y, z, w, h, d, rot = 0) { const s = multiply(translate(x, y, z), scale(w, h, d)); if (!rot) return s; const c = Math.cos(rot), n = Math.sin(rot), r = identity(); r[0] = c; r[2] = -n; r[8] = n; r[10] = c; return multiply(translate(x, y, z), multiply(r, scale(w, h, d))); }
function parseColor(hex) { const n = parseInt(hex.replace("#", ""), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }
function meshData(type) {
    const p = [], n = [];
    const nrm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
    // tri(a,b,c, na[, nb, nc]): per-vertex normals give smooth shading on curved forms; one normal = flat face.
    const tri = (a, b, c, na, nb = na, nc = na) => { [[a, na], [b, nb], [c, nc]].forEach(([v, nn]) => { p.push(...v); n.push(...nn); }); };
    if (type === "box") {
        const faces = [
            [[-.5, -.5, .5], [.5, -.5, .5], [.5, .5, .5], [-.5, .5, .5], [0, 0, 1]],
            [[.5, -.5, -.5], [-.5, -.5, -.5], [-.5, .5, -.5], [.5, .5, -.5], [0, 0, -1]],
            [[-.5, -.5, -.5], [-.5, -.5, .5], [-.5, .5, .5], [-.5, .5, -.5], [-1, 0, 0]],
            [[.5, -.5, .5], [.5, -.5, -.5], [.5, .5, -.5], [.5, .5, .5], [1, 0, 0]],
            [[-.5, .5, .5], [.5, .5, .5], [.5, .5, -.5], [-.5, .5, -.5], [0, 1, 0]],
            [[-.5, -.5, -.5], [.5, -.5, -.5], [.5, -.5, .5], [-.5, -.5, .5], [0, -1, 0]],
        ];
        for (const [a, b, c, d, nn] of faces) {
            tri(a, b, c, nn);
            tri(a, c, d, nn);
        }
    }
    else if (type === "wedge") { // gable prism: ridge along X at y=+.5, eaves at y=-.5 (roofs, pediments)
        const sf = nrm([0, .5, 1]), sb = nrm([0, .5, -1]);
        tri([-.5, -.5, .5], [.5, -.5, .5], [.5, .5, 0], sf); tri([-.5, -.5, .5], [.5, .5, 0], [-.5, .5, 0], sf);
        tri([.5, -.5, -.5], [-.5, -.5, -.5], [-.5, .5, 0], sb); tri([.5, -.5, -.5], [-.5, .5, 0], [.5, .5, 0], sb);
        tri([-.5, -.5, -.5], [-.5, -.5, .5], [-.5, .5, 0], [-1, 0, 0]); tri([.5, -.5, .5], [.5, -.5, -.5], [.5, .5, 0], [1, 0, 0]);
        tri([-.5, -.5, -.5], [.5, -.5, -.5], [.5, -.5, .5], [0, -1, 0]); tri([-.5, -.5, -.5], [.5, -.5, .5], [-.5, -.5, .5], [0, -1, 0]);
    }
    else if (type === "sphere" || type === "lowsphere") {
        const lat = type === "lowsphere" ? 5 : 12, lon = type === "lowsphere" ? 8 : 20;
        for (let y = 0; y < lat; y++)
            for (let x = 0; x < lon; x++) {
                const point = (u, v) => { const ph = v * Math.PI, th = u * Math.PI * 2; return [Math.sin(ph) * Math.cos(th) * .5, Math.cos(ph) * .5, Math.sin(ph) * Math.sin(th) * .5]; };
                const a = point(x / lon, y / lat), b = point((x + 1) / lon, y / lat), c = point((x + 1) / lon, (y + 1) / lat), d = point(x / lon, (y + 1) / lat);
                const na = nrm(a), nb = nrm(b), nc = nrm(c), nd = nrm(d);
                tri(a, b, c, na, nb, nc);
                tri(a, c, d, na, nc, nd);
            }
    }
    else {
        const sides = 20, top = .5, bottom = -.5, cone = type === "cone";
        const sn = (t) => cone ? nrm([Math.cos(t), .5, Math.sin(t)]) : [Math.cos(t), 0, Math.sin(t)];
        for (let i = 0; i < sides; i++) {
            const a = i / sides * Math.PI * 2, b = (i + 1) / sides * Math.PI * 2, mid = (a + b) / 2;
            const p1 = [Math.cos(a) * .5, bottom, Math.sin(a) * .5], p2 = [Math.cos(b) * .5, bottom, Math.sin(b) * .5];
            const p3 = cone ? [0, .5, 0] : [Math.cos(b) * .5, top, Math.sin(b) * .5];
            const p4 = cone ? [0, .5, 0] : [Math.cos(a) * .5, top, Math.sin(a) * .5];
            if (cone) tri(p1, p2, p3, sn(a), sn(b), sn(mid));
            else { tri(p1, p2, p3, sn(a), sn(b), sn(b)); tri(p1, p3, p4, sn(a), sn(b), sn(a)); }
            tri([0, bottom, 0], p2, p1, [0, -1, 0]);
            if (!cone) tri([0, top, 0], p4, p3, [0, 1, 0]);
        }
    }
    return { p, n, count: p.length / 3 };
}
// Chamfered box emitted directly in world space (static batches only): catches light on every edge so buildings
// stop reading as raw cubes. Bottom face/edges are skipped when the box sits on the ground.
function pushBevelBox(t, x, y, z, w, h, d, rot, col, eo) {
    const H = [w / 2, h / 2, d / 2], r = Math.min(.07, Math.min(w, h, d) * .16), noBottom = y - h / 2 <= .12;
    const c = Math.cos(rot || 0), sn = Math.sin(rot || 0), cr = [col[0] + eo, col[1] + eo, col[2] + eo];
    const put = (p, nx, ny, nz) => {
        t.p.push(x + c * p[0] + sn * p[2], y + p[1], z - sn * p[0] + c * p[2]);
        const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
        t.n.push(c * nx + sn * nz, ny, -sn * nx + c * nz); t.c.push(cr[0], cr[1], cr[2]);
    };
    const tri = (a, b, e, nx, ny, nz) => { put(a, nx, ny, nz); put(b, nx, ny, nz); put(e, nx, ny, nz); };
    for (let i = 0; i < 3; i++) for (const sg of [-1, 1]) {
        if (i === 1 && sg === -1 && noBottom) continue;
        const j = (i + 1) % 3, k = (i + 2) % 3, q = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => { const v = [0, 0, 0]; v[i] = sg * H[i]; v[j] = a * (H[j] - r); v[k] = b * (H[k] - r); return v; });
        const nn = [0, 0, 0]; nn[i] = sg;
        tri(q[0], q[1], q[2], nn[0], nn[1], nn[2]); tri(q[0], q[2], q[3], nn[0], nn[1], nn[2]);
    }
    for (const [i, j] of [[0, 1], [0, 2], [1, 2]]) for (const si of [-1, 1]) for (const sj of [-1, 1]) {
        if (noBottom && ((i === 1 && si === -1) || (j === 1 && sj === -1))) continue;
        const k = 3 - i - j, A = [], B = [];
        for (const sk of [-1, 1]) {
            const a = [0, 0, 0], b = [0, 0, 0];
            a[i] = si * H[i]; a[j] = sj * (H[j] - r); a[k] = sk * (H[k] - r);
            b[i] = si * (H[i] - r); b[j] = sj * H[j]; b[k] = sk * (H[k] - r);
            A.push(a); B.push(b);
        }
        const nn = [0, 0, 0]; nn[i] = si; nn[j] = sj;
        tri(A[0], B[0], B[1], nn[0], nn[1], nn[2]); tri(A[0], B[1], A[1], nn[0], nn[1], nn[2]);
    }
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
        if (noBottom && sy === -1) continue;
        tri([sx * H[0], sy * (H[1] - r), sz * (H[2] - r)], [sx * (H[0] - r), sy * H[1], sz * (H[2] - r)], [sx * (H[0] - r), sy * (H[1] - r), sz * H[2]], sx, sy, sz);
    }
}
const VERT = `attribute vec3 aPos; attribute vec3 aNormal; attribute vec3 aColor; varying vec3 vColor; uniform mat4 uMvp; uniform mat4 uModel; varying vec3 vNormal; varying vec3 vWorld; void main(){ vec4 world=uModel*vec4(aPos,1.0); vWorld=world.xyz; vNormal=mat3(uModel)*aNormal; vColor=aColor; gl_Position=uMvp*vec4(aPos,1.0); }`;
// FRAG / SHADOW_* / SKY_* live in ./world-shaders (visual bible v2).
function shader(gl, type, source) { const s = gl.createShader(type); if (!s)
    throw new Error("WebGL shader allocation failed"); gl.shaderSource(s, source); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
    throw new Error(gl.getShaderInfoLog(s) || "WebGL shader failed"); return s; }
function createMesh(gl, type, custom) { const d = custom ?? meshData(type), pb = gl.createBuffer(), nb = gl.createBuffer(), cb = gl.createBuffer(); if (!pb || !nb || !cb)
    throw new Error("WebGL buffer allocation failed"); const up = (buf, arr) => { gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, arr instanceof Float32Array ? arr : new Float32Array(arr), gl.STATIC_DRAW); };
    const count = custom ? custom.positions.length / 3 : d.count;
    up(pb, custom ? custom.positions : d.p); up(nb, custom ? custom.normals : d.n); up(cb, custom ? custom.colors : new Float32Array(count * 3).fill(1));
    return { p: pb, n: nb, c: cb, count }; }
export function createWorld3DRenderer(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl", { alpha: false, antialias: true, depth: true, powerPreference: "low-power" });
    if (!gl)
        throw new Error("WebGL is unavailable on this browser");
    const program = gl.createProgram();
    if (!program)
        throw new Error("WebGL program allocation failed");
    gl.attachShader(program, shader(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, shader(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw new Error(gl.getProgramInfoLog(program) || "WebGL program link failed");
    gl.useProgram(program);
    const loc = { pos: gl.getAttribLocation(program, "aPos"), normal: gl.getAttribLocation(program, "aNormal"), vcolor: gl.getAttribLocation(program, "aColor"), mvp: gl.getUniformLocation(program, "uMvp"), model: gl.getUniformLocation(program, "uModel"), color: gl.getUniformLocation(program, "uColor"), light: gl.getUniformLocation(program, "uLight"), emissive: gl.getUniformLocation(program, "uEmissive"), eye: gl.getUniformLocation(program, "uEye"), alpha: gl.getUniformLocation(program, "uAlpha"), lightVP: gl.getUniformLocation(program, "uLightVP"), shadowOn: gl.getUniformLocation(program, "uShadowOn"), shadowTexel: gl.getUniformLocation(program, "uShadowTexel"), shadowQ: gl.getUniformLocation(program, "uShadowQ"), detail: gl.getUniformLocation(program, "uDetail"), shadowMap: gl.getUniformLocation(program, "uShadowMap") };
    const ext = gl.getExtension("ANGLE_instanced_arrays");
    const nightLoc = gl.getUniformLocation(program, "uNight"); let nightLocI = null; let night = 0; let camClear = 1;
    let iprog = null, iloc = null, ibuf = null;
    const VERT_I = "attribute vec3 aPos; attribute vec3 aNormal; attribute vec3 aColor; attribute vec4 aM0; attribute vec4 aM1; attribute vec4 aM2; attribute vec4 aM3; attribute vec3 aTint; uniform mat4 uVP; varying vec3 vColor; varying vec3 vNormal; varying vec3 vWorld; void main(){ mat4 M=mat4(aM0,aM1,aM2,aM3); vec4 w=M*vec4(aPos,1.0); vWorld=w.xyz; vNormal=mat3(M)*aNormal; vColor=aColor*aTint; gl_Position=uVP*w; }";
    if (ext) {
        try {
            const p2 = gl.createProgram();
            gl.attachShader(p2, shader(gl, gl.VERTEX_SHADER, VERT_I));
            gl.attachShader(p2, shader(gl, gl.FRAGMENT_SHADER, FRAG));
            ["aPos", "aNormal", "aColor", "aM0", "aM1", "aM2", "aM3", "aTint"].forEach((n, i) => gl.bindAttribLocation(p2, i, n));
            gl.linkProgram(p2);
            if (!gl.getProgramParameter(p2, gl.LINK_STATUS)) throw new Error("instanced program link failed");
            iprog = p2; ibuf = gl.createBuffer(); nightLocI = gl.getUniformLocation(p2, "uNight");
            iloc = { vp: gl.getUniformLocation(p2, "uVP"), color: gl.getUniformLocation(p2, "uColor"), light: gl.getUniformLocation(p2, "uLight"), eye: gl.getUniformLocation(p2, "uEye"), emissive: gl.getUniformLocation(p2, "uEmissive"), alpha: gl.getUniformLocation(p2, "uAlpha"), lightVP: gl.getUniformLocation(p2, "uLightVP"), shadowOn: gl.getUniformLocation(p2, "uShadowOn"), shadowTexel: gl.getUniformLocation(p2, "uShadowTexel"), shadowQ: gl.getUniformLocation(p2, "uShadowQ"), detail: gl.getUniformLocation(p2, "uDetail"), shadowMap: gl.getUniformLocation(p2, "uShadowMap") };
            gl.useProgram(program);
        } catch (e) { iprog = null; }
    }
    // ---- Material-detail textures (paving / grass / wall): original tileable PNGs, units 1-3. Neutral 1x1 until loaded; uTexOn gates the shader. Failure just leaves the procedural look. ----
    const texUnits = [["uTexP", 1, "detail_paving"], ["uTexG", 2, "detail_grass"], ["uTexW", 3, "detail_wall"], ["uTexR", 4, "detail_roof"]];
    const setTexUniforms = (on) => { for (const pr of [program, iprog]) { if (!pr) continue; gl.useProgram(pr); texUnits.forEach(([n, u]) => gl.uniform1i(gl.getUniformLocation(pr, n), u)); gl.uniform1f(gl.getUniformLocation(pr, "uTexOn"), on); } gl.useProgram(program); };
    try {
        const texs = texUnits.map(([, u]) => { gl.activeTexture(gl.TEXTURE0 + u); const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([128, 128, 128, 255])); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); return t; });
        gl.activeTexture(gl.TEXTURE0); setTexUniforms(0);
        if (typeof Image !== "undefined") {
            const aniso = gl.getExtension("EXT_texture_filter_anisotropic"); let loaded = 0;
            texUnits.forEach(([, u, name], i) => {
                const im = new Image();
                im.onload = () => { try {
                    gl.activeTexture(gl.TEXTURE0 + u); gl.bindTexture(gl.TEXTURE_2D, texs[i]);
                    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im); gl.generateMipmap(gl.TEXTURE_2D);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                    if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(4, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT) || 1));
                    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.BROWSER_DEFAULT_WEBGL);
                    gl.activeTexture(gl.TEXTURE0);
                    if (++loaded === texUnits.length) setTexUniforms(1);
                } catch (e) { /* keep procedural look */ } };
                im.src = `/assets/textures/${name}.png`;
            });
        }
    } catch (e) { /* no detail textures */ }
    // ---- Sun shadow map (WEBGL_depth_texture) and sky dome. Any failure just disables the feature. ----
    const makeProgram = (vs, fs, binds) => { const pr = gl.createProgram(); gl.attachShader(pr, shader(gl, gl.VERTEX_SHADER, vs)); gl.attachShader(pr, shader(gl, gl.FRAGMENT_SHADER, fs)); (binds || []).forEach(([nm, i]) => gl.bindAttribLocation(pr, i, nm)); gl.linkProgram(pr); if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error("program link failed"); return pr; };
    let shadowOn = false, shadowFbo = null, shadowDepth = null, shadowColor = null, shadowSize = 0, sprog = null, sprogI = null, sloc = null, slocI = null, skyProg = null, skyLoc = null, skyBuf = null, sdynBuf = null, sdynCount = 0;
    let shadowList = [], shadowInst = [], dynShadowP = [], lightVP = identity(), trisFrame = 0;
    try {
        if (gl.getExtension("WEBGL_depth_texture") || gl.getExtension("WEBKIT_WEBGL_depth_texture")) {
            sprog = makeProgram(SHADOW_VERT, SHADOW_FRAG, [["aPos", 0]]); sloc = { mvp: gl.getUniformLocation(sprog, "uMvp") };
            if (ext) { sprogI = makeProgram(SHADOW_VERT_I, SHADOW_FRAG, [["aPos", 0], ["aM0", 3], ["aM1", 4], ["aM2", 5], ["aM3", 6]]); slocI = { vp: gl.getUniformLocation(sprogI, "uVP") }; }
            sdynBuf = gl.createBuffer(); shadowOn = true;
        }
    } catch (e) { shadowOn = false; }
    try {
        skyProg = makeProgram(SKY_VERT, SKY_FRAG, [["aP", 0]]);
        skyLoc = { f: gl.getUniformLocation(skyProg, "uF"), r: gl.getUniformLocation(skyProg, "uR"), u: gl.getUniformLocation(skyProg, "uU"), tan: gl.getUniformLocation(skyProg, "uTan"), aspect: gl.getUniformLocation(skyProg, "uAspect"), sun: gl.getUniformLocation(skyProg, "uSun"), night: gl.getUniformLocation(skyProg, "uNight"), time: gl.getUniformLocation(skyProg, "uTime") };
        skyBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, skyBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    } catch (e) { skyProg = null; }
    const ensureShadow = (size) => {
        try {
            if (shadowFbo) { gl.deleteFramebuffer(shadowFbo); gl.deleteTexture(shadowDepth); gl.deleteTexture(shadowColor); }
            const mk = (internal, fmt, type) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, internal, size, size, 0, fmt, type, null); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; };
            shadowDepth = mk(gl.DEPTH_COMPONENT, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT);
            shadowColor = mk(gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE);
            shadowFbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFbo);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, shadowColor, 0);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, shadowDepth, 0);
            const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            shadowSize = size; if (!ok) shadowOn = false;
        } catch (e) { shadowOn = false; }
    };
    const meshes = { dyn: null, box: createMesh(gl, "box"), sphere: createMesh(gl, "sphere"), lowsphere: createMesh(gl, "lowsphere"), cone: createMesh(gl, "cone"), cylinder: createMesh(gl, "cylinder"), wedge: createMesh(gl, "wedge") };
    meshes.dyn = createMesh(gl, "custom", { positions: new Float32Array(9), normals: new Float32Array(9), colors: new Float32Array(9) });
    // Streamed GLB models: slot ("prop:tree") -> loaded mesh. Missing/failed slots fall back to the code-drawn shapes.
    const slotToName = {};
    const registerMesh = (name, data, slot, entry) => { unregisterMesh(name); meshes[name] = createMesh(gl, "custom", data); slotToName[slot] = { name, entry }; };
    const unregisterMesh = (name) => { const m = meshes[name]; if (!m) return; gl.deleteBuffer(m.p); gl.deleteBuffer(m.n); gl.deleteBuffer(m.c); delete meshes[name]; for (const k of Object.keys(slotToName)) if (slotToName[k].name === name) delete slotToName[k]; };
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(.70, .85, .97, 1);
    gl.uniform3f(loc.light, SUN_DIR[0], SUN_DIR[1], SUN_DIR[2]);
    let width = canvas.clientWidth || 800, height = canvas.clientHeight || 600;
    let pixelRatioCap = 1.25; let shadowQ = 1; let detailQ = 1; // detailQ: 0 low, .6 medium (no bump maps), 1 high
    const resize = () => { const dpr = Math.min(window.devicePixelRatio || 1, pixelRatioCap); width = Math.max(1, canvas.clientWidth); height = Math.max(1, canvas.clientHeight); canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); gl.viewport(0, 0, canvas.width, canvas.height); };
    resize();
    let curAlpha = 1, calls = 0, recorder = null;
    const callBy = {};
    const cpu = { box: meshData("box"), sphere: meshData("sphere"), lowsphere: meshData("lowsphere"), cone: meshData("cone"), cylinder: meshData("cylinder"), wedge: meshData("wedge") };
    const bakedCache = new Map();
    const drawBaked = (key, fn, vp) => {
        if (!bakedCache.has(key)) {
            recorder = { p: [], n: [], c: [] };
            try { fn(); } finally {
                const rec = recorder; recorder = null;
                commitRec(key, rec);
            }
        }
        if (bakedCache.get(key)) { if (meshes[key]) draw(key, 0, 0, 0, 1, 1, 1, "#ffffff", vp); if (meshes[key + "|g"]) draw(key + "|g", 0, 0, 0, 1, 1, 1, "#ffffff", vp, .15); return 1; }
        return 0;
    };
    const commitRec = (key, rec) => {
        const mk = (r) => createMesh(gl, "custom", { positions: new Float32Array(r.p), normals: new Float32Array(r.n), colors: new Float32Array(r.c) });
        if (rec.p.length) meshes[key] = mk(rec);
        if (rec.g && rec.g.p.length) meshes[key + "|g"] = mk(rec.g);
        bakedCache.set(key, rec.p.length > 0 || !!(rec.g && rec.g.p.length));
    };
    // Per-frame dynamic batch (avatars, birds): primitives recorded then drawn in ONE call.
    const beginDyn = () => { recorder = { p: [], n: [], c: [] }; };
    const flushDyn = (vp) => {
        const r = recorder; recorder = null; if (!r || !r.p.length) return;
        const m = meshes.dyn, up = (buf, a) => { gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(a), gl.DYNAMIC_DRAW); };
        up(m.p, r.p); up(m.n, r.n); up(m.c, r.c); m.count = r.p.length / 3;
        if (shadowOn) dynShadowP = dynShadowP.concat(r.p);
        draw("dyn", 0, 0, 0, 1, 1, 1, "#ffffff", vp);
    };
    const renderer_chunks = { solids: null, keys: new Map() };
    const draw = (shape, x, y, z, w, h, d, color, viewProjection, emissive = 0, rot = 0) => {
        if (recorder && cpu[shape]) {
            // Static-batch recording: bake the transformed primitive (with colour) into one merged mesh.
            const mm = model(x, y, z, w, h, d, rot), col = parseColor(color), src = cpu[shape], tgt = recorder, eo = emissive > 0 ? 2 : 0; // emissive geometry shares the mesh: flagged by +2 on colour (see FRAG)
            if (shape === "box" && (globalThis.__campusBevelMin ?? .3) < 9 && Math.min(w, h, d) >= (globalThis.__campusBevelMin ?? .3)) { pushBevelBox(tgt, x, y, z, w, h, d, rot, col, eo); return; }
            for (let i = 0; i < src.count; i++) {
                const px = src.p[i * 3], py = src.p[i * 3 + 1], pz = src.p[i * 3 + 2], nx = src.n[i * 3] / (w || 1), ny = src.n[i * 3 + 1] / (h || 1), nz = src.n[i * 3 + 2] / (d || 1);
                tgt.p.push(mm[0] * px + mm[4] * py + mm[8] * pz + mm[12], mm[1] * px + mm[5] * py + mm[9] * pz + mm[13], mm[2] * px + mm[6] * py + mm[10] * pz + mm[14]);
                let tx = mm[0] * nx + mm[4] * ny + mm[8] * nz, ty = mm[1] * nx + mm[5] * ny + mm[9] * nz, tz = mm[2] * nx + mm[6] * ny + mm[10] * nz;
                const nl = Math.hypot(tx, ty, tz) || 1;
                tgt.n.push(tx / nl, ty / nl, tz / nl);
                tgt.c.push(col[0] + eo, col[1] + eo, col[2] + eo);
            }
            return;
        }
        const m = model(x, y, z, w, h, d, rot), mvp = multiply(viewProjection, m), mesh = meshes[shape];
        gl.bindBuffer(gl.ARRAY_BUFFER, mesh.p);
        gl.enableVertexAttribArray(loc.pos);
        gl.vertexAttribPointer(loc.pos, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, mesh.n);
        gl.enableVertexAttribArray(loc.normal);
        gl.vertexAttribPointer(loc.normal, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, mesh.c);
        gl.enableVertexAttribArray(loc.vcolor);
        gl.vertexAttribPointer(loc.vcolor, 3, gl.FLOAT, false, 0, 0);
        gl.uniformMatrix4fv(loc.model, false, m);
        gl.uniformMatrix4fv(loc.mvp, false, mvp);
        gl.uniform3fv(loc.color, parseColor(color));
        gl.uniform1f(loc.emissive, emissive);
        gl.uniform1f(loc.alpha, curAlpha);
        gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
        calls++; trisFrame += mesh.count / 3;
        if (shadowOn && curAlpha >= 1 && emissive < .5 && shape !== "dyn" && !shape.endsWith("|g") && !shape.startsWith("clouds") && !((shape === "box" || shape === "cylinder") && h < .3)) shadowList.push(mesh, m);
        if (globalThis.__campusCallTrace) { const st = (new Error().stack || "").split("\n").slice(2, 4).map((l) => l.trim().replace(/^.*:(\d+:\d+)\)?$/, "$1")).join(">"); callBy["@" + st] = (callBy["@" + st] || 0) + 1; }
        callBy[shape.length > 18 ? shape.split('|')[0] : shape] = (callBy[shape.length > 18 ? shape.split('|')[0] : shape] || 0) + 1;
        { const tk = "t:" + (shape.length > 18 ? shape.split('|')[0] : shape); callBy[tk] = (callBy[tk] || 0) + Math.round(mesh.count / 3); }
    };
    const box = (x, z, w, d, h, color, vp, y = 0) => draw("box", x + w / 2, y + h / 2, z + d / 2, w, h, d, color, vp);
    const floor = (x, z, w, d, color, vp, y = 0.025) => box(x, z, w, d, .05, color, vp, y);
    const mkP = (vp) => ({ box: (x, z, w, d, h, c, y0 = 0) => draw("box", x + w / 2, y0 + h / 2, z + d / 2, w, h, d, c, vp), cyl: (cx, cz, w, h, c, y0 = 0) => draw("cylinder", cx, y0 + h / 2, cz, w, h, w, c, vp), sph: (cx, cy, cz, w, h, d, c) => draw("sphere", cx, cy, cz, w, h, d, c, vp), rbox: (cx, cy, cz, w, h, d, c, rot) => draw("box", cx, cy, cz, w, h, d, c, vp, 0, rot), rsph: (cx, cy, cz, w, h, d, c, rot) => draw("sphere", cx, cy, cz, w, h, d, c, vp, 0, rot), lbox: (x, z, w, d, h, c, y0 = 0) => draw("box", x + w / 2, y0 + h / 2, z + d / 2, w, h, d, c, vp, .15), lsph: (cx, cy, cz, w, h, d, c) => draw("sphere", cx, cy, cz, w, h, d, c, vp, .15) });
    // Cheap grounded shadows: translucent, depth-write-free decals (no shadow-map cost).
    // Decal shadows are collected per alpha and drawn in ONE call per alpha bucket (flushShadows), instead of one call per shadow.
    const shadowBuckets = new Map();
    const addShadow = (a, shape, x, y, z, w, h, d, color, vp) => {
        const key = Math.round(a * 100); let r = shadowBuckets.get(key);
        if (!r) shadowBuckets.set(key, r = { a, p: [], n: [], c: [] });
        const prev = recorder; recorder = r; draw(shape, x, y, z, w, h, d, color, vp); recorder = prev;
    };
    const softShadow = (x, z, r, vp, a = .28) => { if (shadowOn || (recorder && !recorder.shadowOk)) return; addShadow(a, "cylinder", x, .075, z, r * 2, .02, r * 1.6, "#0f2a1c", vp); };
    const slabShadow = (x, z, w, d, vp, a = .26) => { if (shadowOn || (recorder && !recorder.shadowOk)) return; addShadow(a, "box", x + w / 2, .095, z + d / 2, w, .02, d, "#0f2a1c", vp); };
    const flushShadows = (vp) => {
        if (!shadowBuckets.size) return;
        const m = meshes.dyn, up = (buf, arr) => { gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.DYNAMIC_DRAW); };
        gl.depthMask(false);
        for (const r of shadowBuckets.values()) {
            if (!r.p.length) continue;
            up(m.p, r.p); up(m.n, r.n); up(m.c, r.c); m.count = r.p.length / 3;
            curAlpha = r.a; draw("dyn", 0, 0, 0, 1, 1, 1, "#ffffff", vp);
        }
        curAlpha = 1; gl.depthMask(true); shadowBuckets.clear();
    };
    const buckets = new Map();
    const queue = (name, x, y, z, w, h, d, rot) => { let l = buckets.get(name); if (!l) buckets.set(name, l = []); l.push(x, y, z, w, h, d, rot); };
    let lastEye = [0, 0, 0];
    // Instanced flush: repeated models (palms, lamps, hedges, planters...) cost one draw call per model type.
    const flushInstances = (vp) => {
        for (const [name, l] of buckets) {
            const mesh = meshes[name]; if (!mesh) continue;
            const n = l.length / 7;
            if (!iprog || n < 2) { for (let i = 0; i < n; i++) draw(name, l[i * 7], l[i * 7 + 1], l[i * 7 + 2], l[i * 7 + 3], l[i * 7 + 4], l[i * 7 + 5], "#ffffff", vp, 0, l[i * 7 + 6]); continue; }
            const data = new Float32Array(n * 19);
            for (let i = 0; i < n; i++) { const m = model(l[i * 7], l[i * 7 + 1], l[i * 7 + 2], l[i * 7 + 3], l[i * 7 + 4], l[i * 7 + 5], l[i * 7 + 6]); data.set(m, i * 19); data[i * 19 + 16] = 1; data[i * 19 + 17] = 1; data[i * 19 + 18] = 1; }
            if (shadowOn) shadowInst.push(mesh, data, n);
            gl.useProgram(iprog);
            gl.uniformMatrix4fv(iloc.vp, false, vp); gl.uniform3f(iloc.color, 1, 1, 1); gl.uniform3f(iloc.light, SUN_DIR[0], SUN_DIR[1], SUN_DIR[2]); gl.uniform1i(iloc.shadowMap, 0); gl.uniformMatrix4fv(iloc.lightVP, false, lightVP); gl.uniform1f(iloc.shadowOn, shadowOn ? 1 : 0); gl.uniform1f(iloc.shadowTexel, 1 / Math.max(1, shadowSize)); gl.uniform1f(iloc.shadowQ, shadowQ); gl.uniform1f(iloc.detail, detailQ); gl.uniform3f(iloc.eye, lastEye[0], lastEye[1], lastEye[2]); gl.uniform1f(nightLocI, night); gl.uniform1f(iloc.emissive, 0); gl.uniform1f(iloc.alpha, 1);
            [[mesh.p, 0], [mesh.n, 1], [mesh.c, 2]].forEach(([buf, loc]) => { gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0); ext.vertexAttribDivisorANGLE(loc, 0); });
            gl.bindBuffer(gl.ARRAY_BUFFER, ibuf); gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
            for (let k = 0; k < 4; k++) { gl.enableVertexAttribArray(3 + k); gl.vertexAttribPointer(3 + k, 4, gl.FLOAT, false, 76, k * 16); ext.vertexAttribDivisorANGLE(3 + k, 1); }
            gl.enableVertexAttribArray(7); gl.vertexAttribPointer(7, 3, gl.FLOAT, false, 76, 64); ext.vertexAttribDivisorANGLE(7, 1);
            ext.drawArraysInstancedANGLE(gl.TRIANGLES, 0, mesh.count, n);
            calls++; trisFrame += n * mesh.count / 3;
            for (let k = 3; k < 8; k++) { ext.vertexAttribDivisorANGLE(k, 0); gl.disableVertexAttribArray(k); }
            gl.useProgram(program);
        }
    };
    const hash2 = (x, z) => { const v = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return v - Math.floor(v); };
    const overlayLabels = (ctx, input, vp) => {
        if (!ctx)
            return 0;
        ctx.clearRect(0, 0, input.width, input.height);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        let labels = 0;
        const project = (x, y, z) => { const a = vp[0] * x + vp[4] * y + vp[8] * z + vp[12], b = vp[1] * x + vp[5] * y + vp[9] * z + vp[13], c = vp[3] * x + vp[7] * y + vp[11] * z + vp[15]; if (c <= 0)
            return null; return { x: (a / c * .5 + .5) * input.width, y: (1 - (b / c * .5 + .5)) * input.height }; };
        let labelledNpcs = 0;
        const npcLimit = domain_1.QUALITY_PROFILES[input.quality]?.npcs ?? 6;
        for (const e of input.entities) {
            if (e.npc && ++labelledNpcs > npcLimit) continue;
            const p = project(e.x, e.npc ? 1.95 : 2.1, e.y);
            if (!p || p.x < 0 || p.x > input.width || p.y < 0 || p.y > input.height)
                continue;
            const text = e.name;
            ctx.font = `700 ${Math.max(10, Math.min(13, input.width / 75))}px system-ui`;
            const w = ctx.measureText(text).width + 16;
            ctx.fillStyle = "rgba(9,18,39,.82)";
            ctx.beginPath();
            ctx.roundRect(p.x - w / 2, p.y - 10, w, 20, 6);
            ctx.fill();
            ctx.fillStyle = e.tagColor;
            ctx.fillRect(p.x - w / 2, p.y - 10, 3, 20);
            ctx.fillStyle = e.id === input.meId ? "#ffffff" : e.npc ? "#d7e2fa" : "#f6f8ff";
            ctx.fillText(text, p.x, p.y);
            if (e.emote) { // emote = its own gold pill, stacked above the nameplate
                const et = String(e.emote).toUpperCase(), ew = ctx.measureText(et).width + 14, ey = p.y - 10 - 4 - 9;
                ctx.fillStyle = "#ffd166";
                ctx.beginPath();
                ctx.roundRect(p.x - ew / 2, ey - 9, ew, 18, 9);
                ctx.fill();
                ctx.fillStyle = "#3b2a00";
                ctx.fillText(et, p.x, ey);
            }
            labels++;
        }
        // Building names: nearest first, hero buildings ahead of numbered rooms, capped per quality, and never overlapping another name.
        {
            const cap = input.quality === "low" ? 3 : input.quality === "medium" ? 6 : 9, maxD = input.quality === "low" ? 20 : 38;
            ctx.font = "800 11px system-ui";
            const cands = [];
            for (const b of domain_1.BUILDINGS) {
                const d = Math.hypot(b.x + b.w / 2 - input.camX, b.y + b.h / 2 - input.camY);
                if (d > maxD) continue;
                const t = project(b.x + b.w / 2, b.height + 1.8, b.y + b.h);
                if (!t || t.x < 0 || t.x > input.width || t.y < 0 || t.y > input.height) continue;
                cands.push({ b, t, k: d + (/ROOM|BLOCK [A-Z]\b/i.test(String(b.name)) ? 16 : 0) });
            }
            cands.sort((m, n) => m.k - n.k);
            const placed = [];
            for (const { b, t } of cands) {
                if (placed.length >= cap) break;
                const txt = String(b.name).toUpperCase(), w = ctx.measureText(txt).width + 18;
                const r = { x0: t.x - w / 2 - 3, x1: t.x + w / 2 + 3, y0: t.y - 13, y1: t.y + 13 };
                if (placed.some((o) => r.x0 < o.x1 && r.x1 > o.x0 && r.y0 < o.y1 && r.y1 > o.y0)) continue;
                placed.push(r);
                ctx.fillStyle = "rgba(9,18,39,.78)"; ctx.beginPath(); ctx.roundRect(t.x - w / 2, t.y - 10, w, 20, 8); ctx.fill();
                ctx.fillStyle = b.color; ctx.fillRect(t.x - w / 2 + 5, t.y - 4, 3, 8);
                ctx.fillStyle = "#ffffff"; ctx.fillText(txt, t.x + 3, t.y);
                labels++;
            }
        }
        // Activity markers: nearest first, capped per quality, never overlapping another marker, faded with distance (was: every point within 48-72 m, which piled dozens of QUIZ/REACTION pills on screen).
        {
            const maxD = input.quality === "low" ? 16 : input.quality === "high" ? 30 : 24, cap = input.quality === "low" ? 3 : input.quality === "high" ? 7 : 5;
            const near = [];
            for (const p of domain_1.INTERACTION_POINTS) {
                const active = p.id === input.activeHuntPointId;
                if (p.hidden && !active) continue;
                const d = Math.hypot(p.x - input.camX, p.y - input.camY);
                if (d > maxD && !active) continue;
                const t = project(p.x, 0.35, p.y);
                if (!t || t.x < 0 || t.x > input.width || t.y < 0 || t.y > input.height) continue;
                near.push({ p, t, d: active ? -1 : d });
            }
            near.sort((m, n) => m.d - n.d);
            const taken = [];
            ctx.font = "800 10px system-ui";
            for (const { p, t, d } of near) {
                if (taken.length >= cap) break;
                const label = p.activity === "quiz" ? "QUIZ" : p.activity === "reaction" ? "REACTION" : p.activity === "hunt" ? "HUNT" : p.activity === "shootout" ? "SHOOTOUT" : String(p.name || "INFO").toUpperCase().slice(0, 16);
                const w = ctx.measureText(label).width + 12;
                const r = { x0: t.x - w / 2 - 4, x1: t.x + w / 2 + 4, y0: t.y - 11, y1: t.y + 11 };
                if (taken.some((o) => r.x0 < o.x1 && r.x1 > o.x0 && r.y0 < o.y1 && r.y1 > o.y0)) continue;
                taken.push(r);
                ctx.globalAlpha = d < 0 ? 1 : Math.max(.35, 1 - Math.max(0, d - maxD * .55) / (maxD * .6));
                ctx.fillStyle = "rgba(9,18,39,.85)";
                ctx.beginPath();
                ctx.roundRect(t.x - w / 2, t.y - 7, w, 14, 5);
                ctx.fill();
                ctx.fillStyle = p.activity === "quiz" ? "#78fff4" : p.activity === "reaction" ? "#ffe29b" : p.activity === "hunt" ? "#a7ddff" : p.activity === "shootout" ? "#d3e1ff" : "#fff";
                ctx.fillText(label, t.x, t.y);
                labels++;
            }
            ctx.globalAlpha = 1;
        }
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        return labels;
    };
    const motion = new Map();
    // Skinned character (optional). Until a model is registered, or when it is unavailable / quality is low, the code-drawn box avatar is used.
    let character = null, characterLod = null;
    const setSkinnedCharacter = (model, lodModel) => { character = model ? createCharacterAnimator(model) : null; characterLod = model && lodModel && lodModel.jointCount === model.jointCount ? createCharacterAnimator(lodModel) : null; };
    // Depth-only pass from the sun using LAST frame's casters (one-frame lag, texel-snapped so it never shimmers).
    const shadowPass = (center, q) => {
        if (!shadowOn) return;
        const size = q === "high" ? 2048 : 1024;
        if (size !== shadowSize) ensureShadow(size);
        if (!shadowOn) return;
        shadowQ = q === "high" ? 2 : q === "medium" ? 1 : 0;
        const R = q === "high" ? 48 : q === "medium" ? 40 : 34, texel = 2 * R / size;
        const Ln = Math.hypot(...SUN_DIR), Lv = [SUN_DIR[0] / Ln, SUN_DIR[1] / Ln, SUN_DIR[2] / Ln];
        let rx = Lv[2], rz = -Lv[0]; const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl; // cross([0,1,0], L)
        const right = [rx, 0, rz], up = [Lv[1] * rz, Lv[2] * rx - Lv[0] * rz, -Lv[1] * rx];
        const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
        const sx = Math.round(dot(center, right) / texel) * texel, su = Math.round(dot(center, up) / texel) * texel, sl = dot(center, Lv);
        const c2 = [right[0] * sx + up[0] * su + Lv[0] * sl, right[1] * sx + up[1] * su + Lv[1] * sl, right[2] * sx + up[2] * su + Lv[2] * sl];
        const eyeL = [c2[0] + Lv[0] * 130, c2[1] + Lv[1] * 130, c2[2] + Lv[2] * 130];
        const near = 1, far = 270, ortho = identity();
        ortho[0] = 1 / R; ortho[5] = 1 / R; ortho[10] = -2 / (far - near); ortho[14] = -(far + near) / (far - near);
        lightVP = multiply(ortho, lookAt(eyeL, c2, [0, 1, 0]));
        gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFbo);
        gl.viewport(0, 0, shadowSize, shadowSize);
        gl.colorMask(false, false, false, false); gl.disable(gl.BLEND); gl.depthMask(true); gl.clearDepth(1); gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.useProgram(sprog);
        gl.enableVertexAttribArray(0);
        for (let i = 0; i < shadowList.length; i += 2) {
            const mesh = shadowList[i], m = shadowList[i + 1];
            gl.bindBuffer(gl.ARRAY_BUFFER, mesh.p); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
            gl.uniformMatrix4fv(sloc.mvp, false, multiply(lightVP, m));
            gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
        }
        if (sdynCount > 0) {
            gl.bindBuffer(gl.ARRAY_BUFFER, sdynBuf); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
            gl.uniformMatrix4fv(sloc.mvp, false, lightVP); gl.drawArrays(gl.TRIANGLES, 0, sdynCount);
        }
        if (sprogI && shadowInst.length) {
            gl.useProgram(sprogI); gl.uniformMatrix4fv(slocI.vp, false, lightVP);
            for (let i = 0; i < shadowInst.length; i += 3) {
                const mesh = shadowInst[i], data = shadowInst[i + 1], n = shadowInst[i + 2];
                gl.bindBuffer(gl.ARRAY_BUFFER, mesh.p); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0); ext.vertexAttribDivisorANGLE(0, 0);
                gl.bindBuffer(gl.ARRAY_BUFFER, ibuf); gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
                for (let k = 0; k < 4; k++) { gl.enableVertexAttribArray(3 + k); gl.vertexAttribPointer(3 + k, 4, gl.FLOAT, false, 76, k * 16); ext.vertexAttribDivisorANGLE(3 + k, 1); }
                ext.drawArraysInstancedANGLE(gl.TRIANGLES, 0, mesh.count, n);
            }
            for (let k = 3; k < 7; k++) { ext.vertexAttribDivisorANGLE(k, 0); gl.disableVertexAttribArray(k); }
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.colorMask(true, true, true, true); gl.enable(gl.BLEND);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, shadowDepth);
        gl.useProgram(program);
    };
    const render = (input, overlay) => {
        const q = input.quality ?? "medium";
        detailQ = (input.quality ?? "medium") === "high" ? 1 : (input.quality ?? "medium") === "low" ? 0 : .6;
        calls = 0; trisFrame = 0; for (const k in callBy) delete callBy[k]; buckets.clear(); shadowBuckets.clear();
        pixelRatioCap = q === "low" ? 0.85 : q === "high" ? 1.5 : 1.2;
        const dpr = Math.min(window.devicePixelRatio || 1, pixelRatioCap);
        if (canvas.width !== Math.round(input.width * dpr) || canvas.height !== Math.round(input.height * dpr))
            resize();
        gl.viewport(0, 0, canvas.width, canvas.height);
        const nTarget = input.lighting === "night" ? 1 : input.lighting === "festival" ? .85 : 0, fest = input.lighting === "festival";
        night += (nTarget - night) * .06; if (Math.abs(nTarget - night) < .005) night = nTarget;
        gl.clearColor(.70 - .65 * night, .85 - .78 * night, .97 - .81 * night, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        // Collision-aware orbit: eases in fast when a wall intrudes, out slowly so the view never pops.
        // Walk cameras (first-person / chase) look where the avatar looks; "orbit" is the legacy overview.
        const camMode = input.camMode === "fp" || input.camMode === "chase" ? input.camMode : "orbit", walkCam = camMode !== "orbit", fpCam = camMode === "fp";
        let eye, target, fov = Math.PI / 3;
        if (walkCam) {
            const wi = { x: input.camX, y: input.camY, heading: input.camHeading ?? 0, look: input.camLook ?? 0, bob: input.camBob ?? 0 };
            if (fpCam) { const c = solveFirstPersonCamera(wi); eye = c.eye; target = c.target; fov = FP_FOV; }
            else { const c = solveChaseCamera({ ...wi, boxes: CAM_WALLS }); camClear += (c.clearance - camClear) * (c.clearance < camClear ? .6 : .1); eye = solveChaseCamera({ ...wi, boxes: [], dist: 4.3 * camClear }).eye; target = c.target; fov = 1.1; }
        } else {
            const base = { camX: input.camX, camY: input.camY, yaw: input.camYaw ?? 0, pitch: input.camPitch ?? DEFAULT_PITCH, zoom: input.zoom ?? 1, worldW: domain_1.WORLD.width, worldH: domain_1.WORLD.height };
            const cam = solveOrbitCamera({ ...base, boxes: domain_1.BUILDINGS });
            camClear += (cam.clearance - camClear) * (cam.clearance < camClear ? .5 : .08); if (Math.abs(cam.clearance - camClear) < .002) camClear = cam.clearance;
            target = cam.target; eye = solveOrbitCamera({ ...base, boxes: [], scale: camClear }).eye;
        }
        const aspect = Math.max(.2, input.width / input.height);
        const view = lookAt(eye, target, [0, 1, 0]), proj = perspective(fov, aspect, walkCam ? .12 : .1, walkCam ? 150 : 170), vp = multiply(proj, view);
        // Heading frustum for culling in walk views: anything clearly behind or beside the view cone is skipped (static meshes only; labels/entities have their own rules).
        const hdg = walkCam ? (input.camHeading ?? 0) : 0, fwdX = Math.sin(hdg), fwdZ = Math.cos(hdg), halfH = Math.atan(Math.tan(fov / 2) * aspect) + .42;
        const inCone = (x, z, pad) => { if (!walkCam) return true; const dx = x - eye[0], dz = z - eye[2], d = Math.hypot(dx, dz); if (d <= pad + 6) return true; const ang = Math.acos(Math.max(-1, Math.min(1, (dx * fwdX + dz * fwdZ) / d))); return ang <= halfH + Math.asin(Math.min(1, pad / d)); };
        if (skyProg) {
            const fw = [target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]], fl = Math.hypot(...fw) || 1, F = [fw[0] / fl, fw[1] / fl, fw[2] / fl];
            let R = [-F[2], 0, F[0]]; const rl = Math.hypot(...R) || 1; R = [R[0] / rl, 0, R[2] / rl];
            const U = [R[1] * F[2] - R[2] * F[1], R[2] * F[0] - R[0] * F[2], R[0] * F[1] - R[1] * F[0]];
            gl.disable(gl.DEPTH_TEST); gl.depthMask(false); gl.useProgram(skyProg);
            gl.uniform3f(skyLoc.f, F[0], F[1], F[2]); gl.uniform3f(skyLoc.r, R[0], R[1], R[2]); gl.uniform3f(skyLoc.u, U[0], U[1], U[2]);
            gl.uniform1f(skyLoc.tan, Math.tan(fov / 2)); gl.uniform1f(skyLoc.aspect, aspect);
            gl.uniform3f(skyLoc.sun, SUN_DIR[0], SUN_DIR[1], SUN_DIR[2]); gl.uniform1f(skyLoc.night, night); gl.uniform1f(skyLoc.time, input.time || 0);
            gl.bindBuffer(gl.ARRAY_BUFFER, skyBuf); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            gl.enable(gl.DEPTH_TEST); gl.depthMask(true);
        }
        shadowPass(walkCam ? [eye[0] + fwdX * 14, 0, eye[2] + fwdZ * 14] : target, q);
        shadowList = []; shadowInst = [];
        gl.useProgram(program);
        gl.uniform3f(loc.eye, eye[0], eye[1], eye[2]); lastEye = eye; gl.uniform1f(nightLoc, night);
        gl.uniform1i(loc.shadowMap, 0); gl.uniformMatrix4fv(loc.lightVP, false, lightVP); gl.uniform1f(loc.shadowOn, shadowOn ? 1 : 0); gl.uniform1f(loc.shadowTexel, 1 / Math.max(1, shadowSize)); gl.uniform1f(loc.shadowQ, shadowQ); gl.uniform1f(loc.detail, detailQ);
        floor(-140, -120, domain_1.WORLD.width + 280, domain_1.WORLD.height + 250, "#5f8f48", vp, -.2); // outer ground so the horizon is land, not clear-colour
        {
            // Surrounding environment (treeline, distant wings, skyline, hills): ONE baked mesh per quality.
            const ekey = "env|" + q;
            if (!bakedCache.has(ekey)) {
                recorder = { p: [], n: [], c: [] };
                try {
                    environment({
                        box: (x0, z0, w, d, h, color, y0 = 0) => draw("box", x0 + w / 2, y0 + h / 2, z0 + d / 2, w, h, d, color, vp),
                        cyl: (cx, cz, w, h, color, y0 = 0) => draw("cylinder", cx, y0 + h / 2, cz, w, h, w, color, vp),
                        sph: (cx, cy2, cz, w, h, d, color) => draw("lowsphere", cx, cy2, cz, w, h, d, color, vp),
                        rbox: (cx, cy2, cz, w, h, d, color, rot) => draw("box", cx, cy2, cz, w, h, d, color, vp, 0, rot),
                        lbox: (x0, z0, w, d, h, color, y0 = 0) => draw("box", x0 + w / 2, y0 + h / 2, z0 + d / 2, w, h, d, color, vp, .15),
                        lsph: (cx, cy2, cz, w, h, d, color) => draw("sphere", cx, cy2, cz, w, h, d, color, vp, .15),
                    }, q);
                } finally { const rec = recorder; recorder = null; commitRec(ekey, rec); }
            }
            if (bakedCache.get(ekey)) { if (meshes[ekey]) draw(ekey, 0, 0, 0, 1, 1, 1, "#ffffff", vp); if (meshes[ekey + "|g"]) draw(ekey + "|g", 0, 0, 0, 1, 1, 1, "#ffffff", vp, .15); }
        }
        floor(0, 0, domain_1.WORLD.width, domain_1.WORLD.height, "#5c9142", vp, -.12);
        // Zone floors create a readable, colourful campus plan without flattening the perspective.
        for (const z of domain_1.ZONES)
            floor(z.x, z.y, z.w, z.h, z.id === "student_commons" ? "#63a04c" : z.id === "main_gate" ? "#6d9a5a" : z.id === "sports_ground" ? "#5a9a46" : z.id === "food_court" ? "#a29a64" : z.id === "event_arena" ? "#bfb293" : z.id === "library" ? "#52904f" : "#5d9345", vp, -.035);
        // Main routes and plaza, all actual shallow 3D slabs.
        box(57.5, 4, 5, 76, .12, "#89977f", vp);
        box(4, 35.5, 112, 5, .12, "#89977f", vp);
        box(58, 4, 4, 76, .15, "#dfd2b2", vp);
        box(4, 36, 112, 4, .15, "#dfd2b2", vp);
        floor(50, 47, 20, 15, "#bdae8b", vp, .05);
        for (let i = 1; i < 10; i += 2) floor(50 + i * 2, 47, 2, 15, "#c28a62", vp, .056);
        floor(54, 50, 12, 8, "#c6b896", vp, .08);
        floor(53.5, 49.5, 13, .5, "#c28a62", vp, .09); floor(53.5, 58, 13, .5, "#c28a62", vp, .09);
        // Sports Ground: futsal pitch (x81-100) and basketball court (x103-115), both playable via /play game mode.
        drawBaked("sports-courts", () => {
        floor(81, 64, 19, 12, "#3f8c3a", vp, .035);
        for (let i = 0; i < 4; i++) floor(81 + i * 4.75, 64, 2.375, 12, "#478f3f", vp, .037);
        box(81, 64, 19, .1, .015, "#e8f5e4", vp, .09); box(81, 75.9, 19, .1, .015, "#e8f5e4", vp, .09);
        box(81, 64, .1, 12, .015, "#e8f5e4", vp, .09); box(99.9, 64, .1, 12, .015, "#e8f5e4", vp, .09);
        box(90.45, 64, .1, 12, .015, "#e8f5e4", vp, .09);
        draw("cylinder", 90.5, 0.16, 70, 3.6, .06, 3.6, "#e8f5e4", vp); draw("cylinder", 90.5, 0.17, 70, 3.3, .06, 3.3, "#3f8c3a", vp);
        for (const gx of [81, 99.6]) { box(gx, 67.8, .4, 4.4, .015, "#e8f5e4", vp, .09); }
        floor(103, 64, 12, 12, "#9a8f7e", vp, .03); // apron
        floor(103.6, 64.8, 10.8, 10.4, "#c98a4b", vp, .045); // maple court
        box(103.6, 64.8, 10.8, .1, .015, "#fff", vp, .1); box(103.6, 75.1, 10.8, .1, .015, "#fff", vp, .1);
        box(103.6, 64.8, .1, 10.4, .015, "#fff", vp, .1); box(114.3, 64.8, .1, 10.4, .015, "#fff", vp, .1);
        box(108.95, 64.8, .1, 10.4, .015, "#fff", vp, .1);
        floor(103.6, 68.2, 3.4, 3.6, "#3b6fd4", vp, .05); floor(111, 68.2, 3.4, 3.6, "#3b6fd4", vp, .05); // painted keys
        draw("cylinder", 108.95, 0.17, 70, 2.4, .06, 2.4, "#fff", vp); draw("cylinder", 108.95, 0.18, 70, 2.2, .06, 2.2, "#c98a4b", vp);
        for (const [hx, dir] of [[103.8, 1], [114.2, -1]]) { // hoops: pole, backboard, rim
            draw("cylinder", hx - dir * .6, 1.6, 70, .12, 3.2, .12, "#2a3a55", vp);
            draw("box", hx - dir * .1, 3.2, 70, .08, 1.1, 1.8, "#f4f7ff", vp);
            draw("cylinder", hx + dir * .4, 3.0, 70, .5, .05, .5, "#ff7a1a", vp);
        }
        for (let i = 0; i < 4; i++) { box(103.2, 64.4 + i * 3.8, .5, .35, .45, "#6b5a45", vp, 0); } // spectator benches
        }, vp);
        const propRadius = q === "low" ? 26 : q === "high" ? 72 : 48;
        const nearCamera = (x, z, pad = 0) => Math.hypot(x - input.camX, z - input.camY) <= propRadius + pad && inCone(x, z, pad);
        let dressing = 0;
        const flagCols = ["#3675e7", "#ffd166", "#e8644a", "#4ce4d9", "#a15cff", "#ff8fb3", "#65c7ff", "#8bd450", "#ffb24d"];
        if (q !== "low") {
            // Avenue lamps and terracotta planters line the main boulevard to pull the eye toward the commons.
            dressing += drawBaked("lamps|" + q, () => {
            for (let zz = 8; zz < 78; zz += 9) for (const side of [55.6, 64.4]) {
                draw("cylinder", side, 1.6, zz, .14, 3.2, .14, "#2a3a55", vp);
                draw("sphere", side, 3.3, zz, .5, .4, .5, "#fff1c4", vp, .85);
                draw("box", side, .25, zz + 1.6, .9, .5, .9, "#b8613f", vp);
                draw("sphere", side, .72, zz + 1.6, .95, .6, .95, hash2(side, zz) > .5 ? "#3f8844" : "#e0527a", vp);
            }
            }, vp);
            // Zone banners: coloured pennants teach the map without reading the minimap.
            domain_1.ZONES.forEach((zn, zi) => {
                const fx = zn.x + 1.4, fz = zn.y + 1.4;
                if (!nearCamera(fx, fz, 6)) return;
                const sway = Math.sin(input.time * 2.2 + zi) * .18;
                draw("cylinder", fx, 2.4, fz, .12, 4.8, .12, "#d9d9e4", vp);
                draw("box", fx + .8 + sway * .4, 4.1, fz + sway, 1.5, .85, .06, flagCols[zi % flagCols.length], vp, .12);
                dressing += 2;
            });
        }
        // Open-roof campus architecture: visible interiors remain walkable rather than hidden below solid roofs.
                // Initialised before culling; buildings outside the camera radius can increment `culled` below.
        let drawn = 1 + dressing + domain_1.ZONES.length + domain_1.BUILDINGS.length, culled = 0;
        const meE = input.entities.find((e) => e.id === input.meId); // roofs lift off while the player is inside (visual only)
        for (const b of domain_1.BUILDINGS) {
            if (!nearCamera(b.x + b.w / 2, b.y + b.h / 2, Math.max(b.w, b.h) * .55)) {
                culled++;
                continue;
            }
            const fac = slotToName["building:" + b.id], facOk = !!(fac && meshes[fac.name]);
            const dist = Math.hypot(b.x + b.w / 2 - input.camX, b.y + b.h / 2 - input.camY);
            const detailOn = q !== "low" && !facOk && dist < (q === "high" ? 40 : 28);
            if (q !== "low") slabShadow(b.x, b.y - b.height * .65, b.w + b.height * .5, b.h + b.height * .65, vp, .24);
            const roofOn = !(meE && meE.x > b.x - .6 && meE.x < b.x + b.w + .6 && meE.y > b.y - .6 && meE.y < b.y + b.h + .6);
            const bkey = "baked:" + b.id + "|" + q + "|" + (detailOn ? 1 : 0) + "|" + (facOk ? 1 : 0) + "|" + (roofOn ? 1 : 0);
            if (!bakedCache.has(bkey)) {
                recorder = { p: [], n: [], c: [] };
                try {
floor(b.x, b.y, b.w, b.h, "#d7c7a6", vp, .07);
            if (q !== "low") {
                const sx = b.height * .5, sz = b.height * .65;
                slabShadow(b.x, b.y - sz, b.w + sx, b.h + sz, vp, .24);
                const pl = "#e3d7bb", ps = b.y + b.h;
                box(b.x - .3, b.y - .3, b.w + .6, .3, .2, pl, vp, .07);
                box(b.x - .3, b.y, .3, b.h + .3, .2, pl, vp, .07);
                box(b.x + b.w, b.y, .3, b.h + .3, .2, pl, vp, .07);
                if (b.door) { box(b.x - .3, ps, b.door.x - b.x + .3, .3, .2, pl, vp, .07); box(b.door.x + b.door.w, ps, b.x + b.w - b.door.x - b.door.w + .3, .3, .2, pl, vp, .07); }
                else box(b.x - .3, ps, b.w + .6, .3, .2, pl, vp, .07);
                drawn += 5;
            }
            const c = b.color;
            // Pitched-roof houses/shops: plastered cream walls (tinted by the building colour) so the terracotta roof reads against them.
            const isDistrict = /^[a-z]+_\d\d_/.test(b.id);
            // Pass N7: hand-placed landmarks (library, lecture blocks, food hall, hostels, studio, centre) get the same plastered walls instead of full-saturation paint.
            const wallColor = PITCHED[b.kind] ? mixHex("#efe4cc", c, .2) : isDistrict ? mixHex("#e8dfcb", c, .3) : mixHex("#ece4d2", c, .26);
            for (const s of domain_1.SOLIDS) {
                if (s.kind !== "wall" || !inBuildingWall(s, b))
                    continue;
                box(s.x, s.y, s.w, s.h, b.height, wallColor, vp, .1);
            }
            if (!PITCHED[b.kind] && !isDistrict) { // Pass N7: painted base band + cream cornice so landmark walls read as built, plastered and trimmed
                const band = shadeHex(c, -.2), cor = "#f1e8d3", fy = b.y + b.h, bh = Math.max(1.6, b.height - .35);
                const dx0 = b.door ? b.door.x : fy, dx1 = b.door ? b.door.x + b.door.w : fy;
                box(b.x - .06, fy - .04, (b.door ? dx0 - b.x : b.w) + .06, .1, .55, band, vp, .1);
                if (b.door) box(dx1, fy - .04, b.x + b.w - dx1 + .06, .1, .55, band, vp, .1);
                box(b.x - .06, b.y - .06, b.w + .12, .1, .55, band, vp, .1);
                box(b.x - .06, b.y, .1, b.h, .55, band, vp, .1); box(b.x + b.w - .04, b.y, .1, b.h, .55, band, vp, .1);
                box(b.x - .12, b.y - .12, b.w + .24, .22, .2, cor, vp, bh); box(b.x - .12, fy - .1, b.w + .24, .22, .2, cor, vp, bh);
                box(b.x - .12, b.y, .22, b.h, .2, cor, vp, bh); box(b.x + b.w - .1, b.y, .22, b.h, .2, cor, vp, bh);
                drawn += 7;
            }
            // Bright top rails make the low-poly structures feel finished and distinct from flat blocks.
            box(b.x, b.y, b.w, .3, .16, c, vp, b.height + .08);
            box(b.x, b.y + b.h - .3, b.w, .3, .16, c, vp, b.height + .08);
            box(b.x, b.y, .3, b.h, .16, shadeHex(c, .15), vp, b.height + .08);
            box(b.x + b.w - .3, b.y, .3, b.h, .16, shadeHex(c, .15), vp, b.height + .08);
            if (roofOn && PITCHED[b.kind]) { // pitched tiled roof (wedge) with overhang + fascia, replaces the flat deck
                const ridgeX = b.w >= b.h, lw = (ridgeX ? b.w : b.h) + 1.1, ld = (ridgeX ? b.h : b.w) + 1.1;
                const rise = Math.min(b.w, b.h) * (b.kind === "hall" ? .22 : .3) + .5, by = b.height + .08;
                const tile = TILES[Math.floor(Math.abs(Math.sin(b.x * 12.9 + b.y * 78.2) * 43758) % 4)];
                box(b.x - .1, b.y - .1, b.w + .2, b.h + .2, .18, shadeHex(c, -.2), vp, by);
                draw("wedge", b.x + b.w / 2, by + .18 + rise / 2, b.y + b.h / 2, lw, rise, ld, b.kind === "hall" ? "#3b4a6e" : tile, vp, 0, ridgeX ? 0 : Math.PI / 2);
                // ridge cap + eave gutters + painted plinth: the silhouette details that make a pitched roof read as built
                if (ridgeX) { box(b.x - .5, b.y + b.h / 2 - .14, b.w + 1, .28, .16, shadeHex(tile, -.3), vp, by + .18 + rise - .02); box(b.x - .6, b.y - .62, b.w + 1.2, .14, .14, "#4a5468", vp, by + .02); box(b.x - .6, b.y + b.h + .48, b.w + 1.2, .14, .14, "#4a5468", vp, by + .02); }
                else { box(b.x + b.w / 2 - .14, b.y - .5, .28, b.h + 1, .16, shadeHex(tile, -.3), vp, by + .18 + rise - .02); box(b.x - .62, b.y - .6, .14, b.h + 1.2, .14, "#4a5468", vp, by + .02); box(b.x + b.w + .48, b.y - .6, .14, b.h + 1.2, .14, "#4a5468", vp, by + .02); }
                box(b.x - .05, b.y + b.h - .02, b.w + .1, .1, .5, shadeHex(c, -.15), vp, .1);
                if (roofOn && roofCrown(b, q, mkP(vp), by + .18 + rise - .05)) drawn += 6;
                drawn += 5;
            }
            if (roofOn && !PITCHED[b.kind]) { // Pass L: real roof deck + parapet + fascia; hidden while the player is inside so interiors stay visible.
                const rb = b.height + .08;
                box(b.x - .2, b.y - .2, b.w + .4, b.h + .4, .34, "#cfc6b2", vp, rb);
                box(b.x - .2, b.y - .2, b.w + .4, .3, .5, c, vp, rb + .34);
                box(b.x - .2, b.y + b.h - .1, b.w + .4, .3, .5, c, vp, rb + .34);
                box(b.x - .2, b.y - .2, .3, b.h + .4, .5, shadeHex(c, .15), vp, rb + .34);
                box(b.x + b.w - .1, b.y - .2, .3, b.h + .4, .5, shadeHex(c, .15), vp, rb + .34);
                box(b.x - .25, b.y + b.h - .15, b.w + .5, .1, .22, shadeHex(c, -.3), vp, rb - .2);
                drawn += 6;
                box(b.x + .9, b.y + .9, b.w - 1.8, b.h - 1.8, .06, shadeHex(c, .32), vp, rb + .34); // inset roof panel in the building colour family
                for (let i = 0; i < Math.floor(b.w / 6); i++) box(b.x + 2 + i * 6, b.y + b.h / 2 - 1, 2.4, 2, .22, "#a8e3f6", vp, rb + .4); // skylights (glow at night)
                if (b.id.indexOf("lecture") === 0 || b.id.indexOf("science") === 0 || b.id.indexOf("academic") === 0) for (let i = 0; i < 3; i++) box(b.x + 1.4 + i * 2.2, b.y + b.h - 3.4, 1.9, 2, .14, "#1d3f8a", vp, rb + .42); // solar array
                drawn += 3;
                if (roofCrown(b, q, mkP(vp), b.height + .42)) drawn += 6;
            }
            const cols = Math.max(2, Math.floor(b.w / 3));
            for (let i = 0; i < cols; i++) {
                const wx = b.x + 1.2 + i * ((b.w - 2.4) / Math.max(1, cols - 1));
                if (b.door && wx > b.door.x - .8 && wx < b.door.x + b.door.w + .8)
                    continue;
                draw("box", wx + .375, Math.max(.55, b.height * .52) + .275, b.y + b.h - .09, .75, .55, .12, "#a8e3f6", vp, .15);
            }
            // Facade grammar (detail LOD: only near the camera).
            if (detailOn) {
                const ps = b.y + b.h, wy = Math.max(.55, b.height * .52), accent = shadeHex(c, -.35), cream = "#efe3c8";
                for (let i = 0; i < cols; i++) {
                    const wx = b.x + 1.2 + i * ((b.w - 2.4) / Math.max(1, cols - 1));
                    if (b.door && wx > b.door.x - .8 && wx < b.door.x + b.door.w + .8) continue;
                    box(wx - .1, ps - .2, .95, .3, .09, cream, vp, wy - .1);
                    box(wx - .1, ps - .2, .95, .3, .09, cream, vp, wy + .55);
                    box(wx - .25, ps, 1.25, .75, .07, accent, vp, wy + .78);
                    if (!PITCHED[b.kind] && !isDistrict && b.id !== "student_centre") { box(wx - .34, ps - .02, .2, .1, .7, accent, vp, wy - .05); box(wx + .86, ps - .02, .2, .1, .7, accent, vp, wy - .05); } // landmark shutters (library, lecture, food hall)
                    if (PITCHED[b.kind]) { box(wx - .34, ps - .02, .2, .1, .7, accent, vp, wy - .05); box(wx + .86, ps - .02, .2, .1, .7, accent, vp, wy - .05); box(wx + .3, ps - .05, .08, .06, .6, "#6d8aa6", vp, wy); }
                    drawn += 3;
                }
                if (b.door) {
                    const dx = b.door.x, dw = b.door.w, ch = Math.min(b.height - .5, 3.2);
                    box(dx - 1, ps, dw + 2, 2.4, .22, accent, vp, ch);
                    box(dx - 1, ps, dw + 2, .2, .35, shadeHex(c, .2), vp, ch + .2);
                    box(dx - .9, ps + 2, .3, .3, ch, cream, vp, .1);
                    box(dx + dw + .6, ps + 2, .3, .3, ch, cream, vp, .1);
                    box(dx - .15, ps - .2, .15, .3, 2.4, "#4a3322", vp, .1);
                    box(dx + dw, ps - .2, .15, .3, 2.4, "#4a3322", vp, .1);
                    box(dx - .15, ps - .2, dw + .3, .3, .18, "#4a3322", vp, 2.4);
                    box(dx - .6, ps, dw + 1.2, 1.1, .1, "#cdbf9d", vp, .08);
                    box(dx - .6, ps + 1.1, dw + 1.2, .6, .2, "#cdbf9d", vp, .08);
                    drawn += 9;
                }
                const top = roofOn && !PITCHED[b.kind] ? b.height + .9 : -60; // rooftop plant is hidden with the roof so it never floats over an open room
                if (/^[a-z]+_\d\d_/.test(b.id) && b.kind) {
                    // district rooms: per-kind silhouette + facade grammar; roof-level pieces are dropped with the roof so nothing floats over an open room
                    const base = mkP(vp), lim = b.height + .2, keep = (y: number) => y < lim || roofOn;
                    buildKindDetail(b as never, q, {
                        ...base,
                        box: (x, z, w, d, h, col, y0 = 0) => { if (keep(y0)) base.box(x, z, w, d, h, col, y0); },
                        cyl: (x, z, w, h, col, y0 = 0) => { if (keep(y0)) base.cyl(x, z, w, h, col, y0); },
                        sph: (x, y, z, w, h, d, col) => { if (keep(y - h / 2)) base.sph(x, y, z, w, h, d, col); },
                        rbox: (x, y, z, w, h, d, col, r) => { if (keep(y - h / 2)) base.rbox(x, y, z, w, h, d, col, r); },
                        ...(base.lbox ? { lbox: (x: number, z: number, w: number, d: number, h: number, col: string, y0 = 0) => { if (keep(y0)) base.lbox!(x, z, w, d, h, col, y0); } } : {}),
                    });
                    drawn += 12;
                } else if (b.id.indexOf("hostel") === 0) {
                    for (const o of [0, 1.3]) { draw("cylinder", b.x + b.w - 2.4 - o, top + 1.0, b.y + 2, 1.0, 1.2, 1.0, "#d8dde6", vp); box(b.x + b.w - 2.9 - o, b.y + 1.5, 1, 1, .8, "#59616f", vp, top); }
                    box(b.x + 1.5, b.y + 1.2, b.w - 5, 1.1, .5, "#2a8f7a", vp, top);
                    drawn += 5;
                } else if (b.id.indexOf("lecture") === 0) {
                    for (let i = 0; i < 4; i++) box(b.x + 1.2 + i * 1.8, b.y + 1.2, 1.6, 1.6, .12, "#1d3f8a", vp, top + .35, 0);
                    box(b.x + 1, b.y + b.h - 2, b.w - 2, .25, .9, shadeHex(c, .15), vp, top);
                    for (let i = 0; i <= 4; i++) { const pxl = b.x + .3 + i * (b.w - 1.1) / 4; if (b.door && pxl > b.door.x - .4 && pxl < b.door.x + b.door.w + .2) continue; box(pxl, b.y + b.h - .02, .5, .22, b.height - .3, "#f6efdc", vp, .1); } // lecture pilasters
                    box(b.x + b.w - 1.1, b.y + 1, .12, .12, 3.2, "#8e97a8", vp, top); box(b.x + b.w - 1.0, b.y + 1.02, 1, .05, .6, "#2f9e5b", vp, top + 2.5); // flagpole + green pennant
                    drawn += 12;
                } else if (b.id === "library_hall") {
                    box(b.x + b.w * .3, b.y + b.h * .25, b.w * .4, b.h * .4, 3.6, shadeHex(c, .12), vp, top);
                    for (let i = 0; i < 6; i++) box(b.x + b.w * .3 + .3 + i * (b.w * .4 - .9) / 5, b.y + b.h * .25 - .25, .18, .3, 3.9, "#f4ead2", vp, top);
                    box(b.x + b.w * .3 - .3, b.y + b.h * .25 - .3, b.w * .4 + .6, b.h * .4 + .6, .25, "#3675e7", vp, top + 3.6);
                    for (const sx of [b.x + .3, b.x + b.w - .8]) box(sx, b.y + b.h - .02, .5, .22, b.height - .3, "#f6efdc", vp, .1); // end pilasters
                    box(b.x + b.w * .3 - .5, b.y + b.h * .25 - .5, b.w * .4 + 1, .2, .18, "#f1e8d3", vp, top + 3.4); // clerestory cornice
                    drawn += 11;
                } else if (b.id === "food_hall") {
                    for (let i = 0; i < Math.floor(b.w - 2); i++) box(b.x + 1 + i, b.y + b.h, 1, 2.2, .12, i % 2 ? "#fff6e0" : "#e8644a", vp, 2.7);
                    box(b.x + 1.6, b.y + 1.4, 1.1, 1.1, 1.6, "#9a5a42", vp, top); box(b.x + 1.45, b.y + 1.25, 1.4, 1.4, .18, "#4a4f5c", vp, top + 1.6); // kitchen chimney stack + cap
                    box(b.x + 1, b.y + b.h - .02, b.w - 2, .12, .28, "#f6c85a", vp, 2.35); // warm yellow fascia band under the awning
                    drawn += Math.floor(b.w - 2) + 3;
                } else if (b.id === "creator_studio") {
                    for (let i = 0; i < 3; i++) box(b.x + 1 + i * (b.w - 2) / 3, b.y + 1, (b.w - 2) / 3, b.h - 2, .5 + i * .45, "#a15cff", vp, top);
                    drawn += 3;
                } else if (b.id === "student_centre") {
                    box(b.x + b.w - 2.6, b.y + 1, 2.2, 2.2, 2.2, "#efe3c8", vp, top); box(b.x + b.w - 2.8, b.y + .8, 2.6, 2.6, .2, "#2f6bff", vp, top + 2.2);
                    box(b.x + 1, b.y + 3, 3.6, 3, .1, "#1d3f8a", vp, top + 1.6);
                    if (b.door) box(b.door.x - 1.7, b.y + b.h, b.door.w + 3.4, 2.4, .2, "#1f4fb5", vp, 3.2);
                    drawn += 4;
                } else { box(b.x + b.w * .6, b.y + 1.5, 2, 1.6, 1, "#8c93a3", vp, top); drawn++; }
            }
            // Interior guide tables/shelves echo the room geometry and help each building read as a real place.
            if (b.id === "library_hall")
                for (let i = 0; i < 3; i++)
                    box(b.x + 3 + i * 5, b.y + 3, 3, .7, .55, "#8b623d", vp, .1);
            if (b.id === "food_hall")
                box(b.x + 2, b.y + 2, b.w - 4, 1, .75, "#b98648", vp, .1);
            if (b.id === "creator_studio")
                for (let i = 0; i < 3; i++)
                    box(b.x + 2 + i * 3, b.y + 3, 2, .8, .55, "#9a649b", vp, .1);
            buildInterior(b, mkP(vp), q);
                } finally {
                    const rec = recorder; recorder = null;
                    commitRec(bkey, rec);
                }
            }
            if (bakedCache.get(bkey)) { if (meshes[bkey]) draw(bkey, 0, 0, 0, 1, 1, 1, "#ffffff", vp); drawn++; if (meshes[bkey + "|g"] && (night > .35 || Math.hypot(b.x + b.w / 2 - input.camX, b.y + b.h / 2 - input.camY) < 30)) draw(bkey + "|g", 0, 0, 0, 1, 1, 1, "#ffffff", vp, .15); } // glow (window light) only matters near the player or at night
            if (facOk) { const sz = fac.entry.size; draw(fac.name, b.x + b.w / 2, (fac.entry.yOffset ?? 0) + sz.h / 2, b.y + b.h / 2, sz.w, sz.h, sz.d, "#ffffff", vp); drawn++; }
        }
        // Zone architecture: static dressing for each zone baked into ONE mesh per zone/quality (1 draw call).
        for (const z of domain_1.ZONES) {
            if (!nearCamera(z.x + z.w / 2, z.y + z.h / 2, Math.max(z.w, z.h) * .6)) continue;
            const akey = "arch:" + z.id + "|" + q;
            if (!bakedCache.has(akey)) {
                recorder = { p: [], n: [], c: [] };
                try {
                    const zdef = domain_1.ZONE_DEFS.find((d) => d.id === z.id);
                    const arch = hasZoneArchitecture(z.id) ? (pp) => buildZoneArchitecture(z.id, q, pp) : (pp) => { if (zdef) { const dz = { id: z.id, rect: zdef.rect, buildings: zdef.buildings }; buildDistrict(dz, q, pp); zoneGateway(dz, q, pp); if (zdef.buildings.length) southLawn(z.id, zdef.rect, Math.max(...zdef.buildings.map((bb) => bb.y + bb.h)), q, pp); else if (z.id === "gate_road") gateRoadExtras(zdef.rect, q, pp); } };
                    arch({
                        box: (x0, z0, w, d, h, color, y0 = 0) => draw("box", x0 + w / 2, y0 + h / 2, z0 + d / 2, w, h, d, color, vp),
                        cyl: (cx, cz, w, h, color, y0 = 0) => draw("cylinder", cx, y0 + h / 2, cz, w, h, w, color, vp),
                        sph: (cx, cy2, cz, w, h, d, color) => draw("sphere", cx, cy2, cz, w, h, d, color, vp),
                        rbox: (cx, cy2, cz, w, h, d, color, rot) => draw("box", cx, cy2, cz, w, h, d, color, vp, 0, rot),
                        lbox: (x0, z0, w, d, h, color, y0 = 0) => draw("box", x0 + w / 2, y0 + h / 2, z0 + d / 2, w, h, d, color, vp, .15),
                        lsph: (cx, cy2, cz, w, h, d, color) => draw("sphere", cx, cy2, cz, w, h, d, color, vp, .15),
                    });
                } finally {
                    const rec = recorder; recorder = null;
                    commitRec(akey, rec);
                }
            }
            if (bakedCache.get(akey)) { if (meshes[akey]) draw(akey, 0, 0, 0, 1, 1, 1, "#ffffff", vp); drawn++; if (meshes[akey + "|g"]) draw(akey + "|g", 0, 0, 0, 1, 1, 1, "#ffffff", vp, .15); }
        }
        // Decor: non-solid scenery from zone data; drawn only when its GLB has streamed in.
        for (const zd of domain_1.ZONE_DEFS) {
            for (const dc of zd.decor) {
                const hit = slotToName["decor:" + dc.model];
                if (!hit || !meshes[hit.name] || !nearCamera(dc.x, dc.y, 4))
                    continue;
                const k = dc.scale ?? 1, sz = hit.entry.size ?? { w: 1, h: 1, d: 1 };
                queue(hit.name, dc.x, (hit.entry.yOffset ?? 0) + sz.h * k / 2, dc.y, sz.w * k, sz.h * k, sz.d * k, dc.rot ?? 0);
                drawn++;
            }
        }
        // Props are real meshes: tropical palms, benches, shelves, stalls, fountain and gate monuments.
        // Props: static shapes are baked into ONE mesh per 30x30 chunk (instead of 5-10 draw calls per tree/bench);
        // animated (fountain spray) and streamed-GLB props stay per-frame.
        const drawSolid = (s, baking) => {
            if (s.kind === "wall") return;
            const x = s.x + s.w / 2, z = s.y + s.h / 2;
            const slotted = slotToName["prop:" + s.kind], useSlot = !!(slotted && meshes[slotted.name]);
            if (!baking) {
                if (s.kind !== "fountain" && !useSlot) return;
                if (!nearCamera(x, z, Math.max(s.w, s.h))) { culled++; return; }
                if (q !== "low") softShadow(x + s.w * .25, z - s.h * .3, Math.max(s.w, s.h) * .62, vp, .22);
                if (s.kind === "fountain" && q !== "low") { // spray: small elongated droplets on parabolic jets from the upper bowl into the basin (not blobs)
                    const nJ = q === "high" ? 6 : 4, nD = q === "high" ? 4 : 3;
                    for (let j = 0; j < nJ; j++) for (let k = 0; k < nD; k++) {
                        const u = (input.time * .7 + k / nD + j * .13) % 1, a = j * (6.2832 / nJ) + .4, r = .15 + u * s.w * .52, hy = 1.35 + 2.6 * u * (1 - u) - .85 * u;
                        draw("sphere", x + Math.cos(a) * r, hy, z + Math.sin(a) * r, .07, .15, .07, "#e6f7ff", vp, .35); drawn++;
                    }
                }
                if (!useSlot) return;
                const sz = slotted.entry.size ?? { w: s.w, h: Math.max(1, Math.max(s.w, s.h)), d: s.h };
                queue(slotted.name, x, (slotted.entry.yOffset ?? 0) + sz.h / 2, z, sz.w, sz.h, sz.d, 0);
                drawn++;
                return;
            }
            if (useSlot) return;
            if (q !== "low" && s.kind === "tree") draw("cylinder", x + .1, .075, z - .2, 3.4, .02, 2.7, "#2d6a42", vp);
            switch (s.kind) {
                case "tree":
                    {
                        const th = hash2(x, z), k = .85 + th * .5, sw = 0;
                        if (th >= .4) { // species variety (campus trees are not all lollipops): flat-topped acacia and tall neem/mango
                            const acacia = th < .7, kk = .9 + (th * 7 % 1) * .45, lean = ((th * 13) % 1 - .5) * .5;
                            draw("cylinder", x, .8 * kk, z, .34 * kk, 1.6 * kk, .34 * kk, "#6a4a36", vp);
                            if (acacia) { // forked trunk + wide layered umbrella canopy
                                draw("cylinder", x + lean * .5, 2.0 * kk, z, .22 * kk, 1.5 * kk, .22 * kk, "#6a4a36", vp, 0, lean);
                                draw("cylinder", x - lean * .6, 2.1 * kk, z + .15, .18 * kk, 1.4 * kk, .18 * kk, "#6a4a36", vp, 0, -lean * 1.3);
                                draw("sphere", x, 3.05 * kk, z, 4.6 * kk, .75 * kk, 4.0 * kk, "#4f7d36", vp);
                                draw("sphere", x + .5 * kk, 3.45 * kk, z - .3 * kk, 3.3 * kk, .55 * kk, 2.9 * kk, "#6c9a42", vp);
                                if (q !== "low") draw("sphere", x - .9 * kk, 3.25 * kk, z + .5 * kk, 2.2 * kk, .5 * kk, 2.0 * kk, "#86b24c", vp);
                            } else { // tall, dense oval crown
                                draw("cylinder", x, 2.0 * kk, z, .26 * kk, 1.6 * kk, .26 * kk, "#5f432f", vp);
                                draw("sphere", x, 3.5 * kk, z, 2.5 * kk, 3.2 * kk, 2.4 * kk, "#2b6a3a", vp);
                                if (q !== "low") { draw("sphere", x + .5 * kk, 4.0 * kk, z - .3 * kk, 1.6 * kk, 1.9 * kk, 1.5 * kk, "#3f8a48", vp); draw("sphere", x - .5 * kk, 3.2 * kk, z + .4 * kk, 1.3 * kk, 1.5 * kk, 1.3 * kk, "#58a255", vp); }
                            }
                            drawn += 5;
                            break;
                        }
                        const pal = th < .33 ? ["#2b6f33", "#4a9040", "#7fb04c"] : th < .66 ? ["#2f6a34", "#558f3e", "#8fb856"] : ["#26623a", "#437f45", "#74a954"];
                        draw("cylinder", x, .75 * k, z, .3 * k, 1.5 * k, .3 * k, "#6e4a33", vp);
                        draw("cylinder", x + .05 * k, 1.9 * k, z, .2 * k, 1.2 * k, .2 * k, "#6e4a33", vp, 0, .3);
                        draw("sphere", x + sw * .3, 2.1 * k, z, 2.8 * k, 2.1 * k, 2.7 * k, pal[0], vp);
                        if (q !== "low") {
                            // clustered canopy: lobes of varied size/colour so the silhouette is leafy, not a ball
                            for (let li = 0; li < 5; li++) {
                                const la = li * 1.9 + th * 6, lr = .55 + (li % 2) * .35, lh = hash2(x + li, z - li);
                                draw("sphere", x + Math.cos(la) * lr * k, (2.2 + (li % 3) * .42 + lh * .3) * k, z + Math.sin(la) * lr * k, (1.35 + lh * .5) * k, (1.05 + lh * .35) * k, (1.3 + lh * .5) * k, pal[1 + (li % 2)], vp);
                            }
                            draw("sphere", x + .15, 3.5 * k, z, 1.15 * k, .95 * k, 1.15 * k, pal[2], vp);
                            drawn += 5;
                        }
                    }
                    drawn += 2;
                    break;
                case "palm":
                    { const ph = hash2(x, z); palmTree(mkP(vp), x, z, 4.6 * (.9 + ph * .35), q); drawn += 6; }
                    break;
                case "fountain":
                    // Tiered sculptural fountain: plinth, stone basin with a sitting ledge, water, pedestal, upper bowl, campus-blue/gold finial.
                    draw("cylinder", x, .08, z, s.w * 1.32, .16, s.h * 1.32, "#c9b99a", vp); // plinth ring
                    draw("cylinder", x, .34, z, s.w * 1.12, .36, s.h * 1.12, "#d8cdb5", vp); // basin wall (ledge top ~.52 m = seat height)
                    draw("cylinder", x, .5, z, s.w * 1.2, .06, s.h * 1.2, "#efe6d2", vp); // rim cap
                    draw("cylinder", x, .47, z, s.w * .9, .06, s.h * .9, "#3fa6e6", vp); // water
                    draw("cylinder", x, .85, z, .42, .66, .42, "#b9a98a", vp); // pedestal
                    draw("cylinder", x, 1.22, z, s.w * .52, .14, s.h * .52, "#d8cdb5", vp); // upper bowl
                    draw("cylinder", x, 1.3, z, s.w * .42, .05, s.h * .42, "#5bc0f0", vp); // upper water
                    draw("cylinder", x, 1.75, z, .16, .9, .16, "#2f5fc4", vp); // blue column
                    draw("sphere", x, 2.28, z, .34, .34, .34, "#f0b429", vp); // gold finial
                    drawn += 9;
                    break;
                case "pillar":
                    box(s.x, s.y, s.w, s.h, 2.5, "#e4d4b9", vp, .1);
                    box(s.x - .08, s.y - .08, s.w + .16, s.h + .16, .25, "#3675e7", vp, 2.45);
                    drawn += 2;
                    break;
                case "stage":
                    box(s.x, s.y, s.w, s.h, .7, "#168da0", vp, .1);
                    box(s.x, s.y, s.w, .3, .7, "#31c4d0", vp, .8);
                    drawn += 2;
                    break;
                case "bench":
                    box(s.x, s.y, s.w, s.h, .18, "#916239", vp, .55);
                    box(s.x + .2, s.y + .2, .18, .2, .55, "#71503b", vp, .05);
                    box(s.x + s.w - .4, s.y + .2, .18, .2, .55, "#71503b", vp, .05);
                    drawn += 3;
                    break;
                case "shelf":
                    box(s.x, s.y, s.w, s.h, .9, "#8a5c38", vp, .1);
                    for (let i = 0; i < Math.min(5, Math.floor(s.w)); i++)
                        box(s.x + .2 + i * (s.w - .4) / Math.max(1, Math.min(5, Math.floor(s.w)) - 1), s.y + .15, .18, s.h * .65, .48, ["#e8644a", "#2f6bff", "#ffd166", "#4fb286"][i % 4], vp, .5);
                    drawn += 4;
                    break;
                case "counter":
                    box(s.x, s.y, s.w, s.h, .85, "#c9a36a", vp, .1);
                    box(s.x, s.y, s.w, .2, .16, "#e5c588", vp, .95);
                    drawn += 2;
                    break;
                default:
                    box(s.x, s.y, s.w, s.h, .6, "#777777", vp, .1);
                    drawn++;
            }
        };
        const chunkSolids = (renderer_chunks.solids ??= (() => { const m = new Map(); for (const s of domain_1.SOLIDS) { if (s.kind === "wall") continue; const id = Math.floor((s.x + s.w / 2) / 30) + "," + Math.floor((s.y + s.h / 2) / 30); (m.get(id) ?? m.set(id, []).get(id)).push(s); } return m; })());
        const slotSig = Object.keys(slotToName).filter((k) => k.startsWith("prop:")).join(",");
        for (const [cid, list] of chunkSolids) {
            const [gx, gz] = cid.split(",").map(Number);
            if (Math.hypot(gx * 30 + 15 - input.camX, gz * 30 + 15 - input.camY) > propRadius + 30) continue;
            const pkey = "props:" + cid + "|" + q + "|" + slotSig;
            if (!bakedCache.has(pkey)) {
                const old = renderer_chunks.keys.get(cid);
                if (old) { const om = meshes[old]; if (om) { gl.deleteBuffer(om.p); gl.deleteBuffer(om.n); gl.deleteBuffer(om.c); delete meshes[old]; } bakedCache.delete(old); }
                renderer_chunks.keys.set(cid, pkey);
                recorder = { p: [], n: [], c: [] };
                try { for (const s of list) drawSolid(s, true); }
                finally {
                    const rec = recorder; recorder = null;
                    commitRec(pkey, rec);
                }
            }
            if (bakedCache.get(pkey)) { if (meshes[pkey]) draw(pkey, 0, 0, 0, 1, 1, 1, "#ffffff", vp); drawn++; if (meshes[pkey + "|g"]) draw(pkey + "|g", 0, 0, 0, 1, 1, 1, "#ffffff", vp, .15); }
        }
        for (const s of domain_1.SOLIDS) drawSolid(s, false);
        flushInstances(vp);
        for (const p of domain_1.INTERACTION_POINTS) {
            if ((p.hidden && p.id !== input.activeHuntPointId) || !nearCamera(p.x, p.y, 6))
                continue;
            const c = p.activity === "quiz" ? "#4ce4d9" : p.activity === "reaction" ? "#ffd166" : p.activity === "hunt" ? "#65c7ff" : p.activity === "shootout" ? "#8eb8ff" : "#ffffff";
            draw("cylinder", p.x, .16, p.y, 2.0, .12, 2.0, c, vp, .1);
            draw("sphere", p.x, .7 + Math.sin(input.time * 3) * .13, p.y, .62, .62, .62, c, vp, .2);
            drawn += 2;
        }
        // Ambient birds (restrained; daytime only) drawn through the dynamic batch.
        beginDyn();
        const nBirds = night > .6 ? 0 : q === "low" ? 2 : q === "medium" ? 5 : 8;
        for (let i = 0; i < nBirds; i++) {
            const a = input.time * (.12 + (i % 3) * .03) + i * 2.4, rad = 14 + (i % 4) * 7;
            const bx = input.camX + Math.cos(a) * rad, bz = input.camY + Math.sin(a * 1.1) * rad * .8, by = 12 + (i % 3) * 3 + Math.sin(a * 3) * 1.2;
            const hx = -Math.sin(a), hz = 1.1 * Math.cos(a), rt = Math.atan2(hx, hz), cr = Math.cos(rt), sr = Math.sin(rt), fl = Math.sin(input.time * 9 + i) * .35;
            draw("sphere", bx, by, bz, .28, .26, .8, "#f4f1ea", vp, 0, rt);
            draw("box", bx + cr * .5, by + fl, bz - sr * .5, .9, .05, .3, "#dfe6ee", vp, 0, rt);
            draw("box", bx - cr * .5, by + fl, bz + sr * .5, .9, .05, .3, "#dfe6ee", vp, 0, rt);
        }
        // Campus shuttle: visual-only ambient traffic on Gate Road's west lane (loops 84->146, pausing at the shelter). Drawn in the dynamic batch => no extra call.
        if (q !== "low" && Math.hypot(52.6 - input.camX, 115 - input.camY) < 70) {
            const cyc = input.time % 48, run = 20, stop = 4;
            const sx = 52.6, sz = cyc < run ? 146 - (cyc / run) * 36 : cyc < run + stop ? 110 : cyc < 2 * run + stop ? 110 - ((cyc - run - stop) / run) * 30 : -1; // north leg, dwell at the shelter, north leg, off-road hold
            if (sz > 0) {
            draw("box", sx, .95, sz, 1.9, 1.3, 4.8, "#2f6bff", vp, 0, 0);
            draw("box", sx, 1.75, sz, 1.8, .55, 4.6, "#cfe6ff", vp, 0, 0);
            draw("box", sx, 2.1, sz, 1.95, .12, 4.9, "#f4f6fb", vp, 0, 0);
            for (const wx of [-.98, .98]) for (const wz of [-1.5, 1.5]) draw("cylinder", sx + wx, .4, sz + wz, .8, .3, .8, "#1b2540", vp, 0, 0);
            draw("box", sx, 1.1, sz - 2.42, 1.2, .3, .06, "#ffd166", vp, 0, 0);
            }
        }
        let npcCount = 0;
        const humans = input.entities.filter(h => !h.npc);
        const npcLimit = domain_1.QUALITY_PROFILES[q]?.npcs ?? 6;
        // Avatar parts: streamed GLBs anchored to the entity. Each falls back to the code-drawn body when its model is absent.
        let bob = 0;
        const part = (e, slot) => {
            const h = slot ? slotToName[slot] : undefined;
            if (!h || !meshes[h.name])
                return false;
            const en = h.entry, an = en.anchor ?? { x: 0, y: 0, z: 0 }, sz = en.size;
            const t = en.tint === "hair" ? e.avatar.hairColor : en.tint === "outfit" ? e.avatar.outfit : en.tint === "skin" ? e.avatar.skin : "#ffffff";
            draw(h.name, e.x + an.x, an.y + sz.h / 2 + (an.y > .5 ? bob : 0), e.y + an.z, sz.w, sz.h, sz.d, t, vp);
            drawn++;
            return true;
        };
        // Skinned bodies cost ~2.4k triangles each, so only the nearest few avatars (always you) get one; everyone else keeps the box body.
        const skinSet = new Map(); // id -> true (full body) | false (~900-tri LOD body, same skeleton so animation state is shared)
        if (character && q !== "low") {
            const budget = q === "high" ? 12 : 6, range = q === "high" ? 40 : 26;
            const near = input.entities.filter((en) => !(fpCam && en.id === input.meId)).map((en) => ({ id: en.id, d: en.id === input.meId ? -1 : Math.hypot(en.x - input.camX, en.y - input.camY) })).filter((o) => o.d < range).sort((a, b) => a.d - b.d);
            const hi = characterLod ? (q === "high" ? 6 : 3) : budget, total = characterLod ? (q === "high" ? 16 : 8) : budget;
            for (let i = 0; i < Math.min(total, near.length); i++) skinSet.set(near[i].id, i < hi);
        }
        for (const e of input.entities) {
            if (fpCam && e.id === input.meId) continue; // you are the camera: no body inside your own eyes
            if (walkCam && e.id !== input.meId && !inCone(e.x, e.y, 2)) { culled++; continue; } // people behind you are not drawn
            if (e.npc && ++npcCount > npcLimit) {
                culled++;
                continue;
            }
            let mo = motion.get(e.id); if (!mo) { if (motion.size > 300) motion.clear(); mo = { x: e.x, y: e.y, dx: 0, dz: 1, yaw: 0, phase: hash2(e.x, e.y) * 6, speed: 0, t: input.time }; motion.set(e.id, mo); }
            const dtm = Math.max(.001, Math.min(.2, input.time - mo.t)), vx = (e.x - mo.x) / dtm, vz = (e.y - mo.y) / dtm, spd = Math.hypot(vx, vz);
            if (spd > .3) { mo.dx = vx / spd; mo.dz = vz / spd; }
            { const own = e.id === input.meId && camMode === "chase" && spd <= .3; const want = own ? (input.camHeading ?? 0) : Math.atan2(mo.dx, mo.dz); let dy = want - (mo.yaw ?? 0); dy = Math.atan2(Math.sin(dy), Math.cos(dy)); mo.yaw = (mo.yaw ?? 0) + dy * Math.min(1, dtm * 12); }
            mo.speed += (Math.min(1, spd / 4.5) - mo.speed) * Math.min(1, dtm * 10);
            mo.rn = (mo.rn ?? 0) + (Math.max(0, Math.min(1, (spd - 4.2) / 1.6)) - (mo.rn ?? 0)) * Math.min(1, dtm * 8); // walk -> run blend
            mo.phase += dtm * (5 + Math.min(spd, 7) * 1.5) * (mo.speed > .05 ? 1 : .25);
            mo.x = e.x; mo.y = e.y; mo.t = input.time;
            const swg = Math.sin(mo.phase) * .24 * mo.speed;
            const em = e.emote === "wave" || e.emote === "dance" || e.emote === "laugh" || e.emote === "cheer" || e.emote === "sit" ? e.emote : null, yaw = mo.yaw ?? 0, yc = Math.cos(yaw), ys = Math.sin(yaw);
            const lx = (ox, oz) => e.x + ox * yc + oz * ys, lz = (ox, oz) => e.y - ox * ys + oz * yc; // body-local -> world (heading frame)
            const tt = input.time, still = mo.speed < .06;
            bob = Math.abs(Math.cos(mo.phase)) * .07 * mo.speed + Math.sin(tt * 1.7 + mo.phase) * .012 + (still && !em ? Math.sin(tt * 2.1 + mo.phase) * .008 : 0);
            if (em === "cheer") bob += Math.abs(Math.sin(tt * 6)) * .16; else if (em === "dance") bob += Math.abs(Math.sin(tt * 7)) * .07; else if (em === "laugh") bob += Math.sin(tt * 18) * .025;
            const sitting = em === "sit";
            if (sitting) bob = -.34 + Math.sin(tt * 1.4 + mo.phase) * .008;
            const sway = em === "dance" ? Math.sin(tt * 3.5) * .16 : 0, body = yaw + sway;
            const skin = e.avatar.skin, outfit = e.avatar.outfit, hair = e.avatar.hairColor;
            const slots = domain_1.avatarSlots(e.avatar);
            // Chibi-shaped 3D avatars: outfit/skin/hair are the player's saved customisation, not generic placeholders.
            if (q !== "low") { const rr = recorder; recorder = null; softShadow(e.x + .1, e.y - .1, .5, vp, .3); recorder = rr; }
            // Pass N: articulated "operator" body. Same anchor heights as the old chibi (head 1.58, torso ~.98) so streamed GLB parts still line up.
            const PANTS = "#2a3144", BOOT = "#1c1f26", GLOVE = "#1c1f26", VEST = "#2d3340", hiQ = q !== "low", kaf = e.avatar.top === "kaftan", sleeve = shadeHex(outfit, -.14);
            const useSkin = !!character && !!recorder && skinSet.has(e.id);
            let head = null;
            if (useSkin) {
                if (!mo.sk) mo.sk = character.create();
                stepAnimation(character.model, mo.sk, spd, em, dtm);
                const anim = skinSet.get(e.id) || !characterLod ? character : characterLod;
                const res = anim.emit(mo.sk, { x: e.x, z: e.y, yaw }, anim.colors(skin, outfit), recorder);
                trisFrame += res.tris; head = res.head; bob = res.head[1]; // emote bubble etc. follow the animated head
            }
            if (!useSkin) {
            const topPart = part(e, slots.top);
            if (sitting) { // thighs forward over the seat, shins down, boots planted
                for (const sx of [-.17, .17]) {
                    draw("box", lx(sx, .28), .84 + bob, lz(sx, .28), .22, .22, .56, PANTS, vp, 0, body);
                    draw("box", lx(sx, .54), .22, lz(sx, .54), .18, .4, .2, PANTS, vp, 0, body);
                    draw("box", lx(sx, .6), .07, lz(sx, .6), .2, .14, .34, BOOT, vp, 0, body);
                }
            } else {
                // Skeleton: hip -> knee -> ankle forward kinematics in the sagittal plane (y up, z forward). Thigh/shin are chains of small boxes along each bone.
                const rn = mo.rn ?? 0, A = (.45 + .35 * rn) * mo.speed, nseg = hiQ ? 3 : 2, L1 = .3, L2 = .3;
                const legPose = (s) => { const ph = mo.phase + (s < 0 ? 0 : Math.PI), a = Math.sin(ph) * A, k = (.08 + Math.max(0, Math.cos(ph)) * .95 * (1 + .5 * rn)) * mo.speed, kz = L1 * Math.sin(a), ky = -L1 * Math.cos(a); return { kz, ky, az: kz + L2 * Math.sin(a - k), ay: ky - L2 * Math.cos(a - k) }; };
                const lp = [legPose(-1), legPose(1)], excess = Math.max(0, Math.min(.68 + lp[0].ay, .68 + lp[1].ay) - .08);
                bob -= Math.min(.14, excess); // pelvis drops so the planted foot stays on the ground
                const seg = (sx, y0, z0, y1, z1, w, d, color) => { const dy = y1 - y0, dz = z1 - z0, len = Math.hypot(dy, dz), h = Math.max(.1, len / nseg * 1.25); for (let i = 0; i < nseg; i++) { const f = (i + .5) / nseg; draw("box", lx(sx, z0 + dz * f), y0 + dy * f, lz(sx, z0 + dz * f), w, h, d, color, vp, 0, body); } };
                [-1, 1].forEach((s, idx) => {
                    const P = lp[idx], hy = .68 + bob, sx = s * .16;
                    seg(sx, hy, 0, hy + P.ky, P.kz, .22, .24, PANTS);                         // thigh
                    seg(sx, hy + P.ky, P.kz, hy + P.ay, P.az, .17, .19, PANTS);               // shin
                    draw("box", lx(sx, P.az + .05), hy + P.ay - .01, lz(sx, P.az + .05), .2, .14, .34, BOOT, vp, 0, body); // boot
                    if (hiQ) draw("box", lx(sx, P.kz + .08), hy + P.ky, lz(sx, P.kz + .08), .19, .1, .1, GLOVE, vp, 0, body); // knee pad
                });
                    }
            draw("box", e.x, .68 + bob, e.y, .5, .14, .33, "#16181d", vp, 0, body);                                                  // belt
            if (hiQ) draw("box", lx(0, .17), .68 + bob, lz(0, .17), .1, .09, .03, "#d4a64a", vp, 0, body);                           // buckle
            draw("box", e.x, .8 + bob, e.y, .46, .2, .3, shadeHex(outfit, -.2), vp, 0, body);                                        // waist
            if (!topPart) {
                draw("box", e.x, 1.08 + bob, e.y, .62, .46, .4, outfit, vp, 0, body);                                                 // chest
                if (kaf) draw("box", e.x, .62 + bob, e.y, .58, .5, .4, outfit, vp, 0, body);                                          // kaftan skirt
                else if (hiQ) {                                                                                                       // tactical plate carrier + pouches + straps
                    draw("box", lx(0, .02), 1.08 + bob, lz(0, .02), .58, .4, .44, VEST, vp, 0, body);
                    for (const px of [-.17, 0, .17]) draw("box", lx(px, .24), .92 + bob, lz(px, .24), .13, .12, .07, "#3a4150", vp, 0, body);
                    for (const px of [-.2, .2]) draw("box", lx(px, 0), 1.3 + bob, lz(px, 0), .1, .05, .42, VEST, vp, 0, body);
                }
            }
            for (const s of [-1, 1]) draw("sphere", lx(s * .37, 0), 1.24 + bob, lz(s * .37, 0), .2, .2, .2, sleeve, vp);              // shoulders
            draw("cylinder", e.x, 1.38 + bob, e.y, .15, .12, .15, skin, vp);                                                         // neck
            draw("sphere", e.x, 1.6 + bob, e.y, .4, .42, .4, skin, vp);                                                              // head
            draw("sphere", lx(0, .03), 1.47 + bob, lz(0, .03), .3, .2, .3, skin, vp);                                                // jaw
            if (hiQ) for (const s of [-1, 1]) {
                draw("sphere", lx(s * .2, 0), 1.58 + bob, lz(s * .2, 0), .06, .1, .07, skin, vp);                                    // ears
                draw("sphere", lx(s * .08, .17), 1.62 + bob, lz(s * .08, .17), .05, .05, .04, "#14161c", vp);                        // eyes
                draw("box", lx(s * .08, .18), 1.68 + bob, lz(s * .08, .18), .09, .018, .03, shadeHex(hair, -.2), vp, 0, body);       // brows
            }
            if (hiQ) draw("sphere", lx(0, .2), 1.55 + bob, lz(0, .2), .06, .06, .06, shadeHex(skin, -.12), vp);                      // nose
            if (e.avatar.hair !== "bald" && !part(e, slots.hair)) {
                draw("sphere", e.x, 1.76 + bob, e.y, .43, .2, .43, hair, vp);
                if (e.avatar.hair === "afro") draw("sphere", e.x, 1.82 + bob, e.y, .62, .38, .6, hair, vp);
                if (e.avatar.hair === "cap") { draw("cylinder", e.x, 1.84 + bob, e.y, .46, .12, .46, "#e8644a", vp); draw("box", lx(0, .26), 1.8 + bob, lz(0, .26), .38, .03, .2, "#e8644a", vp, 0, body); }
            }
            const up = (ph) => Math.sin(tt * 9 + ph) * .07;
            const waving = em === "wave" || (e.npc && still && humans.some(h => Math.hypot(h.x - e.x, h.y - e.y) < 5));
            const armUp = (s, wig, ph) => {
                const hy = up(ph);
                draw("box", lx(s * .42, .02), 1.38 + bob + hy, lz(s * .42, .02), .17, .3, .18, sleeve, vp, 0, body + wig);
                draw("box", lx(s * .43, .03), 1.66 + bob + hy, lz(s * .43, .03), .14, .3, .15, skin, vp, 0, body + wig);
                draw("sphere", lx(s * .43, .03), 1.84 + bob + hy, lz(s * .43, .03), .16, .16, .16, GLOVE, vp);
            };
            const armDown = (s) => { // shoulder -> elbow -> wrist, swinging opposite the same-side leg; elbows bend more when running
                const rn2 = mo.rn ?? 0, ph = mo.phase + (s < 0 ? Math.PI : 0), b = Math.sin(ph) * (.55 + .3 * rn2) * mo.speed, ef = .12 + (.18 + .55 * rn2) * mo.speed;
                const sy = 1.24 + bob, sx = s * .4, ez = .3 * Math.sin(b), ey = sy - .3 * Math.cos(b), wz = ez + .27 * Math.sin(b + ef), wy = ey - .27 * Math.cos(b + ef);
                const n = hiQ ? 3 : 2, put = (y0, z0, y1, z1, w, d, c) => { const dy = y1 - y0, dz = z1 - z0, h = Math.max(.1, Math.hypot(dy, dz) / n * 1.25); for (let i = 0; i < n; i++) { const f = (i + .5) / n; draw("box", lx(sx, z0 + dz * f), y0 + dy * f, lz(sx, z0 + dz * f), w, h, d, c, vp, 0, body); } };
                put(sy, 0, ey, ez, .16, .17, sleeve); put(ey, ez, wy, wz, .14, .15, skin);
                draw("sphere", lx(sx, wz + .02), wy - .05, lz(sx, wz + .02), .15, .15, .15, GLOVE, vp);
            };
            if (em === "cheer" || em === "dance") armUp(-1, em === "dance" ? Math.sin(tt * 7) * .5 : -.2, 0); else armDown(-1);
            if (waving || em === "cheer" || em === "dance") armUp(1, Math.sin(tt * 9) * .5, 1.3);
            else if (em === "laugh") { draw("box", lx(.32, .12), 1.0 + bob, lz(.32, .12), .16, .3, .17, sleeve, vp, 0, body); draw("box", lx(.24, .2), .9 + bob, lz(.24, .2), .14, .26, .15, skin, vp, 0, body); }
            else armDown(1);
            if (hiQ && !part(e, slots.backpack)) draw("box", lx(0, -.27), 1.06 + bob, lz(0, -.27), .38, .46, .18, shadeHex(outfit, -.38), vp, 0, body); // small tactical pack
            }
            if (useSkin) {
                // Head dressing on the animated skinned head. Parts/fallbacks were authored for the chibi head (centre y 1.6, width .4), so map them onto it.
                const hs = Math.max(.45, Math.min(1.4, character.headWidth / .4)), hc = character.restHeadTop - .21 * hs;
                const hy = (y) => hc + (y - 1.6) * hs + head[1], hxz = (ox, oz) => [e.x + head[0] + (ox * yc + oz * ys) * hs, e.y + head[2] + (-ox * ys + oz * yc) * hs];
                const skinPart = (slot) => {
                    const h = slot ? slotToName[slot] : undefined; if (!h || !meshes[h.name]) return false;
                    const en = h.entry, an = en.anchor ?? { x: 0, y: 0, z: 0 }, sz = en.size, t = en.tint === "hair" ? hair : en.tint === "outfit" ? outfit : en.tint === "skin" ? skin : "#ffffff";
                    const [px, pz] = hxz(an.x, an.z);
                    draw(h.name, px, hy(an.y + sz.h / 2), pz, sz.w * hs, sz.h * hs, sz.d * hs, t, vp, 0, yaw); drawn++; return true;
                };
                const faceOk = q !== "low" && skinPart(slots.face);
                if (!faceOk) for (const s of [-1, 1]) { const [px, pz] = hxz(s * .08, .17); draw("sphere", px, hy(1.62), pz, .05 * hs, .05 * hs, .04 * hs, "#14161c", vp); }
                if (e.avatar.hair !== "bald" && !skinPart(slots.hair)) {
                    const [hx, hz] = hxz(0, 0);
                    draw("sphere", hx, hy(1.76), hz, .43 * hs, .2 * hs, .43 * hs, hair, vp);
                    if (e.avatar.hair === "afro") draw("sphere", hx, hy(1.82), hz, .62 * hs, .38 * hs, .6 * hs, hair, vp);
                    if (e.avatar.hair === "cap") { const [cx, cz] = hxz(0, .26); draw("cylinder", hx, hy(1.84), hz, .46 * hs, .12 * hs, .46 * hs, "#e8644a", vp); draw("box", cx, hy(1.8), cz, .38 * hs, .03, .2 * hs, "#e8644a", vp, 0, yaw); }
                }
                if (q !== "low") skinPart(slots.accessory);
                drawn += 6;
            } else {
            drawn += hiQ ? 34 : 22;
            part(e, slots.shoes);
            if (q !== "low") {
                part(e, slots.face);
                part(e, slots.accessory);
            }
            }
        }
        { // Main gate leaves (iron bars + gold rail) swing open about the pillars; input.gateOpen 0..1 (visual only)
            const go = Math.max(0, Math.min(1, input.gateOpen ?? 0));
            if (Math.hypot(60 - input.camX, 71.7 - input.camY) < (q === "low" ? 30 : 45)) {
                const a = go * 1.35, L = 6.6;
                for (const s of [-1, 1]) {
                    const hx = s < 0 ? 53.4 : 66.6, rot = s < 0 ? a : Math.PI - a, dx = Math.cos(rot), dz = -Math.sin(rot);
                    const at = (u, y, w, h, d, c) => draw("box", hx + dx * u, y, 71.7 + dz * u, w, h, d, c, vp, 0, rot);
                    at(L / 2, 2.8, L, .14, .12, "#d4a64a"); at(L / 2, 2.45, L, .1, .1, "#2a2f3a"); at(L / 2, 1.3, L, .08, .08, "#2a2f3a"); at(L / 2, .4, L, .12, .1, "#2a2f3a");
                    const n = q === "low" ? 8 : 14;
                    for (let i = 0; i <= n; i++) at(.15 + i * (L - .3) / n, 1.5, .07, 2.5, .07, "#2a2f3a");
                    at(L - .05, 1.5, .14, 2.8, .14, "#d4a64a");
                }
                drawn += 36;
            }
        }
        flushDyn(vp);
        flushShadows(vp);
        if (shadowOn) { gl.bindBuffer(gl.ARRAY_BUFFER, sdynBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(dynShadowP), gl.DYNAMIC_DRAW); sdynCount = dynShadowP.length / 3; dynShadowP = []; }
        // Day sky: sun disc + soft halo (opposite the light vector) and slow cloud banks. Translucent, no depth write.
        if (night < .6 && q !== "low") {
            // Cloud bank: ONE baked mesh (all puffs), drifted by translation => a single draw call.
            const ckey = "clouds|" + q;
            if (!bakedCache.has(ckey)) {
                recorder = { p: [], n: [], c: [] };
                try {
                    const nc = q === "medium" ? 6 : 10;
                    for (let i = 0; i < nc; i++) {
                        const cx0 = -80 + ((i * 61) % (domain_1.WORLD.width + 140)), cz0 = -50 + ((i * 43) % (domain_1.WORLD.height + 100)), cy0 = 46 + (i % 3) * 6;
                        draw("sphere", cx0, cy0, cz0, 16, 4.5, 9, "#ffffff", vp); draw("sphere", cx0 + 5, cy0 + 1.6, cz0 + 1, 11, 4.5, 8, "#f7fbff", vp); draw("sphere", cx0 - 5.5, cy0 + .5, cz0 - 1, 9, 3.4, 7, "#eef5ff", vp);
                    }
                } finally { const rec = recorder; recorder = null; commitRec(ckey, rec); }
            }
            gl.depthMask(false); curAlpha = .88 * (1 - night * .7);
            if (bakedCache.get(ckey) && meshes[ckey]) draw(ckey, Math.sin(input.time * .02) * 45, 0, 0, 1, 1, 1, "#ffffff", vp, .55);
            curAlpha = 1; gl.depthMask(true);
        }
        // Night: moon. Festival: sweeping sky beams over the event stage (translucent, no depth write).
        if (night > .3) draw("sphere", eye[0] - 38, eye[1] + 42, eye[2] - 62, 6, 6, 6, "#e9f0ff", vp, 1.6);
        if (fest && q !== "low" && nearCamera(97, 12, 40)) {
            const bc = ["#ff4fa3", "#4fd6ff", "#ffd166", "#8b6fd6", "#6dff9c"];
            gl.depthMask(false); curAlpha = .2;
            for (let i = 0; i < 5; i++) draw("cone", 89 + i * 4.2 + Math.sin(input.time * .9 + i) * 2.2, 8, 11.5 + Math.cos(input.time * .7 + i) * 1.2, 1.6, 16, 1.6, bc[i], vp, 1.2);
            gl.depthMask(true); curAlpha = 1;
        }
        // Event-night pass (Pass S): floodlit courts, lamp pools along the boulevard, Food Court string lights, Event Arena lanterns.
        // One baked emissive mesh per quality; only drawn once the night blend is up. Counts scale with the quality ladder.
        if (night > .3) drawn += drawBaked("nightlights|" + q, () => {
            const warm = "#ffe9a8", cool = "#f4f8ff";
            // Sports Ground: 4 floodlight towers per court + light pools on the playing surfaces.
            const towers = [[80.4, 63.4], [100.2, 63.4], [80.4, 76.6], [100.2, 76.6], [102.4, 63.4], [115.4, 63.4], [102.4, 76.6], [115.4, 76.6]];
            for (const [tx, tz] of towers) { draw("cylinder", tx, 3.4, tz, .18, 6.8, .18, "#2a3a55", vp); draw("box", tx, 6.9, tz, 1.3, .35, .6, cool, vp, 1.4); }
            draw("box", 90.5, .08, 70, 18, .02, 11.6, "#fffbe0", vp, .45); draw("box", 109, .08, 70, 11, .02, 10.2, "#fff2cf", vp, .45);
            // Grand Boulevard lamp pools (matches the lamp posts drawn at 55.6/64.4).
            const step = q === "low" ? 18 : 9;
            for (let zz = 8; zz < 78; zz += step) for (const side of [55.6, 64.4]) draw("cylinder", side, .07, zz, 3.4, .02, 3.4, warm, vp, .5);
            if (q === "low") return;
            // Food Court: two strings of warm bulbs between posts.
            for (const zz of [44, 54]) for (let xx = 80; xx <= 98; xx += 1.2) { const sag = Math.sin(((xx - 80) / 18) * Math.PI * 3) * .18; draw("sphere", xx, 3.2 - Math.abs(sag), zz, .22, .22, .22, hash2(xx, zz) > .5 ? warm : "#ffc86b", vp, 1.6); }
            // Event Arena: perimeter lanterns in the zone colours.
            const cols = ["#ff4fa3", "#4fd6ff", "#ffd166", "#8b6fd6", "#6dff9c"]; let k = 0;
            for (let xx = 80; xx <= 114; xx += 3.4) for (const zz of [6, 34]) { draw("cylinder", xx, 1.1, zz, .1, 2.2, .1, "#2a3a55", vp); draw("sphere", xx, 2.4, zz, .46, .46, .46, cols[k++ % 5], vp, 1.5); }
            if (q === "high") for (let zz = 10; zz < 76; zz += 9) for (const side of [55.6, 64.4]) draw("sphere", side, 3.3, zz, 1.5, 1.2, 1.5, warm, vp, .35); // soft halo around each lamp head
        }, vp);
        const labels = overlayLabels(overlay, input, vp);
        return { drawn, culled, labels, calls, tris: Math.round(trisFrame), shadows: shadowOn, byShape: callBy };
    };
    return { render, resize, registerMesh, unregisterMesh, setSkinnedCharacter, destroy: () => { for (const m of Object.values(meshes)) {
            gl.deleteBuffer(m.p);
            gl.deleteBuffer(m.n);
            gl.deleteBuffer(m.c);
        } gl.deleteProgram(program); if (iprog) gl.deleteProgram(iprog); if (ibuf) gl.deleteBuffer(ibuf);
        // Pass N7: also release the sky dome, sun-shadow programs/buffer and shadow framebuffer/textures (previously leaked on every teardown).
        if (skyProg) gl.deleteProgram(skyProg); if (skyBuf) gl.deleteBuffer(skyBuf); if (sprog) gl.deleteProgram(sprog); if (sprogI) gl.deleteProgram(sprogI); if (sdynBuf) gl.deleteBuffer(sdynBuf);
        if (shadowFbo) gl.deleteFramebuffer(shadowFbo); if (shadowDepth) gl.deleteTexture(shadowDepth); if (shadowColor) gl.deleteTexture(shadowColor);
        bakedCache.clear(); } };
}
const PITCHED = { dorm: 1, shop: 1, lounge: 1, canteen: 1, clinic: 1, hall: 1 };
const TILES = ["#b8613f", "#a65a3c", "#c9724a", "#8f4e38"];
function inBuildingWall(s, b) { return s.x >= b.x - .01 && s.x + s.w <= b.x + b.w + .01 && s.y >= b.y - .01 && s.y + s.h <= b.y + b.h + .01; }
function mixHex(a, b, t) { const pa = parseInt(a.replace("#", ""), 16), pb = parseInt(b.replace("#", ""), 16); const m = (sh) => Math.round(((pa >> sh) & 255) * (1 - t) + ((pb >> sh) & 255) * t); return "#" + ((m(16) << 16) | (m(8) << 8) | m(0)).toString(16).padStart(6, "0"); }
function shadeHex(hex, amount) { const n = parseInt(hex.replace("#", ""), 16); const f = (c) => Math.max(0, Math.min(255, Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount)))); return `#${((1 << 24) | (f(n >> 16) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).slice(1)}`; }
