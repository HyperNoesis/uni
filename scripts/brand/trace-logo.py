#!/usr/bin/env python3
"""Trace the Rejuvini Tech logo (rejuvini-logo-source.png, a crop of the owner's profile picture) into clean vector layers.
Outputs apps/web/lib/brand-logo.json (SVG paths + triangles for the 3D gate decal) and brand-logo.svg preview.
Run: python3 scripts/brand/trace-logo.py   (needs opencv-python, numpy, pillow, mapbox-earcut)"""
import json, os, sys
import cv2, numpy as np
from PIL import Image
import mapbox_earcut as earcut

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
S = 4  # upscale for sub-pixel contours
src = Image.open(os.path.join(HERE, "rejuvini-logo-source.png")).convert("RGB")
W0, H0 = src.size
big = np.array(src.resize((W0 * S, H0 * S), Image.LANCZOS)).astype(np.int16)
R, G, B = big[..., 0], big[..., 1], big[..., 2]
white = (np.minimum(np.minimum(R, G), B) > 150)
blue = (B > 105) & (R < 130) & ((B - R) > 45) & (G < 200)
def roi(x0, y0, x1, y1):  # source px -> upscaled mask
    m = np.zeros(white.shape, bool); m[y0 * S:y1 * S, x0 * S:x1 * S] = True; return m
# regions in source-crop coordinates (crop origin 190,300 of the screenshot)
GLYPH = roi(112, 28, 230, 150); WORD = roi(55, 165, 290, 202); TECH = roi(70, 205, 275, 230); BAR = roi(140, 245, 200, 256)

# --- fit the ring's outer circle from clean points only (ignore the notification-overlay bump at the top-left), then clip to it
gw = (white & GLYPH).astype(np.uint8)
cnts, _ = cv2.findContours(gw, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
ring = max(cnts, key=cv2.contourArea).reshape(-1, 2).astype(np.float64)
# seed from the ring's approximate position, then least-squares on inlier points of the upper/right arc (the tail and the overlay bump are excluded)
acx, acy, ar = 170 * S, 77 * S, 53 * S
d0 = np.hypot(ring[:, 0] - acx, ring[:, 1] - acy)
bump = (ring[:, 0] < acx - .05 * ar) & (ring[:, 1] < acy - .7 * ar)
sel = ring[(np.abs(d0 - ar) < .14 * ar) & (ring[:, 1] < acy + .25 * ar) & ~bump]
for _ in range(4):
    A = np.c_[2 * sel[:, 0], 2 * sel[:, 1], np.ones(len(sel))]; b = (sel ** 2).sum(1)
    cx, cy, c = np.linalg.lstsq(A, b, rcond=None)[0]; rad = np.sqrt(c + cx * cx + cy * cy)
    dd = np.hypot(ring[:, 0] - cx, ring[:, 1] - cy); sel = ring[(np.abs(dd - rad) < .035 * rad) & (ring[:, 1] < acy + .25 * ar) & ~bump]
print("outer circle (src px):", round(cx / S, 1), round(cy / S, 1), "r", round(rad / S, 1))
yy, xx = np.mgrid[0:white.shape[0], 0:white.shape[1]]
disc = (xx - cx) ** 2 + (yy - cy) ** 2 <= (rad + 1.2 * S) ** 2
# the diagonal tail leaves the circle on purpose, so only clip the TOP half (above the circle's centre line)
clip = disc | (yy > cy)
# inner circle (the counter of the Q): fit its clean upper/left arc, then redraw the damaged top-left sector of the ring analytically
dring = np.hypot(ring[:, 0] - cx, ring[:, 1] - cy); aring = np.degrees(np.arctan2(-(ring[:, 1] - cy), ring[:, 0] - cx))
hsel = ring[(dring > .45 * rad) & (dring < .8 * rad) & (aring > 8) & (aring < 172)]
for _ in range(4):
    A = np.c_[2 * hsel[:, 0], 2 * hsel[:, 1], np.ones(len(hsel))]; bb = (hsel ** 2).sum(1)
    hx, hy, c2 = np.linalg.lstsq(A, bb, rcond=None)[0]; hr = np.sqrt(c2 + hx * hx + hy * hy)
    dd = np.hypot(ring[:, 0] - hx, ring[:, 1] - hy); hsel = ring[(np.abs(dd - hr) < .04 * hr) & (dring > .45 * rad) & (dring < .8 * rad) & (aring > 8) & (aring < 172)]
print("inner circle (src px):", round(hx / S, 1), round(hy / S, 1), "r", round(hr / S, 1))
th = np.degrees(np.arctan2(-(yy - cy), xx - cx))
patch = ((xx - cx) ** 2 + (yy - cy) ** 2 <= rad ** 2) & ((xx - hx) ** 2 + (yy - hy) ** 2 >= hr ** 2) & (th > 95) & (th < 172)
exact = (xx - cx) ** 2 + (yy - cy) ** 2 <= rad ** 2
glyph_w = (white & GLYPH & (exact | (yy > cy + 0.1 * rad))) | (patch & GLYPH); glyph_b = (blue & GLYPH)
word_w = white & WORD; tech_b = blue & TECH; bar_b = blue & BAR

def clean(mask, k=3, minarea=60 * S * S / 16):
    m = (mask.astype(np.uint8)) * 255
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((k, k), np.uint8)); m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((k, k), np.uint8))
    m = cv2.GaussianBlur(m, (0, 0), 1.2 * S / 2); return (m > 127).astype(np.uint8)
