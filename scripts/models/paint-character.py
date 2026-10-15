#!/usr/bin/env python3
"""Paint + dress CAMPUS's skinned character (numpy only, deterministic).

Input : a *base* skinned GLB produced by build-character.py (Quaternius Universal Animation Library, CC0), kept in
        scripts/models/base/campus_body_base.glb and campus_body_lod_base.glb so this step is repeatable without the source pack.
Output: apps/web/public/assets/characters/campus_body.glb (+ _lod).  Same skeleton, same clips, same loader.

What it adds (all of it skinned to the same 23 joints, so it follows every animation):
  1. Stylisation: head +8 %, chunkier shoes.
  2. Plane slicing: the body is cut along collar / hem / sleeve / cuff / pants-cuff / sock / sole / hairline planes. Every cut vertex is
     DUPLICATED a hair either side of the plane, so a colour boundary is a crisp seam, not a blurry gradient across a big triangle.
  3. `_PAINT` vertex attribute (4 x uint8): [material id, baked ambient occlusion, 0, 0]. Material ids are semantic (SLEEVE_HEM, SOCK,
     SHOE_SOLE ...); the game maps them to colours per player in apps/web/lib/avatar-paint.ts (outfit, shoes, hair colour, top style).
  4. Optional geometry groups (hood, kaftan skirt, backpack, satchel, chain), each a contiguous vertex/index range that the game
     only skins and draws when the player's customisation asks for it (extras.campus.groups).
  5. Ambient occlusion is ray-cast on the body posed with Stand_Loop (arms DOWN), so armpits, under-chin, crotch, hood and straps
     are dark even though the bind pose is a T-pose.

Usage: python3 scripts/models/paint-character.py [--tris-report]
"""
import json, math, struct, sys
from pathlib import Path
import numpy as np

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
OUT_DIR = ROOT / "apps/web/public/assets/characters"

# ---------------------------------------------------------------- material ids (mirror apps/web/lib/avatar-paint.ts)
MAT = dict(SKIN=0, TORSO=1, SLEEVE=2, SLEEVE_HEM=3, FOREARM=4, CUFF=5, HAND=6, HEM=7, COLLAR=8, POCKET=9, SASH=10,
           PANTS=11, PANTS_CUFF=12, SOCK=13, SHOE_UPPER=14, SHOE_SOLE=15, BOOT_SHAFT=16, BOOT_TOP=17, HAIR_TOP=18, HAIR_LOW=19,
           HOOD=20, HOOD_INNER=21, SKIRT=22, SKIRT_HEM=23, PACK=24, PACK_ACCENT=25, STRAP=26, SATCHEL=27, SATCHEL_FLAP=28, BUCKLE=29, CHAIN=30,
           FACE_EYE=31, FACE_IRIS=32, FACE_BROW=33, FACE_MOUTH=34, FACE_TEETH=35, NOSE=36, EAR=37, GLASS_FRAME=38, LENS=39, PHONE_BAND=40, PHONE_CUP=41,
           CAP=42, CAP_VISOR=43, WRAP=44, WRAP_BAND=45, HAIR=46)

CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


# ---------------------------------------------------------------- GLB io
def load_glb(path):
    b = Path(path).read_bytes()
    jl, _ = struct.unpack_from("<II", b, 12); js = json.loads(b[20:20 + jl]); off = 20 + jl
    bl, _ = struct.unpack_from("<II", b, off)
    return js, b[off + 8: off + 8 + bl]


def read_acc(js, bin_, i):
    a = js["accessors"][i]; bv = js["bufferViews"][a["bufferView"]]
    dt = np.dtype(CT[a["componentType"]]); nc = NC[a["type"]]
    o = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
    return np.frombuffer(bin_, dtype=dt, count=a["count"] * nc, offset=o).reshape(a["count"], nc).copy()


def quat_mat(q):
    x, y, z, w = q; xx, yy, zz, xy, xz, yz, wx, wy, wz = x*x, y*y, z*z, x*y, x*z, y*z, w*x, w*y, w*z
    return np.array([[1-2*(yy+zz), 2*(xy-wz), 2*(xz+wy)], [2*(xy+wz), 1-2*(xx+zz), 2*(yz-wx)], [2*(xz-wy), 2*(yz+wx), 1-2*(xx+yy)]])


class Base:
    """The base character: geometry + skeleton, with dense (n,K) skin weights so interpolation is trivial."""
    def __init__(self, path):
        self.js, self.bin = load_glb(path)
        js, b = self.js, self.bin
        prim = js["meshes"][0]["primitives"][0]; at = prim["attributes"]
        self.P = read_acc(js, b, at["POSITION"]).astype(np.float64); self.N = read_acc(js, b, at["NORMAL"]).astype(np.float64)
        J = read_acc(js, b, at["JOINTS_0"]).astype(int); Wt = read_acc(js, b, at["WEIGHTS_0"]).astype(np.float64)
        self.F = read_acc(js, b, prim["indices"]).reshape(-1, 3).astype(np.int64)
        sk = js["skins"][0]; self.joint_nodes = sk["joints"]; self.K = len(self.joint_nodes)
        self.names = [js["nodes"][n]["name"] for n in self.joint_nodes]; self.ix = {n: i for i, n in enumerate(self.names)}
        self.W = np.zeros((len(self.P), self.K))
        for k in range(4): self.W[np.arange(len(self.P)), J[:, k]] += Wt[:, k]
        self.ibm = read_acc(js, b, sk["inverseBindMatrices"]).reshape(-1, 4, 4).transpose(0, 2, 1)  # true matrices
        self.bind_pos = np.stack([np.linalg.inv(m)[:3, 3] for m in self.ibm])

    def dom(self, W=None):
        return (self.W if W is None else W).argmax(1)


