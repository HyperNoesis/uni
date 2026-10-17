#!/usr/bin/env python3
"""Software (numpy) preview of the Grand Gate scene straight from the shipped GLBs + gate_road.json decor.
NOT the game renderer: no shadows/PBR/shader detail. It exists to verify geometry, scale, composition and sightlines when a GPU browser is unavailable.
Usage (repo root): python3 scripts/world/preview-grand-gate.py [outDir]
"""
import json, math, os, struct, sys
import numpy as np
from PIL import Image, ImageDraw

OUT = sys.argv[1] if len(sys.argv) > 1 else "docs/evidence/grand-gate"
os.makedirs(OUT, exist_ok=True)
ZONE = json.load(open("packages/domain/src/world-data/zones/gate_road.json"))
ASSETS = {a["id"]: a for a in json.load(open("packages/domain/src/world-data/assets.json"))["assets"]}
GATE_DIR = "apps/web/public/assets/gate"
_cache = {}

def load(name):
    if name in _cache: return _cache[name]
    b = open(f"{GATE_DIR}/{name}.glb", "rb").read()
    jl = struct.unpack("<I", b[12:16])[0]; j = json.loads(b[20:20 + jl]); off = 20 + jl + 8
    bv = j["bufferViews"]; acc = j["accessors"]
    def rd(i, dt, cols):
        v = bv[acc[i]["bufferView"]]; return np.frombuffer(b[off + v["byteOffset"]: off + v["byteOffset"] + v["byteLength"]], dtype=dt)[: acc[i]["count"] * cols]
    P = rd(0, "<f4", 3).reshape(-1, 3).astype(np.float64); N = rd(1, "<f4", 3).reshape(-1, 3).astype(np.float64); Cc = rd(2, "<f4", 3).reshape(-1, 3).astype(np.float64)
    I = rd(3, "<u2", 1).astype(np.int64).reshape(-1, 3)
    _cache[name] = (P, N, Cc, I); return _cache[name]

def build_scene():
    Ps, Ns, Cs, Is = [], [], [], []; base = 0
    def push(P, N, C, I):
        nonlocal base
        Ps.append(P); Ns.append(N); Cs.append(C); Is.append(I + base); base += len(P)
    for d in ZONE["decor"]:
        m = d["model"]; th = d.get("rot", 0.0); a = ASSETS.get(m); yo = a["yOffset"] if a else 0
        P, N, C, I = load(m); c, s = math.cos(th), math.sin(th)
        R = np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])
        push(P @ R.T + np.array([d["x"], yo, d["y"]]), N @ R.T, C, I)
    # ground: grass everywhere, asphalt road deck (x 48..72, y 80..150), subdivided so near-plane clipping never eats it
    def quadgrid(x0, x1, z0, z1, col, y, n):
        xs = np.linspace(x0, x1, n + 1); zs = np.linspace(z0, z1, n + 1)
        P = np.array([[x, y, z] for z in zs for x in xs]); I = []
        for r in range(n):
            for q in range(n):
                a = r * (n + 1) + q; I += [[a, a + n + 1, a + 1], [a + 1, a + n + 1, a + n + 2]]
        push(P, np.tile([0, 1, 0.0], (len(P), 1)), np.tile(col, (len(P), 1)), np.array(I))
    quadgrid(-20, 140, 40, 220, [0.30, 0.46, 0.27], -0.01, 24)
    quadgrid(48, 72, 60, 150, [0.30, 0.31, 0.33], 0.0, 20)
    # human-scale figures (1.75 m) for scale
    def person(x, z, col, h=1.75):
        parts = [(0.14, 0.0, 0.26, 0.5, 0.2, [0.15, 0.17, 0.3]), (-0.14, 0.0, 0.26, 0.5, 0.2, [0.15, 0.17, 0.3])]
        Pp, Ip = [], []
        def box(cx, y0, w, hh, dd, cc):
            hx, hz = w / 2, dd / 2; v = np.array([[cx - hx, y0, -hz], [cx + hx, y0, -hz], [cx + hx, y0, hz], [cx - hx, y0, hz], [cx - hx, y0 + hh, -hz], [cx + hx, y0 + hh, -hz], [cx + hx, y0 + hh, hz], [cx - hx, y0 + hh, hz]])
            f = [[0, 1, 2], [0, 2, 3], [4, 6, 5], [4, 7, 6], [0, 4, 5], [0, 5, 1], [1, 5, 6], [1, 6, 2], [2, 6, 7], [2, 7, 3], [3, 7, 4], [3, 4, 0]]
            return v + np.array([x, 0, z]), np.array(f), cc
        for (cx, y0, w, hh, dd, cc) in [(-0.11, 0.0, 0.2, 0.85, 0.22, [0.12, 0.14, 0.25]), (0.11, 0.0, 0.2, 0.85, 0.22, [0.12, 0.14, 0.25]), (0, 0.85, 0.5, 0.55, 0.26, col), (0, 1.4, 0.2, 0.3, 0.2, [0.45, 0.3, 0.2])]:
            v, f, cc = box(cx, y0, w, hh, dd, cc); push(v, np.tile([0, 1, 0.0], (8, 1)), np.tile(cc, (8, 1)), f)
    for x, z, col in [(56, 150.5, [0.8, 0.2, 0.2]), (64.5, 148.4, [0.9, 0.8, 0.2]), (60, 143.2, [0.2, 0.6, 0.8]), (58, 137.5, [0.9, 0.9, 0.9]), (63, 129.5, [0.7, 0.3, 0.6]), (60.5, 120, [0.2, 0.7, 0.4])]: person(x, z, col)
    return np.vstack(Ps), np.vstack(Ns), np.vstack(Cs), np.vstack(Is)