layers = {"glyphWhite": clean(glyph_w), "glyphBlue": clean(glyph_b), "wordWhite": clean(word_w, 3), "techBlue": clean(tech_b | bar_b, 3)}

def polys(mask, eps):
    cs, h = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    out = []  # (outer, [holes])
    if h is None: return out
    h = h[0]
    for i, c in enumerate(cs):
        if h[i][3] != -1 or cv2.contourArea(c) < 40 * S: continue
        holes = [cv2.approxPolyDP(cs[j], eps, True).reshape(-1, 2) for j in range(len(cs)) if h[j][3] == i and cv2.contourArea(cs[j]) > 30 * S]
        out.append((cv2.approxPolyDP(c, eps, True).reshape(-1, 2), holes))
    return out

# normalise: origin = glyph circle centre, unit = glyph outer radius, +y UP (3D friendly); svg flips back
def norm(p): return [round((p[0] - cx) / rad, 4), round(-(p[1] - cy) / rad, 4)]
res = {"unit": "glyph outer radius = 1, origin = ring centre, +y up", "layers": {}}
svg = []
colors = {"glyphWhite": "#ffffff", "glyphBlue": "#2f7df6", "wordWhite": "#ffffff", "techBlue": "#2f7df6"}
for name, m in layers.items():
    eps = 0.9 * S / 2 if name.startswith("glyph") else 0.6 * S / 2
    items = []; d = []; tris = []; verts = []
    for outer, holes in polys(m, eps):
        o = [norm(p) for p in outer]; hs = [[norm(p) for p in h] for h in holes]
        items.append({"outer": o, "holes": hs})
        for ring_ in [o] + hs: d.append("M" + "L".join(f"{p[0]},{p[1]}" for p in ring_) + "Z")
        pts = np.array(o + [p for h in hs for p in h], np.float64); ends = np.cumsum([len(o)] + [len(h) for h in hs]).astype(np.uint32)
        idx = earcut.triangulate_float64(pts, ends).reshape(-1, 3); base = len(verts)
        verts += pts.round(4).tolist(); tris += (idx + base).tolist()
    res["layers"][name] = {"color": colors[name], "path": " ".join(d), "vertices": verts, "triangles": tris}
    print(name, "polys", len(items), "verts", len(verts), "tris", len(tris))
    svg.append(f'<path fill="{colors[name]}" fill-rule="evenodd" d="{" ".join(d)}"/>')
xs = [v[0] for L in res["layers"].values() for v in L["vertices"]]; ys = [v[1] for L in res["layers"].values() for v in L["vertices"]]
res["bounds"] = {"x0": min(xs), "x1": max(xs), "y0": min(ys), "y1": max(ys)}
res["glyphBounds"] = {k: round(v, 4) for k, v in zip(("x0", "x1", "y0", "y1"), (min(v[0] for v in res["layers"]["glyphWhite"]["vertices"] + res["layers"]["glyphBlue"]["vertices"]), max(v[0] for v in res["layers"]["glyphWhite"]["vertices"] + res["layers"]["glyphBlue"]["vertices"]), min(v[1] for v in res["layers"]["glyphWhite"]["vertices"] + res["layers"]["glyphBlue"]["vertices"]), max(v[1] for v in res["layers"]["glyphWhite"]["vertices"] + res["layers"]["glyphBlue"]["vertices"])))}
b_ = res["bounds"]
open(os.path.join(HERE, "brand-logo.svg"), "w").write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{b_["x0"]-.1} {-b_["y1"]-.1} {b_["x1"]-b_["x0"]+.2} {b_["y1"]-b_["y0"]+.2}"><rect x="-9" y="-9" width="20" height="20" fill="#000"/><g transform="scale(1,-1)">{"".join(svg)}</g></svg>')
json.dump(res, open(os.path.join(ROOT, "apps/web/lib/brand-logo.json"), "w"), separators=(",", ":"))
print("bounds", res["bounds"], "glyph", res["glyphBounds"])