# ---------------------------------------------------------------- plane slicing with duplicated cut vertices
class Mesh:
    def __init__(self, P, N, W, F):
        self.P, self.N, self.W, self.F = [p for p in P], [n for n in N], [w for w in W], [tuple(f) for f in F]

    def cut(self, nrm, d, scope=None, eps=1e-5):
        nrm = np.asarray(nrm, float); ln = np.linalg.norm(nrm); nrm = nrm / ln; d = d / ln
        P = np.array(self.P); sd = P @ nrm - d
        cache = {}
        out = []

        def lerp_vert(u, v, t):
            p = self.P[u] * (1 - t) + self.P[v] * t
            n = self.N[u] * (1 - t) + self.N[v] * t; n = n / (np.linalg.norm(n) or 1)
            w = self.W[u] * (1 - t) + self.W[v] * t; w = w / (w.sum() or 1)
            return p, n, w

        def add(p, n, w):
            self.P.append(p); self.N.append(n); self.W.append(w); return len(self.P) - 1

        def edge_cut(u, v):
            key = (min(u, v), max(u, v))
            if key not in cache:
                a, b = key; t = sd[a] / (sd[a] - sd[b]); p, n, w = lerp_vert(a, b, t)
                cache[key] = (add(p + nrm * eps, n, w.copy()), add(p - nrm * eps, n, w.copy()))  # (hi, lo)
            return cache[key]

        zero_lo = {}

        def lo_copy(v):
            if v not in zero_lo: zero_lo[v] = add(self.P[v] - nrm * eps, self.N[v].copy(), self.W[v].copy())
            return zero_lo[v]

        for tri in self.F:
            s = [sd[i] for i in tri]
            if scope is not None and not scope((self.P[tri[0]] + self.P[tri[1]] + self.P[tri[2]]) / 3):
                out.append(tri); continue
            if not (any(x > 1e-9 for x in s) and any(x < -1e-9 for x in s)):
                out.append(tri); continue
            pos, neg = [], []
            for i in range(3):
                u, v = tri[i], tri[(i + 1) % 3]; su, sv = s[i], s[(i + 1) % 3]
                if su >= 0: pos.append(u)
                if su < 0: neg.append(u)
                elif abs(su) <= 1e-9: neg.append(lo_copy(u))
                if (su > 1e-9 and sv < -1e-9) or (su < -1e-9 and sv > 1e-9):
                    hi, lo = edge_cut(u, v); pos.append(hi); neg.append(lo)
            for poly in (pos, neg):
                for k in range(1, len(poly) - 1): out.append((poly[0], poly[k], poly[k + 1]))
        self.F = out

    def arrays(self):
        return np.array(self.P), np.array(self.N), np.array(self.W), np.array(self.F, dtype=np.int64)


def smooth_normals(P, F):
    N = np.zeros_like(P)
    for a, b, c in F:
        n = np.cross(P[b] - P[a], P[c] - P[a]); N[a] += n; N[b] += n; N[c] += n
    L = np.linalg.norm(N, axis=1, keepdims=True); N = np.where(L > 1e-12, N / np.maximum(L, 1e-12), np.array([0.0, 1.0, 0.0]))
    return N


# ---------------------------------------------------------------- classification (rest space, +z = forward, T-pose arms along x)
def classify(P, N, dom_names, cfg):
    mat = np.zeros(len(P), np.uint8)
    for i, (p, n, dn) in enumerate(zip(P, N, dom_names)):
        x, y, z = abs(p[0]), p[1], p[2]
        arm = dn.startswith(("shoulder", "upper_arm", "forearm", "hand"))
        leg = dn.startswith(("thigh", "shin", "foot", "toe"))
        m = MAT["TORSO"]
        if dn == "head":
            m = MAT["SKIN"]
            if cfg["hair"] and (y - 0.6 * z) >= cfg["hairA"]: m = MAT["HAIR_TOP"]
        elif x < 0.115 and y >= 1.525 and not leg and not dn.startswith(("hand", "forearm")): m = MAT["SKIN"]
        elif arm and x >= 0.13 and y > 1.3:
            m = MAT["SLEEVE"] if x < 0.335 else MAT["FOREARM"] if x < 0.69 else MAT["HAND"]
        elif leg and y < 0.885 and not (dn.startswith("thigh") and y > 0.5):
            if y >= 0.30: m = MAT["PANTS"]
            elif y >= 0.15: m = MAT["BOOT_SHAFT"]
            elif y >= 0.08: m = MAT["SOCK"]
            elif y >= 0.035: m = MAT["SHOE_UPPER"]
            else: m = MAT["SHOE_SOLE"]
        else:  # torso, hips, upper legs, shoulders' inner part
            m = MAT["PANTS"] if y < 0.885 else MAT["TORSO"]
        mat[i] = m
    return mat


# ---------------------------------------------------------------- parametric skinned extras
def weights_row(K, d):
    w = np.zeros(K)
    for j, v in d.items(): w[j] += v
    return w / w.sum()


class Extra:
    def __init__(self): self.P, self.N, self.W, self.M, self.F = [], [], [], [], []

    def vert(self, p, n, w, m):
        self.P.append(np.asarray(p, float)); self.N.append(np.asarray(n, float)); self.W.append(w); self.M.append(m); return len(self.P) - 1

    def grid(self, pts, nrm, wts, mats, wrap_u=False, flip=False):
        """pts/nrm: (rows, cols, 3) ; wts: (rows, cols, K) ; mats: (rows, cols). Quads -> 2 tris."""
        R, C = len(pts), len(pts[0]); idx = [[self.vert(pts[r][c], nrm[r][c], wts[r][c], mats[r][c]) for c in range(C)] for r in range(R)]
        cn = C if wrap_u else C - 1
        for r in range(R - 1):
            for c in range(cn):
                a, b, c2, d = idx[r][c], idx[r][(c + 1) % C], idx[r + 1][(c + 1) % C], idx[r + 1][c]
                self.F += ([(a, d, c2), (a, c2, b)] if flip else [(a, b, c2), (a, c2, d)])
        return idx

    def fan_cap(self, idx_ring, center_p, center_n, w, m, flip=False):
        c = self.vert(center_p, center_n, w, m); n = len(idx_ring)
        for i in range(n):
            a, b = idx_ring[i], idx_ring[(i + 1) % n]; self.F.append((c, b, a) if flip else (c, a, b))


def tidy(P, F):
    """Drop zero-area triangles (superellipsoid poles) so smooth normals never hit 0/0."""
    keep = [f for f in F if np.linalg.norm(np.cross(P[f[1]] - P[f[0]], P[f[2]] - P[f[0]])) > 1e-10]
    return np.array(keep, dtype=np.int64)


