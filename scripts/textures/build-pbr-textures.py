#!/usr/bin/env python3
"""CAMPUS material textures v2 ("structured PBR detail"): original, deterministic, seamless 512x512 PNGs. No third-party art.

Why v2: v1 (build-detail-textures.py) was fine noise only. Free-Fire-class surfaces need STRUCTURE the eye reads as real material:
  wall  = 400x200 mm painted concrete-block coursing (6 courses x 3 blocks per tile, half-bond), mortar grooves, per-block tone, pitted render, rain-streak weathering.
  paving= terrazzo/stone slab grain + chips + hairline cracks (slab joints are drawn by the shader, 0.8 m running bond).
  grass = blade strokes + tonal patches.
  roof  = overlapping clay/concrete pantiles (4x4 tiles per texture), curved shadow lip, tile-to-tile tone, moss/stain patches.
Channel packing (every PNG, RGBA, always opaque so browsers never premultiply the data):
  R = albedo detail multiplier (0.5 neutral; shader uses R*2)   G,B = tangent-space normal x,y (0.5 flat)   A = cavity/AO (1 open, <1 crevice; also drives specular).
Run: python3 scripts/textures/build-pbr-textures.py   (from repo root; overwrites apps/web/public/assets/textures/detail_{paving,grass,wall,roof}.png)
Mapping in shaders (world-shaders.ts): paving xz*.6, grass xz*.9, wall (x+z,y)*.85, roof (across,along-slope)/4 in pantile units."""
import numpy as np
from PIL import Image
from pathlib import Path

N = 512
rng = np.random.default_rng(20261013)
fy = np.fft.fftfreq(N)[:, None]
fx = np.fft.rfftfreq(N)[None, :]


def noise(lo, hi, aniso=(1.0, 1.0)):
    """Periodic band-passed noise, lo..hi cycles per tile; aniso stretches frequency response along (x, y)."""
    w = rng.standard_normal((N, N))
    F = np.fft.rfft2(w)
    f = np.sqrt((fx * N / aniso[0]) ** 2 + (fy * N / aniso[1]) ** 2) + 1e-6
    F *= np.exp(-((np.log(f) - np.log(np.sqrt(lo * hi))) ** 2) / (2 * (np.log(hi / lo) / 2.2) ** 2))
    o = np.fft.irfft2(F, s=(N, N))
    o -= o.mean()
    return o / (o.std() + 1e-9)


def norm01(a, s=3.0):
    return np.clip(.5 + a / (2 * s), 0, 1)


def blur(a, px):
    """Periodic gaussian blur (FFT) so groove/edge heights get soft shoulders."""
    F = np.fft.rfft2(a)
    g = np.exp(-2 * (np.pi ** 2) * (px ** 2) * (fx ** 2 + fy ** 2))
    return np.fft.irfft2(F * g, s=(N, N))


def grad(h, k):
    gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * .5
    gy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * .5
    return np.clip(.5 - gx * k, 0, 1), np.clip(.5 - gy * k, 0, 1)


def save(name, albedo, height, cavity, k):
    nx, ny = grad(height, k)
    img = np.stack([np.clip(albedo, 0, 1), nx, ny, np.clip(cavity, 0, 1)], -1)
    out = Path("apps/web/public/assets/textures") / name
    Image.fromarray((img * 255 + .5).astype(np.uint8), "RGBA").save(out, optimize=True)
    print(f"{name}: albedo mean {albedo.mean():.3f} std {albedo.std():.3f}, cavity mean {cavity.mean():.3f}")


yy, xx = np.mgrid[0:N, 0:N]
u = xx / N
v = yy / N

# ------------------------------------------------------------------ paving (stone / terrazzo slab)
grain = noise(60, 200)
mid = noise(6, 24)
chips = noise(24, 60)
chip = (chips > 1.45).astype(float)
chip = np.clip(chip + (noise(30, 70) > 1.85) * .6, 0, 1)
h = grain * .38 + mid * .28 + chip * 1.2
alb = norm01(grain * .38 + mid * .6 - chip * .9 * (noise(8, 20) > 0) + chip * .65, 3.1) * .92 + .04
crack = (np.abs(noise(2, 6, (1, 3))) < .05).astype(float) * (noise(3, 9) > .4)
h -= crack * 1.8
alb -= crack * .22
cav = np.clip(1 - crack * .7 - .12 * (mid < -1) - .06 * chip, 0, 1)
save("detail_paving.png", np.clip(alb, 0, 1), h, cav, 2.6)