KF = [(0.0, (60, 1.7, 194), (60, 14, 132), 72), (0.35, (60, 3.2, 176), (60, 22, 132), 66), (0.7, (60, 2.6, 162), (60, 13, 132), 62), (1.0, (60, 2.4, 155.5), (60, 6.5, 124), 58)]
def _ss(x): return x * x * (3 - 2 * x)
def intro(t):  # mirrors apps/web/lib/gate-intro.ts
    for i in range(len(KF) - 1):
        a, b = KF[i], KF[i + 1]
        if t <= b[0] or i == len(KF) - 2:
            u = _ss(min(1, max(0, (t - a[0]) / (b[0] - a[0])))); L = lambda p, q: tuple(p[k] + (q[k] - p[k]) * u for k in range(3) if True)
            return L(a[1], b[1]), L(a[2], b[2]), a[3] + (b[3] - a[3]) * u
INTRO = {}
for _i, _t in enumerate([0, 0.33, 0.66, 1.0]): _e, _g, _f = intro(_t); INTRO[f"07_intro_t{_i}"] = (_e, _g, _f)
SUN = np.array([-0.45, 0.78, 0.43]); SUN /= np.linalg.norm(SUN)
SKY_T, SKY_H = np.array([0.36, 0.58, 0.88]), np.array([0.86, 0.9, 0.94])