def superellipsoid(ex, center, size, expo, K, wfun, mat_fun, nu=12, nv=7, v0=-math.pi / 2):
    """Rounded box: parametric superellipsoid, axis-aligned, `size` = full extents."""
    def sgn_pow(v, e): return math.copysign(abs(v) ** e, v)
    pts, nrm, wts, mats = [], [], [], []
    for r in range(nv + 1):
        v = v0 + (math.pi / 2 - v0) * r / nv; prow, nrow, wrow, mrow = [], [], [], []
        for c in range(nu):
            u = 2 * math.pi * c / nu
            cx = sgn_pow(math.cos(v), expo) * sgn_pow(math.cos(u), expo); cy = sgn_pow(math.sin(v), expo); cz = sgn_pow(math.cos(v), expo) * sgn_pow(math.sin(u), expo)
            p = np.array([center[0] + cx * size[0] / 2, center[1] + cy * size[1] / 2, center[2] + cz * size[2] / 2])
            n = np.array([cx / (size[0] / 2) ** 1, cy / (size[1] / 2), cz / (size[2] / 2)]); n = n / (np.linalg.norm(n) or 1)
            prow.append(p); nrow.append(n); wrow.append(wfun(p)); mrow.append(mat_fun(p, n))
        pts.append(prow); nrm.append(nrow); wts.append(wrow); mats.append(mrow)
    ex.grid(pts, nrm, wts, mats, wrap_u=True)


def build_hood(B, lod):
    K = B.K; ex = Extra(); ix = B.ix; nseg, nring = (8, 4) if lod else (12, 5)
    w = weights_row(K, {ix["spine.003"]: .5, ix["neck"]: .3, ix["head"]: .2})
    Rx, Rz, cz, cy, rm, ry = 0.15, 0.135, -0.07, 1.515, 0.052, 0.05
    a0, a1 = math.radians(-128), math.radians(128)
    pts, nrm, wts, mats = [], [], [], []
    for i in range(nseg + 1):
        th = a0 + (a1 - a0) * i / nseg; sx, sz = math.sin(th), -math.cos(th)
        prow, nrow, wrow, mrow = [], [], [], []
        for j in range(nring):
            ph = 2 * math.pi * j / nring; cr, sr = math.cos(ph), math.sin(ph)
            radial = np.array([sx, 0, sz]); out = np.array([sx * (Rx + rm * cr), ry * sr, sz * (Rz + rm * cr)])
            p = np.array([0, cy, cz]) + out
            n = np.array([sx * cr / 1.0, sr, sz * cr]); n = n / (np.linalg.norm(n) or 1)
            prow.append(p); nrow.append(n); wrow.append(w); mrow.append(MAT["HOOD_INNER"] if cr < -0.35 else MAT["HOOD"])
        pts.append(prow); nrm.append(nrow); wts.append(wrow); mats.append(mrow)
    idx = ex.grid(pts, nrm, wts, mats, wrap_u=True)
    return ex


def build_skirt(B, lod):
    K = B.K; ex = Extra(); ix = B.ix; nseg = 8 if lod else 12
    rings = [(0.935, .165, .145, 0.0, MAT["SKIRT"]), (0.80, .20, .17, .15, MAT["SKIRT"]), (0.64, .245, .20, .5, MAT["SKIRT"]), (0.47, .285, .225, .85, MAT["SKIRT"]), (0.44, .292, .23, .9, MAT["SKIRT_HEM"]), (0.39, .30, .235, 1.0, MAT["SKIRT_HEM"])]
    if lod: rings = [rings[0], rings[2], rings[3], rings[5]]
    pts, nrm, wts, mats = [], [], [], []
    for (y, rx, rz, f, m) in rings:
        prow, nrow, wrow, mrow = [], [], [], []
        for c in range(nseg):
            u = 2 * math.pi * c / nseg; sx, sz = math.sin(u), math.cos(u)
            p = np.array([sx * rx, y, sz * rz]); n = np.array([sx / rx, 0.35, sz / rz]); n = n / np.linalg.norm(n)
            side = 1 if sx > 0.15 else (-1 if sx < -0.15 else 0)
            th = ix["thigh.L"] if sx >= 0 else ix["thigh.R"]
            blend = min(1.0, abs(sx) / 0.5 + 0.35) * f * 0.7
            wrow.append(weights_row(K, {ix["hips"]: 1 - blend, th: blend})); prow.append(p); nrow.append(n); mrow.append(m)
        pts.append(prow); nrm.append(nrow); wts.append(wrow); mats.append(mrow)
    ex.grid(pts, nrm, wts, mats, wrap_u=True, flip=True)
    return ex


def build_backpack(B, lod, torso_ray):
    K = B.K; ex = Extra(); ix = B.ix
    wb = weights_row(K, {ix["spine.003"]: .7, ix["spine.002"]: .3})
    cz = -0.22
    superellipsoid(ex, (0, 1.255, cz), (0.31, 0.40, 0.13), 0.38, K, lambda p: wb,
                   lambda p, n: MAT["PACK"], nu=8 if lod else 10, nv=4 if lod else 5)
    superellipsoid(ex, (0, 1.12, cz - 0.075), (0.23, 0.17, 0.07), 0.4, K, lambda p: wb,
                   lambda p, n: MAT["PACK_ACCENT"], nu=6 if lod else 8, nv=3 if lod else 4)
    if not lod:
        for sx in (-1, 1): strap(ex, B, torso_ray, sx * 0.095, wb, MAT["STRAP"])
    return ex


def strap(ex, B, ray, x, wb, matid):
    """Shoulder strap: pack top -> over the shoulder -> down the chest, hugging the real body surface (ray-projected)."""
    path = []
    for z in np.linspace(-0.14, 0.075, 5):               # over the shoulder: cast down from above
        y = ray(np.array([x, 2.2, z]), np.array([0, -1, 0]));
        if y is not None: path.append(np.array([x, y[1] + 0.012, z]))
    for yy in np.linspace(1.47, 1.16, 5):                # down the chest: cast back from the front
        h = ray(np.array([x * 1.05, yy, 1.0]), np.array([0, 0, -1]))
        if h is not None: path.append(np.array([x * 1.05, yy, h[2] + 0.012]))
    if len(path) < 3: return
    half, thick = 0.017, 0.006; rows = []
    for i, p in enumerate(path):
        t = path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]; t = t / (np.linalg.norm(t) or 1)
        side = np.array([1.0, 0, 0]); nrm = np.cross(t, side); nrm = nrm / (np.linalg.norm(nrm) or 1)
        if nrm[1] + nrm[2] < 0: nrm = -nrm
        rows.append([p - side * half + nrm * thick, p + side * half + nrm * thick, p + side * half - nrm * 0.0, p - side * half - nrm * 0.0])
        rows[-1] = (rows[-1], nrm)
    pts = [[r[0][0], r[0][1]] for r in rows]; nrm = [[r[1], r[1]] for r in rows]; wts = [[wb, wb] for _ in rows]; mats = [[matid, matid] for _ in rows]
    ex.grid(pts, nrm, wts, mats)


