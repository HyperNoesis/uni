#!/usr/bin/env python3
"""Import one Kenney (CC0) glTF model into CAMPUS's texture-less GLB format.

The in-repo loader (apps/web/lib/glb.ts) ignores textures, and many Kenney kits colour everything from a shared palette
texture. This tool bakes the colour into per-vertex COLOR_0 so the model renders correctly, applies node transforms, welds
vertices, and writes ONE self-contained GLB (no textures, no external buffers, no extensions).

  baseColor = material.baseColorFactor * texture(baseColorTexture) sampled at the vertex UV (nearest texel, sRGB values kept:
              the renderer treats colours as plain sRGB 0..1 like its hex palette)

Usage:
  python3 scripts/models/import-kenney.py --src <kenney>/3d/<kit>/<model>.glb --out apps/web/public/assets/kenney/<id>.glb \
      [--max-tris 2500] [--scale 1.0] [--tint "#rrggbb:#rrggbb"]   # --tint remaps one exact source colour to another (repeatable via commas)
Prints one JSON line: id, tris, bytes, bounds (metres, after --scale), colours (distinct palette used) so manifests can be generated.
Licence: Kenney assets are CC0 (docs/ASSET_SOURCES.md). Record each import there.
"""
import argparse, json, struct, sys
from pathlib import Path
import numpy as np
from PIL import Image

CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def load_glb(path):
    b = Path(path).read_bytes()
    if struct.unpack("<I", b[:4])[0] != 0x46546C67: raise SystemExit(f"{path}: not a GLB")
    js = bin_ = None; o = 12
    while o + 8 <= len(b):
        n, t = struct.unpack("<II", b[o:o+8]); chunk = b[o+8:o+8+n]
        if t == 0x4E4F534A and js is None: js = json.loads(chunk)
        elif t == 0x004E4942 and bin_ is None: bin_ = chunk
        o += 8 + ((n + 3) & ~3)
    return js, bin_


def acc(g, bin_, i):
    a = g["accessors"][i]; bv = g["bufferViews"][a["bufferView"]]; dt = np.dtype(CT[a["componentType"]]); nc = NC[a["type"]]
    off = bv.get("byteOffset", 0) + a.get("byteOffset", 0); stride = bv.get("byteStride", 0) or dt.itemsize * nc
    if a.get("sparse"): raise SystemExit("sparse accessors unsupported")
    if stride == dt.itemsize * nc: arr = np.frombuffer(bin_, dtype=dt, count=a["count"] * nc, offset=off).reshape(a["count"], nc)
    else: arr = np.stack([np.frombuffer(bin_, dtype=dt, count=nc, offset=off + k * stride) for k in range(a["count"])])
    arr = arr.astype(np.float64)
    if a.get("normalized"): arr = arr / np.iinfo(dt).max if dt.kind == "u" else np.maximum(arr / np.iinfo(dt).max, -1)
    return arr


def trs(t=(0, 0, 0), q=(0, 0, 0, 1), s=(1, 1, 1)):
    x, y, z, w = q; xx, yy, zz, xy, xz, yz, wx, wy, wz = x*x, y*y, z*z, x*y, x*z, y*z, w*x, w*y, w*z
    m = np.eye(4); m[:3, :3] = np.array([[1-2*(yy+zz), 2*(xy-wz), 2*(xz+wy)], [2*(xy+wz), 1-2*(xx+zz), 2*(yz-wx)], [2*(xz-wy), 2*(yz+wx), 1-2*(xx+yy)]]) * np.array(s); m[:3, 3] = t
    return m