def render(scene, eye, tgt, fov, W, H, label):
    P, N, Cc, I = scene
    eye = np.array(eye, float); f = np.array(tgt, float) - eye; f /= np.linalg.norm(f); r = np.cross(f, [0, 1, 0]); r /= np.linalg.norm(r); u = np.cross(r, f)
    rel = P - eye; xc, yc, zc = rel @ r, rel @ u, rel @ f
    asp = W / H; t = math.tan(math.radians(fov) / 2)
    sx = (xc / (zc * t * asp) * 0.5 + 0.5) * W; sy = (0.5 - yc / (zc * t) * 0.5) * H
    light = 0.40 + 0.60 * np.clip(N @ SUN, 0, 1) + 0.10 * (N[:, 1] * 0.5 + 0.5)
    emi = Cc.max(axis=1) > 1.5
    col = np.where(emi[:, None], np.clip(Cc - 2.0, 0, 1) * 1.15 + 0.12, np.clip(Cc * light[:, None] * np.array([1.04, 1.0, 0.94]), 0, 1))
    fog = 1 - np.exp(-np.maximum(zc, 0) / 330.0); col = col * (1 - fog[:, None] * 0.55) + SKY_H * fog[:, None] * 0.55
    img = np.zeros((H, W, 3)); yy = np.linspace(0, 1, H)[:, None]
    hor = 0.5 - (math.atan2(f[1], 1) / math.radians(fov)) * 0.0
    img[:] = (SKY_T * (1 - yy) + SKY_H * yy)[:, None, :].repeat(W, 1) if False else (SKY_T[None, None, :] * (1 - yy[:, :, None]) + SKY_H[None, None, :] * yy[:, :, None]).repeat(W, 1)
    zb = np.full((H, W), np.inf)
    ok = zc > 0.3
    tri = I[ok[I].all(axis=1)]
    xa, ya, za = sx[tri], sy[tri], zc[tri]  # (n,3)
    keep = (xa.max(1) >= 0) & (xa.min(1) < W) & (ya.max(1) >= 0) & (ya.min(1) < H)
    tri, xa, ya, za = tri[keep], xa[keep], ya[keep], za[keep]
    order = np.argsort(-za.mean(1))  # far to near (z-buffer still exact)
    for k in order:
        x0, x1, x2 = xa[k]; y0, y1, y2 = ya[k]
        den = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
        if abs(den) < 1e-9: continue
        bx0, bx1 = max(int(math.floor(min(x0, x1, x2))), 0), min(int(math.ceil(max(x0, x1, x2))), W - 1)
        by0, by1 = max(int(math.floor(min(y0, y1, y2))), 0), min(int(math.ceil(max(y0, y1, y2))), H - 1)
        if bx1 < bx0 or by1 < by0: continue
        gx, gy = np.meshgrid(np.arange(bx0, bx1 + 1) + 0.5, np.arange(by0, by1 + 1) + 0.5)
        l0 = ((y1 - y2) * (gx - x2) + (x2 - x1) * (gy - y2)) / den; l1 = ((y2 - y0) * (gx - x2) + (x0 - x2) * (gy - y2)) / den; l2 = 1 - l0 - l1
        m = (l0 >= -1e-4) & (l1 >= -1e-4) & (l2 >= -1e-4)
        if not m.any(): continue
        iz = l0 / za[k, 0] + l1 / za[k, 1] + l2 / za[k, 2]; z = 1 / np.maximum(iz, 1e-9)
        sub = zb[by0:by1 + 1, bx0:bx1 + 1]; mm = m & (z < sub)
        if not mm.any(): continue
        sub[mm] = z[mm]
        c = col[tri[k]]; img[by0:by1 + 1, bx0:bx1 + 1][mm] = (l0[mm, None] * c[0] + l1[mm, None] * c[1] + l2[mm, None] * c[2])
    im = Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8))
    return im

if __name__ == "__main__":
    scene = build_scene(); print("scene tris:", len(scene[3]))
    W, H, S = 960, 540, 1.0
    G = (60, 132)
    views = {
        "01_approach_eye_level": ((60, 1.7, G[1] + 52), (60, 11, G[1]), 62),
        "02_front_three_quarter": ((60 + 56, 9.0, G[1] + 46), (60, 10.0, G[1] + 2), 55),
        "03_back": ((60 + 16, 3.0, G[1] - 40), (60, 11.0, G[1]), 58),
        "04_side": ((60 + 88, 7.0, G[1] - 20), (60 + 10, 9.0, G[1] + 2), 50),
        "05_aerial": ((60 + 30, 62, G[1] + 80), (60, 5, G[1] + 2), 52),
        "06_lane_into_campus": ((60.4, 1.7, G[1] + 17), (60, 4.0, G[1] - 50), 66),
    }
    for nm, (e, t, fov) in INTRO.items(): views[nm] = (e, t, fov)
    sheet = Image.new("RGB", (W * 2 // 2 * 1, H)); ims = []
    for name, (e, t, fov) in views.items():
        im = render(scene, e, t, fov, W, H, name); im.save(f"{OUT}/{name}.png"); ims.append((name, im)); print("saved", name, flush=True)
    for i, (name, im) in enumerate(ims[6:]): im.save(f"{OUT}/{name}.png")
    fs = Image.new("RGB", (W // 2 * 4, H // 2))
    for i, (name, im) in enumerate(ims[6:]): fs.paste(im.resize((W // 2, H // 2), Image.LANCZOS), (i * W // 2, 0))
    fs.save(f"{OUT}/intro_filmstrip.png")
    ims = ims[:6]
    sheet = Image.new("RGB", (W // 2 * 3, H // 2 * 2))
    for i, (name, im) in enumerate(ims):
        s = im.resize((W // 2, H // 2), Image.LANCZOS); d = ImageDraw.Draw(s); d.rectangle([0, 0, 230, 16], fill=(20, 30, 50)); d.text((4, 2), name, fill=(255, 255, 255)); sheet.paste(s, ((i % 3) * W // 2, (i // 3) * H // 2))
    sheet.save(f"{OUT}/contact_sheet.png")