def build_satchel(B, lod, torso_ray):
    K = B.K; ex = Extra(); ix = B.ix
    wb = weights_row(K, {ix["hips"]: .55, ix["spine.001"]: .45})
    superellipsoid(ex, (0.215, 0.99, -0.015), (0.075, 0.19, 0.25), 0.34, K, lambda p: wb, lambda p, n: MAT["SATCHEL"], nu=6 if lod else 8, nv=3 if lod else 4)
    superellipsoid(ex, (0.215, 1.065, -0.015), (0.083, 0.07, 0.26), 0.34, K, lambda p: wb, lambda p, n: MAT["SATCHEL_FLAP"], nu=6 if lod else 8, nv=2 if lod else 3)
    if not lod:  # cross-body strap: right shoulder -> left hip, projected on the torso
        wst = weights_row(K, {ix["spine.003"]: .5, ix["spine.002"]: .5})
        path = []
        for t in np.linspace(0, 1, 7):
            x = -0.07 + t * 0.26; y = 1.46 - t * 0.43
            h = torso_ray(np.array([x, y, 1.0]), np.array([0, 0, -1]))
            if h is not None: path.append(np.array([x, y, h[2] + 0.012]))
        if len(path) > 2:
            rows, nr = [], []
            for i, p in enumerate(path):
                t = path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]; t = t / (np.linalg.norm(t) or 1)
                side = np.cross(t, np.array([0, 0, 1.0])); side = side / (np.linalg.norm(side) or 1)
                rows.append([p - side * 0.016, p + side * 0.016]); nr.append([np.array([0, 0.2, 1.0]) / math.hypot(.2, 1)] * 2)
            ex.grid(rows, nr, [[wst, wst]] * len(rows), [[MAT["STRAP"]] * 2] * len(rows))
    return ex


def build_chain(B, lod):
    K = B.K; ex = Extra(); ix = B.ix; n = 12 if lod else 18
    w = weights_row(K, {ix["spine.003"]: .6, ix["neck"]: .4})
    top, bot, nt, nb_, wr, mr = [], [], [], [], [], []
    for i in range(n):
        u = 2 * math.pi * i / n; sx, sz = math.sin(u), math.cos(u)
        front = max(0.0, sz)
        y = 1.46 - 0.17 * front ** 2                          # sags into a V on the chest
        r = 0.112 + 0.03 * front
        c = np.array([sx * r, y, -0.055 + sz * r * 0.95 + 0.02 * front])
        top.append(c + np.array([0, 0.007, 0])); bot.append(c - np.array([0, 0.007, 0]))
        nn = np.array([sx, 0.3, sz]); nn = nn / np.linalg.norm(nn); nt.append(nn); nb_.append(nn); wr.append(w); mr.append(MAT["CHAIN"])
    ex.grid([top, bot], [nt, nb_], [wr, wr], [mr, mr], wrap_u=True)
    superellipsoid(ex, (0, 1.30, 0.075), (0.034, 0.034, 0.016), 0.55, K, lambda p: w, lambda p, nn: MAT["CHAIN"], nu=6, nv=3)
    return ex


def build_collar(B, lod):
    """Always-on neckline ring: real relief at the collar, painted as the top's trim colour."""
    K = B.K; ex = Extra(); ix = B.ix; n = 10 if lod else 14
    w = weights_row(K, {ix["spine.003"]: .6, ix["neck"]: .4})
    rows = []
    for rr, (dy, rad, nz) in enumerate([(-0.012, 1.0, -0.3), (0.0, 1.07, 0.4), (0.011, 1.0, 1.0)]):
        row = []; 
        for i in range(n):
            u = 2 * math.pi * i / n; sx, sz = math.sin(u), math.cos(u)
            row.append(np.array([sx * 0.108 * rad, 1.50 + dy, -0.055 + sz * 0.112 * rad]))
        rows.append(row)
    nrm = [[np.array([math.sin(2 * math.pi * i / n), nz, math.cos(2 * math.pi * i / n)]) / math.hypot(1, nz) for i in range(n)] for (_, _, nz) in [(0, 0, -0.3), (0, 0, 0.4), (0, 0, 1.0)]]
    ex.grid(rows, nrm, [[w] * n] * 3, [[MAT["COLLAR"]] * n] * 3, wrap_u=True)
    return ex



# ---------------------------------------------------------------- head: face decals, hair, accessories (all skinned to the head)
def tframe(n):
    r = np.cross([0, 1.0, 0], n); r = r / (np.linalg.norm(r) or 1); return r, np.cross(n, r)


class Surf:
    """Front-of-head surface (ray-cast along -z on the shaped base) so decals follow the real, faceted face."""
    def __init__(self, P, F): self.P, self.F = P, F
    def at(self, x, y):
        h = ray_hit(self.P, self.F, np.array([x, y, 1.0]), np.array([0, 0, -1.0]), True)
        return h if h is not None else (np.array([x, y, 0.09]), np.array([0, 0, 1.0]))


def d_disc(ex, sf, x, y, rx, ry, mat, w, lift=0.003, n=8):
    c, nm = sf.at(x, y); ring = [ex.vert(sf.at(x + math.cos(2 * math.pi * i / n) * rx, y + math.sin(2 * math.pi * i / n) * ry)[0] + nm * lift, nm, w, mat) for i in range(n)]
    ex.fan_cap(ring, c + nm * lift, nm, w, mat)


def d_strip(ex, sf, pts, half, mat, w, lift=0.003):
    rows, nrm = [], []
    for (x, y) in pts:
        a, na = sf.at(x, y + half); b, nb_ = sf.at(x, y - half)
        rows.append([a + na * lift, b + nb_ * lift]); nrm.append([na, nb_])
    ex.grid(rows, nrm, [[w, w]] * len(rows), [[mat, mat]] * len(rows))


def d_ring(ex, sf, x, y, ro, ri, mat, w, lift=0.006, n=10, sx=1.0, sy=0.78):
    outer, inner, no, ni = [], [], [], []
    for i in range(n):
        a = 2 * math.pi * i / n; ca, sa = math.cos(a) * sx, math.sin(a) * sy
        po, nm = sf.at(x + ca * ro, y + sa * ro); pi_, nm2 = sf.at(x + ca * ri, y + sa * ri)
        outer.append(po + nm * lift); inner.append(pi_ + nm2 * lift); no.append(nm); ni.append(nm2)
    ex.grid([outer, inner], [no, ni], [[w] * n] * 2, [[mat] * n] * 2, wrap_u=True)