# ------------------------------------------------------------------ grass
bl = noise(70, 180, (.6, 2.2)) * .55 + noise(30, 90, (.7, 1.8)) * .45
patch = noise(3, 12)
alb = norm01(bl * .55 + patch * .6, 3.0)
save("detail_grass.png", alb, bl + patch * .15, np.clip(.74 + .26 * norm01(bl, 3), 0, 1), 1.9)

# ------------------------------------------------------------------ wall: concrete-block coursing (the big structural win)
COURSES, BLOCKS = 6, 3
ch = N // COURSES                       # 85.33 px per course -> use float math for exact seamlessness
row = np.floor(v * COURSES).astype(int)
fv = (v * COURSES) % 1.0                # 0..1 inside a course
shift = (row % 2) * .5                  # half-bond
fu = ((u * BLOCKS) + shift) % 1.0       # 0..1 inside a block
bid = (np.floor((u * BLOCKS) + shift).astype(int) % BLOCKS) + row * 7
blk_tone = np.zeros((N, N))
tones = rng.normal(0, 1, 64)
blk_tone = tones[bid % 64]
bed_w, head_w = .055, .026              # mortar thickness as fraction of course / block (bed joint thicker than head joint)
bed = np.minimum(fv, 1 - fv) < bed_w
head = np.minimum(fu, 1 - fu) < head_w
mortar = (bed | head).astype(float)
mortar_soft = blur(mortar, 1.6)
grn = noise(50, 170)
pit = (noise(40, 110) > 1.75).astype(float)
streak = noise(2, 8, (4, 1)) * .5 + noise(6, 20, (6, 1)) * .3                         # vertical rain-wash streaks
dirt_low = np.clip((v - .55) * 2.2, 0, 1) * 0                                             # (plinth soot is added by the shader using world height)
alb = norm01(grn * .28 + streak * .62 + blk_tone * .38 - pit * 1.2 - mortar_soft * 1.9, 3.4)
hgt = grn * .3 + streak * .16 - pit * 1.0 - mortar_soft * 3.0 + blk_tone * .08
cav = np.clip(1 - pit * .5 - mortar_soft * .85 - .06 * norm01(-streak, 2), 0, 1)
save("detail_wall.png", alb, hgt, cav, 2.4)

# ------------------------------------------------------------------ roof: overlapping pantiles, 4 x 4 tiles per texture
T = 4
fa = (v * T) % 1.0                      # along slope within a tile (0 = upper edge, 1 = lower lip)
fc = (u * T) % 1.0                      # across within a tile
trow = np.floor(v * T).astype(int)
tcol = np.floor(u * T).astype(int)
ttone = rng.normal(0, 1, (T, T))[trow % T, tcol % T]
profile = np.sin(fc * np.pi) ** .6      # S-curve crown across the tile
lip = np.clip((fa - .78) / .22, 0, 1)   # raised overlapping lower edge
shadow = np.clip((.18 - fa) / .18, 0, 1)  # shadow cast by the tile above onto this tile's head
hgt = profile * 1.7 + lip ** 1.5 * 1.5 - shadow * .9
side = np.minimum(fc, 1 - fc) < .04     # side seam between tile columns
hgt -= side * 1.2
moss = (noise(2, 7) > .9).astype(float) * norm01(noise(20, 70), 3)                  # damp/lichen patches
alb = norm01(ttone * .45 + noise(40, 140) * .25 + noise(3, 10) * .3 - lip * .35 - shadow * .7 - side * .6 - moss * .9, 3.0)
cav = np.clip(1 - shadow * .75 - side * .5 - .1 * (fa < .1), 0, 1)
save("detail_roof.png", alb, hgt, cav, 2.2)