def texture_image(g, src_dir, bin_, tex_index):
    t = g["textures"][tex_index]; im = g["images"][t["source"]]
    if "uri" in im:
        if im["uri"].startswith("data:"): raise SystemExit("data-URI textures unsupported")
        return Image.open(src_dir / im["uri"]).convert("RGBA")
    bv = g["bufferViews"][im["bufferView"]]; import io
    return Image.open(io.BytesIO(bin_[bv.get("byteOffset", 0): bv.get("byteOffset", 0) + bv["byteLength"]])).convert("RGBA")


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--src", required=True); ap.add_argument("--out", required=True)
    ap.add_argument("--max-tris", type=int, default=2500); ap.add_argument("--scale", type=float, default=1.0); ap.add_argument("--tint", default="")
    a = ap.parse_args(); src = Path(a.src); g, bin_ = load_glb(src)
    bad = [e for e in g.get("extensionsRequired", []) if e != "KHR_materials_unlit"]  # unlit = plain colour, which is what we bake anyway
    if bad: raise SystemExit(f"unsupported required extensions: {bad}")
    tint = {}
    for pair in filter(None, a.tint.split(",")):
        k, v = pair.split(":"); h = lambda s: tuple(int(s.lstrip("#")[i:i+2], 16) / 255 for i in (0, 2, 4)); tint[h(k)] = h(v)
    imgs = {}; P, N, C, F = [], [], [], []; base = 0
    nodes = g["nodes"]; scene = g["scenes"][g.get("scene", 0)]

    def visit(ni, parent):
        nonlocal base
        n = nodes[ni]; m = parent @ (np.array(n["matrix"], float).reshape(4, 4).T if "matrix" in n else trs(n.get("translation", (0, 0, 0)), n.get("rotation", (0, 0, 0, 1)), n.get("scale", (1, 1, 1))))
        if "mesh" in n:
            for prim in g["meshes"][n["mesh"]]["primitives"]:
                if prim.get("mode", 4) != 4: raise SystemExit("only triangle primitives")
                at = prim["attributes"]; pos = acc(g, bin_, at["POSITION"]); cnt = len(pos)
                nrm = acc(g, bin_, at["NORMAL"]) if "NORMAL" in at else np.tile([0, 1, 0], (cnt, 1)).astype(float)
                idx = acc(g, bin_, prim["indices"]).reshape(-1).astype(int) if "indices" in prim else np.arange(cnt)
                mat = g["materials"][prim["material"]] if "material" in prim else {}; pbr = mat.get("pbrMetallicRoughness", {})
                col = np.tile(np.array(pbr.get("baseColorFactor", [1, 1, 1, 1]))[:3], (cnt, 1))
                bt = pbr.get("baseColorTexture")
                if bt is not None:
                    if "TEXCOORD_0" not in at: raise SystemExit("textured material without TEXCOORD_0")
                    ti = bt["index"]
                    if ti not in imgs: imgs[ti] = np.asarray(texture_image(g, src.parent, bin_, ti), dtype=np.float64) / 255
                    im = imgs[ti]; uv = acc(g, bin_, at["TEXCOORD_0"]); h, w = im.shape[:2]
                    px = np.clip(np.floor((uv[:, 0] % 1.0) * w).astype(int), 0, w - 1); py = np.clip(np.floor((uv[:, 1] % 1.0) * h).astype(int), 0, h - 1)
                    col = col * im[py, px, :3]
                if "COLOR_0" in at: col = col * acc(g, bin_, at["COLOR_0"])[:, :3]
                for k, v in tint.items():
                    sel = np.all(np.abs(col - np.array(k)) < 0.012, axis=1); col[sel] = v
                P.append((m[:3, :3] @ pos.T).T + m[:3, 3]); nn = (np.linalg.inv(m[:3, :3]).T @ nrm.T).T; N.append(nn / np.maximum(np.linalg.norm(nn, axis=1, keepdims=True), 1e-12))
                C.append(col); F.append(idx.reshape(-1, 3) + base); base += cnt
        for c in n.get("children", []): visit(c, m)
    for r in scene["nodes"]: visit(r, np.eye(4))
    if not P: raise SystemExit("no geometry")
    P = np.concatenate(P) * a.scale; N = np.concatenate(N); C = np.concatenate(C); F = np.concatenate(F)
    # weld identical (position, normal, colour) vertices; drop degenerate triangles
    key = np.round(np.concatenate([P * 1e4, N * 1e3, C * 255], axis=1)).astype(np.int64)
    _, first, inv = np.unique(key, axis=0, return_index=True, return_inverse=True); inv = inv.reshape(-1)
    P, N, C = P[first], N[first], np.clip(C[first], 0, 1); F = inv[F]
    F = F[(F[:, 0] != F[:, 1]) & (F[:, 1] != F[:, 2]) & (F[:, 0] != F[:, 2])]
    if len(F) > a.max_tris: raise SystemExit(f"{src.name}: {len(F)} triangles exceeds --max-tris {a.max_tris}")
    idt = np.uint16 if len(P) < 65535 else np.uint32; parts = []; views = []; accs = []

    def add(arr, ctype, atype, target, mm=False):
        raw = arr.tobytes(); off = sum(len(x) for x in parts); parts.append(raw + b"\0" * ((-len(raw)) % 4))
        views.append({"buffer": 0, "byteOffset": off, "byteLength": len(raw), "target": target})
        d = {"bufferView": len(views) - 1, "componentType": ctype, "count": int(len(arr)), "type": atype}
        if mm: d["min"] = arr.min(0).astype(float).tolist(); d["max"] = arr.max(0).astype(float).tolist()
        accs.append(d); return len(accs) - 1
    ap_, an_, ac_ = add(P.astype(np.float32), 5126, "VEC3", 34962, True), add(N.astype(np.float32), 5126, "VEC3", 34962), add(C.astype(np.float32), 5126, "VEC3", 34962)
    ai = add(F.astype(idt).reshape(-1), 5125 if idt == np.uint32 else 5123, "SCALAR", 34963)
    gj = {"asset": {"version": "2.0", "generator": "CAMPUS scripts/models/import-kenney.py", "copyright": f"Source: Kenney (kenney.nl), CC0 1.0 - {src.parent.name}/{src.name}"},
          "scene": 0, "scenes": [{"nodes": [0]}], "nodes": [{"mesh": 0, "name": src.stem}],
          "meshes": [{"primitives": [{"attributes": {"POSITION": ap_, "NORMAL": an_, "COLOR_0": ac_}, "indices": ai, "material": 0}]}],
          "materials": [{"pbrMetallicRoughness": {"baseColorFactor": [1, 1, 1, 1], "metallicFactor": 0, "roughnessFactor": 0.9}}],
          "accessors": accs, "bufferViews": views, "buffers": [{"byteLength": sum(len(x) for x in parts)}]}
    body = b"".join(parts); js = json.dumps(gj, separators=(",", ":")).encode(); js += b" " * ((-len(js)) % 4)
    out = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(body)) + struct.pack("<II", len(js), 0x4E4F534A) + js + struct.pack("<II", len(body), 0x004E4942) + body
    Path(a.out).parent.mkdir(parents=True, exist_ok=True); Path(a.out).write_bytes(out)
    lo, hi = P.min(0), P.max(0); cols = np.unique(np.round(C * 255).astype(int), axis=0)
    print(json.dumps({"id": Path(a.out).stem, "source": f"{src.parent.name}/{src.name}", "tris": int(len(F)), "bytes": len(out), "size": {"w": round(float(hi[0] - lo[0]), 3), "h": round(float(hi[1] - lo[1]), 3), "d": round(float(hi[2] - lo[2]), 3)}, "minY": round(float(lo[1]), 3), "distinctColours": int(len(cols))}))


if __name__ == "__main__":
    main()