def build_features(B, sf):
    """Always-on ears + nose."""
    K = B.K; ex = Extra(); w = weights_row(K, {B.ix["head"]: 1})
    for sx in (-1, 1): superellipsoid(ex, (sx * 0.078, 1.655, -0.012), (0.014, 0.046, 0.03), 1.0, K, lambda p: w, lambda p, n: MAT["EAR"], nu=6, nv=3)
    c, nm = sf.at(0, 1.636)
    superellipsoid(ex, tuple(c + nm * 0.004), (0.018, 0.034, 0.022), 1.0, K, lambda p: w, lambda p, n: MAT["NOSE"], nu=6, nv=3)
    return ex


def build_face(B, sf, style):
    K = B.K; ex = Extra(); w = weights_row(K, {B.ix["head"]: 1}); EX, EY = 0.034, 1.667
    for sx in (-1, 1):
        x = sx * EX; cool = style == "cool"
        d_disc(ex, sf, x, EY - (0.003 if cool else 0), 0.0105, 0.0045 if cool else 0.0072, MAT["FACE_EYE"], w)
        d_disc(ex, sf, x, EY - (0.003 if cool else 0), 0.0052, 0.0042 if cool else 0.0052, MAT["FACE_IRIS"], w, lift=0.0036, n=6)
        u = [(-1 + i / 2) for i in range(5)]
        if style == "cool": brow = [(x + sx * 0.0 + t * 0.014, 1.686 + 0.004 * (t * sx * -1)) for t in u]
        elif style == "grin": brow = [(x + t * 0.013, 1.694 + 0.004 * (1 - t * t)) for t in u]
        elif style == "calm": brow = [(x + t * 0.013, 1.688) for t in u]
        else: brow = [(x + t * 0.013, 1.690 + 0.002 * (1 - t * t)) for t in u]
        d_strip(ex, sf, brow, 0.0022, MAT["FACE_BROW"], w)
        if cool: d_strip(ex, sf, [(x + t * 0.011, EY + 0.0012) for t in u], 0.0014, MAT["FACE_BROW"], w, lift=0.0034)
    t5 = [(-1 + i / 3) for i in range(7)]
    if style == "smile": d_strip(ex, sf, [(0.021 * t, 1.599 + 0.009 * t * t) for t in t5], 0.0018, MAT["FACE_MOUTH"], w)
    elif style == "calm": d_strip(ex, sf, [(0.014 * t, 1.600 + 0.002 * t * t) for t in t5], 0.0016, MAT["FACE_MOUTH"], w)
    elif style == "grin":
        d_disc(ex, sf, 0, 1.597, 0.021, 0.0085, MAT["FACE_MOUTH"], w, n=10); d_disc(ex, sf, 0, 1.6025, 0.0175, 0.0032, MAT["FACE_TEETH"], w, lift=0.0036, n=8)
    else: d_strip(ex, sf, [(0.018 * t, 1.598 + 0.007 * max(0.0, t)) for t in t5], 0.0017, MAT["FACE_MOUTH"], w)
    return ex


def hair_cap_geo(ex, K, w, mat, grow=0.0, nu=12, nv=3):
    superellipsoid(ex, (0, 1.742, -0.008), (0.186 + grow, 0.20 + grow, 0.23 + grow), 1.0, K, lambda p: w, lambda p, n: mat, nu=nu, nv=nv, v0=0.0)


def ribbon_hair(ex, B, n, width, bottom_y_back, bottom_y_side, segs, wide_rim=1.0):
    K = B.K; ix = B.ix
    for i in range(n):
        th = math.radians(-150 + 300 * i / max(1, n - 1)); sx, cz = math.sin(th), -math.cos(th)
        back = (1 + math.cos(th)) / 2; by = bottom_y_side + (bottom_y_back - bottom_y_side) * back
        rows, nrm, wts, mats = [], [], [], []
        for k in range(segs + 1):
            t = k / segs; y = 1.745 + (by - 1.745) * t; flare = 0.014 * math.sin(math.pi * min(1, t * 1.1))
            rx, rz = (0.086 + flare) * wide_rim, (0.104 + flare) * wide_rim
            c = np.array([sx * rx, y, -0.01 + cz * rz]); side = np.array([cz, 0, -sx]); side = side / (np.linalg.norm(side) or 1)
            nm = np.array([sx, 0.1, cz]); nm = nm / np.linalg.norm(nm)
            hw = weights_row(K, {ix["head"]: max(0.05, 1 - t * 0.95), ix["neck"]: 0.6 * t, ix["spine.003"]: 0.4 * t})
            rows.append([c - side * width / 2, c + side * width / 2]); nrm.append([nm, nm]); wts.append([hw, hw]); mats.append([MAT["HAIR"], MAT["HAIR"]])
        ex.grid(rows, nrm, wts, mats)


def build_hair(B, style, lod):
    K = B.K; ex = Extra(); w = weights_row(K, {B.ix["head"]: 1}); nu = 8 if lod else 12
    if style == "afro":
        superellipsoid(ex, (0, 1.795, -0.02), (0.37, 0.31, 0.35), 1.0, K, lambda p: w, lambda p, n: MAT["HAIR"], nu=nu, nv=4 if lod else 6, v0=-0.55)
    elif style == "bun":
        hair_cap_geo(ex, K, w, MAT["HAIR"], nu=nu); superellipsoid(ex, (0, 1.885, -0.055), (0.095, 0.095, 0.095), 1.0, K, lambda p: w, lambda p, n: MAT["HAIR"], nu=8, nv=4)
    elif style == "braids":
        hair_cap_geo(ex, K, w, MAT["HAIR"], 0.006, nu=nu); ribbon_hair(ex, B, 6 if lod else 9, 0.02, 1.43, 1.55, 3 if lod else 4)
    elif style == "locs":
        hair_cap_geo(ex, K, w, MAT["HAIR"], 0.012, nu=nu); ribbon_hair(ex, B, 6 if lod else 8, 0.034, 1.50, 1.62, 3, 1.04)
    elif style == "cap":
        hair_cap_geo(ex, K, w, MAT["CAP"], 0.014, nu=nu)
        rows, nrm, wts, mats = [], [], [], []
        arc = [math.radians(a) for a in range(-75, 76, 25)]
        inner = [np.array([math.sin(a) * 0.098, 1.746, 0.0 + math.cos(a) * 0.112]) for a in arc]
        outer = [np.array([math.sin(a) * 0.125, 1.738, 0.0 + math.cos(a) * 0.205]) for a in arc]
        ex.grid([inner, outer], [[np.array([0, 1, 0.15])] * len(arc)] * 2, [[w] * len(arc)] * 2, [[MAT["CAP_VISOR"]] * len(arc)] * 2)
    elif style == "wrap":
        superellipsoid(ex, (0, 1.80, -0.02), (0.205, 0.13, 0.26), 1.0, K, lambda p: w, lambda p, n: MAT["WRAP"], nu=nu, nv=4, v0=-0.35)
        superellipsoid(ex, (0.0, 1.885, -0.05), (0.16, 0.12, 0.20), 1.0, K, lambda p: w, lambda p, n: MAT["WRAP"], nu=nu, nv=4, v0=-0.2)
        superellipsoid(ex, (0, 1.775, 0.0), (0.196, 0.03, 0.245), 1.0, K, lambda p: w, lambda p, n: MAT["WRAP_BAND"], nu=nu, nv=2, v0=-0.8)
    return ex


def build_acc(B, sf, kind):
    K = B.K; ex = Extra(); w = weights_row(K, {B.ix["head"]: 1}); EX, EY = 0.034, 1.667
    if kind in ("glasses", "sunglasses"):
        big = kind == "sunglasses"
        for sx in (-1, 1):
            d_ring(ex, sf, sx * EX, EY, 0.0185 if big else 0.0175, 0.0155 if big else 0.0152, MAT["GLASS_FRAME"], w, lift=0.007 if big else 0.0065)
            if big: d_disc(ex, sf, sx * EX, EY, 0.0155, 0.0122, MAT["LENS"], w, lift=0.0068, n=10)
            p0, n0 = sf.at(sx * 0.0525, EY); p1 = np.array([sx * 0.0805, EY, -0.015])
            ex.grid([[p0 + n0 * 0.006 + [0, 0.003, 0], p1 + [0, 0.003, 0]], [p0 + n0 * 0.006 - [0, 0.003, 0], p1 - [0, 0.003, 0]]], [[np.array([sx, 0, 0.2])] * 2] * 2, [[w, w]] * 2, [[MAT["GLASS_FRAME"]] * 2] * 2)
        d_strip(ex, sf, [(t * 0.0165, EY + 0.004 - 0.003 * (1 - abs(t))) for t in (-1, -0.5, 0, 0.5, 1)], 0.0016, MAT["GLASS_FRAME"], w, lift=0.0068)
    elif kind == "headphones":
        n = 9; prow, prow2 = [], []
        for i in range(n + 1):
            a = math.pi * i / n; x, y = math.cos(a) * 0.1, 1.692 + math.sin(a) * 0.165
            prow.append(np.array([x, y, -0.014 + 0.0075])); prow2.append(np.array([x, y, -0.014 - 0.0075]))
        nr = [np.array([math.cos(math.pi * i / n), math.sin(math.pi * i / n), 0]) for i in range(n + 1)]
        ex.grid([prow, prow2], [nr, nr], [[w] * (n + 1)] * 2, [[MAT["PHONE_BAND"]] * (n + 1)] * 2)
        for sx in (-1, 1): superellipsoid(ex, (sx * 0.098, 1.668, -0.014), (0.036, 0.075, 0.075), 0.7, K, lambda p: w, lambda p, nn: MAT["PHONE_CUP"], nu=8, nv=4)
    return ex


# ---------------------------------------------------------------- ray casting + baked AO
def ray_hit(Pt, F, origin, direction, with_normal=False):
    A, B_, C = Pt[F[:, 0]], Pt[F[:, 1]], Pt[F[:, 2]]; e1, e2 = B_ - A, C - A
    pv = np.cross(direction, e2); det = (e1 * pv).sum(1); ok = np.abs(det) > 1e-12
    inv = np.where(ok, 1 / np.where(ok, det, 1), 0); tv = origin - A; u = (tv * pv).sum(1) * inv
    qv = np.cross(tv, e1); v = (qv * direction).sum(1) * inv; t = (e2 * qv).sum(1) * inv
    good = ok & (u >= 0) & (v >= 0) & (u + v <= 1) & (t > 0)
    if not good.any(): return None
    k = np.argmin(np.where(good, t, 1e9)); hit = origin + direction * t[k]
    if not with_normal: return hit
    n = np.cross(e1[k], e2[k]); n = n / (np.linalg.norm(n) or 1)
    if n @ direction > 0: n = -n
    return hit, n


def fk_pose(B, clip_name):
    """World joint matrices of the first frame of `clip_name` (rest TRS where the clip has no channel)."""
    js, b = B.js, B.bin; nodes = js["nodes"]; slot = {n: i for i, n in enumerate(B.joint_nodes)}
    T = [np.array(nodes[n].get("translation", [0, 0, 0]), float) for n in B.joint_nodes]
    R = [np.array(nodes[n].get("rotation", [0, 0, 0, 1]), float) for n in B.joint_nodes]
    S = [np.array(nodes[n].get("scale", [1, 1, 1]), float) for n in B.joint_nodes]
    an = next((a for a in js["animations"] if a["name"] == clip_name), None)
    if an:
        for ch in an["channels"]:
            j = slot.get(ch["target"]["node"]); path = ch["target"]["path"]
            if j is None: continue
            v = read_acc(js, b, an["samplers"][ch["sampler"]]["output"])[0].astype(float)
            {"translation": T, "rotation": R, "scale": S}[path][j] = v
    world = [None] * B.K
    for i, n in enumerate(B.joint_nodes):
        L = np.eye(4); L[:3, :3] = quat_mat(R[i] / np.linalg.norm(R[i])) * S[i]; L[:3, 3] = T[i]
        parent = next((slot[p] for p, pn in enumerate(nodes) if n in pn.get("children", []) and p in slot), None)
        world[i] = L if parent is None else world[parent] @ L
    return np.stack(world)


def pose_vertices(B, P, N, W, clip):
    S = fk_pose(B, clip) @ B.ibm  # (K,4,4) skin matrices
    Pp = np.zeros_like(P); Np = np.zeros_like(N)
    for k in range(B.K):
        w = W[:, k:k + 1]
        if not w.any(): continue
        Pp += w * (P @ S[k][:3, :3].T + S[k][:3, 3]); Np += w * (N @ S[k][:3, :3].T)
    return Pp, Np / np.maximum(np.linalg.norm(Np, axis=1, keepdims=True), 1e-9)


def ambient_occlusion(Pv, Nv, Pocc, Focc, samples=28, maxd=0.22, bias=0.006):
    rng = np.random.default_rng(7)
    u1, u2 = (np.arange(samples) + rng.random(samples)) / samples, rng.random(samples)
    r, ph = np.sqrt(u1), 2 * math.pi * u2
    local = np.stack([r * np.cos(ph), r * np.sin(ph), np.sqrt(1 - u1)], 1)  # cosine-weighted hemisphere, z = normal
    A, Bq, C = Pocc[Focc[:, 0]], Pocc[Focc[:, 1]], Pocc[Focc[:, 2]]; e1, e2 = Bq - A, C - A
    occ = np.zeros(len(Pv))
    for vi in range(len(Pv)):
        n = Nv[vi]; t0 = np.cross(n, [0, 1, 0] if abs(n[1]) < 0.9 else [1, 0, 0]); t0 /= np.linalg.norm(t0); t1 = np.cross(n, t0)
        dirs = local[:, :1] * t0 + local[:, 1:2] * t1 + local[:, 2:3] * n  # (S,3)
        o = Pv[vi] + n * bias
        pv = np.cross(dirs[:, None, :], e2[None]); det = (e1[None] * pv).sum(2); ok = np.abs(det) > 1e-12
        inv = np.where(ok, 1 / np.where(ok, det, 1), 0); tv = o - A; u = (tv[None] * pv).sum(2) * inv
        qv = np.cross(tv, e1)[None]; v = (qv * dirs[:, None, :]).sum(2) * inv; t = (e2[None] * qv).sum(2) * inv
        hit = ok & (u >= 0) & (v >= 0) & (u + v <= 1) & (t > 1e-4) & (t < maxd)
        tmin = np.where(hit, t, 9).min(1); occ[vi] = np.where(tmin < maxd, 1 - tmin / maxd, 0).mean()
    return np.clip(1 - occ * 1.0, 0.25, 1.0)


# ---------------------------------------------------------------- build one character
def build(base_path, out_path, lod):
    B = Base(base_path); K = B.K; ix = B.ix
    dom_names0 = [B.names[i] for i in B.dom()]
    P, N, W = B.P.copy(), B.N.copy(), B.W.copy()

    # 1. stylisation (smooth by skin weight so seams do not tear): head +8 %, shoes +14 % wide / +10 % long
    hj = ix["head"]; hc = B.bind_pos[hj] + np.array([0, 0.03, 0])
    wh = W[:, hj:hj + 1]; P = P + (P - hc) * 0.08 * wh
    t = np.clip((P[:, 1:2] - 1.552) / 0.17, 0, 1); f = 1 + (0.80 + 0.24 * (t * t * (3 - 2 * t)) - 1) * wh   # egg-shaped head: narrow jaw, fuller cranium
    P[:, 0:1] *= f; P[:, 2:3] = P[:, 2:3] * f
    wn = W[:, ix["neck"]:ix["neck"] + 1]; P[:, 0:1] *= 1 - 0.12 * wn; P[:, 2:3] = -0.045 + (P[:, 2:3] + 0.045) * (1 - 0.12 * wn)   # slimmer neck
    feet = [ix["foot.L"], ix["toe.L"], ix["foot.R"], ix["toe.R"]]
    for side, (f, t) in {1: (ix["foot.L"], ix["toe.L"]), -1: (ix["foot.R"], ix["toe.R"])}.items():
        wf = (W[:, f] + W[:, t])[:, None]; cx = 0.089 * side
        P[:, 0:1] += (P[:, 0:1] - cx) * 0.14 * wf; P[:, 2:3] += (P[:, 2:3] - 0.0) * 0.10 * wf * (P[:, 2:3] > 0); P[:, 1:2] += P[:, 1:2] * 0.12 * wf
    N = smooth_normals(P, B.F)

    sf = Surf(P, B.F)
    # 2. plane slicing
    M = Mesh(P, N, W, B.F)
    inner = lambda c: abs(c[0]) < 0.2
    legs = lambda c: c[1] < 0.35
    arm = lambda c: abs(c[0]) > 0.2 and c[1] > 1.3
    head = lambda c: c[1] > 1.5
    cfg = dict(hair=True, hairA=1.690)
    torso_lo = lambda c: c[1] > 0.7 and inner(c)
    horiz = [(0.035, legs), (0.15, legs), (0.885, torso_lo)]
    if not lod: horiz += [(0.08, legs), (0.30, legs), (1.525, lambda c: abs(c[0]) < 0.2 and c[1] > 1.3)]
    for d, sc in horiz: M.cut([0, 1, 0], d, sc)
    for xv in ([0.335] if lod else [0.335, 0.69]):
        for s_ in (1, -1): M.cut([s_, 0, 0], xv, arm)
    M.cut([0, 1, -0.6], cfg["hairA"], head)
    P2, N2, W2, F2 = M.arrays()
    # hard-edge normals are fine (duplicated verts share the interpolated normal), keep them smooth across the seam
    dom_names = [B.names[i] for i in W2.argmax(1)]
    mat = classify(P2, N2, dom_names, cfg)
    # always-on collar ring joins the base range
    for ce in ([build_collar(B, lod), build_features(B, sf)] if not lod else [build_features(B, sf)]):
        cP, cW, cM = np.array(ce.P), np.array(ce.W), np.array(ce.M, np.uint8); cF = tidy(cP, ce.F); cN = smooth_normals(cP, cF)
        P2 = np.concatenate([P2, cP]); N2 = np.concatenate([N2, cN]); W2 = np.concatenate([W2, cW]); mat = np.concatenate([mat, cM]); F2 = np.concatenate([F2, cF + len(P2) - len(cP)])
    nb = len(P2)

    # 3. AO for the body (posed with arms down)
    Pp, Np = pose_vertices(B, P2, N2, W2, "Stand_Loop")
    ao = ambient_occlusion(Pp, Np, Pp, F2, samples=20 if lod else 28)

    def torso_ray(o, d):  # rest-pose hit on the body (for strap projection)
        return ray_hit(P2, F2, o, d)

    # 4. extras
    groups = []; allP, allN, allW, allM, allA, allF = [P2], [N2], [W2], [mat], [(ao * 255).round().astype(np.uint8)], [F2]
    vbase, ibase = nb, len(F2) * 3
    for name, fn in ([("hood", lambda: build_hood(B, lod)), ("skirt", lambda: build_skirt(B, lod)), ("backpack", lambda: build_backpack(B, lod, torso_ray)),
                     ("satchel", lambda: build_satchel(B, lod, torso_ray)), ("chain", lambda: build_chain(B, lod))]
                    + [("hair_" + h, (lambda h=h: build_hair(B, h, lod))) for h in ("afro", "braids", "locs", "bun", "cap", "wrap")]
                    + ([] if lod else [("face_" + f, (lambda f=f: build_face(B, sf, f))) for f in ("smile", "calm", "grin", "cool")] + [("acc_" + a, (lambda a=a: build_acc(B, sf, a))) for a in ("glasses", "sunglasses", "headphones")])):
        ex = fn(); eP, eW, eM = np.array(ex.P), np.array(ex.W), np.array(ex.M, np.uint8)
        eF = tidy(eP, ex.F); eN = smooth_normals(eP, eF)
        # AO of the extra against body + itself (arms down)
        Pe, Ne = pose_vertices(B, eP, eN, eW, "Stand_Loop")
        Pocc = np.concatenate([Pp, Pe]); Focc = np.concatenate([F2, eF + nb])
        eao = np.ones(len(eP)) if name.startswith(("face_", "acc_")) else ambient_occlusion(Pe, Ne, Pocc, Focc, samples=16 if lod else 24, maxd=0.2)
        groups.append(dict(name=name, v0=vbase, vN=len(eP), i0=ibase, iN=len(eF) * 3, tris=len(eF)))
        allP.append(eP); allN.append(eN); allW.append(eW); allM.append(eM); allA.append((eao * 255).round().astype(np.uint8)); allF.append(eF + vbase)
        vbase += len(eP); ibase += len(eF) * 3
    P_, N_, W_, M_, A_, F_ = np.concatenate(allP), np.concatenate(allN), np.concatenate(allW), np.concatenate(allM), np.concatenate(allA), np.concatenate(allF)

    write_glb(B, out_path, P_, N_, W_, M_, A_, F_, groups, nb, len(F2))
    print(f"{Path(out_path).name}: base {nb} verts / {len(F2)} tris (was {len(B.P)} / {len(B.F)}); groups "
          + ", ".join(f"{g['name']} {g['tris']}t" for g in groups) + f"; {Path(out_path).stat().st_size/1024:.0f} KiB", file=sys.stderr)


def write_glb(B, out_path, P, N, W, M, A, F, groups, nb, base_tris):
    js, bin_ = B.js, B.bin
    parts, views, accs = [], [], []

    def add(arr, ctype, atype, target=None, minmax=False, keep=None):
        raw = np.ascontiguousarray(arr).tobytes(); pad = (-len(raw)) % 4; off = sum(len(p) for p in parts); parts.append(raw + b"\0" * pad)
        v = {"buffer": 0, "byteOffset": off, "byteLength": len(raw)}
        if target: v["target"] = target
        views.append(v); a = {"bufferView": len(views) - 1, "componentType": ctype, "count": int(len(arr)), "type": atype}
        if minmax: a["min"] = np.atleast_1d(arr.min(0)).astype(float).tolist(); a["max"] = np.atleast_1d(arr.max(0)).astype(float).tolist()
        if keep: a.update(keep)
        accs.append(a); return len(accs) - 1

    top = np.argsort(-W, axis=1)[:, :4]; Jo = top.astype(np.uint8); Wo = np.take_along_axis(W, top, 1); Wo = Wo / np.maximum(Wo.sum(1, keepdims=True), 1e-9)
    a_pos = add(P.astype(np.float32), 5126, "VEC3", 34962, True); a_nrm = add(N.astype(np.float32), 5126, "VEC3", 34962)
    a_jnt = add(Jo, 5121, "VEC4", 34962); a_wgt = add(Wo.astype(np.float32), 5126, "VEC4", 34962)
    paint = np.zeros((len(P), 4), np.uint8); paint[:, 0] = M; paint[:, 1] = A
    a_pnt = add(paint, 5121, "VEC4", 34962, keep={"normalized": False})
    a_idx = add(F.astype(np.uint16).reshape(-1), 5123, "SCALAR", 34963)
    remap = {}

    def carry(i):  # copy an untouched accessor (animation times/values, inverse bind matrices) into the new buffer
        if i not in remap:
            old = js["accessors"][i]; arr = read_acc(js, bin_, i); keep = {k: old[k] for k in ("min", "max") if k in old}
            remap[i] = add(arr.reshape(-1) if old["type"] == "SCALAR" else arr, old["componentType"], old["type"], None, False, keep)
        return remap[i]
    out = json.loads(json.dumps(js))
    out["skins"][0]["inverseBindMatrices"] = carry(js["skins"][0]["inverseBindMatrices"])
    for an in out["animations"]:
        for s in an["samplers"]: s["input"] = carry(s["input"]); s["output"] = carry(s["output"])
    prim = out["meshes"][0]["primitives"][0]
    prim["attributes"] = {"POSITION": a_pos, "NORMAL": a_nrm, "JOINTS_0": a_jnt, "WEIGHTS_0": a_wgt, "_PAINT": a_pnt}; prim["indices"] = a_idx
    out["accessors"], out["bufferViews"] = accs, views
    body = b"".join(parts); out["buffers"] = [{"byteLength": len(body)}]
    c = out["extras"]["campus"]; c["triangles"] = int(len(F)); c["baseTriangles"] = int(base_tris); c["baseVertices"] = int(nb); c["groups"] = groups; c["materials"] = MAT
    out["asset"]["generator"] = "CAMPUS scripts/models/paint-character.py (base: Quaternius Universal Animation Library, CC0)"
    j = json.dumps(out, separators=(",", ":")).encode(); j += b" " * ((-len(j)) % 4)
    total = 12 + 8 + len(j) + 8 + len(body)
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    Path(out_path).write_bytes(struct.pack("<III", 0x46546C67, 2, total) + struct.pack("<II", len(j), 0x4E4F534A) + j + struct.pack("<II", len(body), 0x004E4942) + body)


if __name__ == "__main__":
    build(HERE / "base/campus_body_base.glb", OUT_DIR / "campus_body.glb", False)
    build(HERE / "base/campus_body_lod_base.glb", OUT_DIR / "campus_body_lod.glb", True)
