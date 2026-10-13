#!/usr/bin/env python3
"""Generate CAMPUS's original, tileable material-detail textures (no third-party art; deterministic).
Each PNG is RGBA: R = albedo detail multiplier (0.5 = neutral, shader uses R*2), G/B = tangent-space normal x/y (0.5 = flat), A = 1 (opaque, so browsers never premultiply the data); cavity/AO is baked into R.
Outputs apps/web/public/assets/textures/detail_{paving,grass,wall}.png (512x512, seamless). Usage: python3 scripts/textures/build-detail-textures.py"""
import numpy as np
from PIL import Image
from pathlib import Path
N = 512; rng = np.random.default_rng(20261013)
fy = np.fft.fftfreq(N)[:, None]; fx = np.fft.rfftfreq(N)[None, :]; fr = np.sqrt(fx * fx + fy * fy) * N + 1e-6
def noise(lo, hi, aniso=(1.0, 1.0)):
    """Periodic band-passed noise in cycles/tile [lo, hi]; aniso stretches frequency response along (x, y)."""
    w = rng.standard_normal((N, N)); F = np.fft.rfft2(w)
    f = np.sqrt((fx * N / aniso[0]) ** 2 + (fy * N / aniso[1]) ** 2) + 1e-6
    F *= np.exp(-((np.log(f) - np.log(np.sqrt(lo * hi))) ** 2) / (2 * (np.log(hi / lo) / 2.2) ** 2))
    o = np.fft.irfft2(F, s=(N, N)); o -= o.mean(); return o / (o.std() + 1e-9)
def norm01(a, s=3.0): return np.clip(.5 + a / (2 * s), 0, 1)
def grad(h, k):
    gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * .5; gy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * .5
    return np.clip(.5 - gx * k, 0, 1), np.clip(.5 - gy * k, 0, 1)
def save(name, albedo, height, ao, k):
    nx, ny = grad(height, k)
    albedo = np.clip(albedo * (.55 + .45 * ao), 0, 1); img = np.stack([albedo, nx, ny, np.ones_like(ao)], -1); Image.fromarray((img * 255 + .5).astype(np.uint8), "RGBA").save(Path("apps/web/public/assets/textures") / name, optimize=True)
    print(name, f"albedo std {albedo.std():.3f}")
# paving: terrazzo-style slab - fine grain, scattered chips, a few hairline cracks
grain = noise(60, 200); mid = noise(6, 24); chips = noise(24, 60)
chip = (chips > 1.55).astype(float); chip = np.clip(chip + (noise(30, 70) > 1.9) * .6, 0, 1)
h = grain * .35 + mid * .25 + chip * 1.1
alb = norm01(grain * .35 + mid * .55 - chip * .9 * (noise(8, 20) > 0) + chip * .6, 3.4) * .9 + .05
crack = (np.abs(noise(2, 6, (1, 3))) < .05).astype(float) * (noise(3, 9) > .4); h -= crack * 1.5; alb -= crack * .18
save("detail_paving.png", np.clip(alb, 0, 1), h, np.clip(1 - crack * .6 - .1 * (mid < -1), 0, 1), 2.2)
# grass: dense blade strokes at several scales, patchy tonal variation
bl = noise(70, 180, (.6, 2.2)) * .55 + noise(30, 90, (.7, 1.8)) * .45; patch = noise(3, 12)
alb = norm01(bl * .5 + patch * .55, 3.3)
save("detail_grass.png", alb, bl + patch * .15, np.clip(.78 + .22 * norm01(bl, 3), 0, 1), 1.6)
# wall: sun-faded render / concrete - fine grain, pits, vertical weathering streaks
gr = noise(50, 160); pit = (noise(40, 110) > 1.7).astype(float); streak = noise(2, 8, (4, 1)) * .5 + noise(6, 20, (6, 1)) * .3
alb = norm01(gr * .3 + streak * .7 - pit * 1.4, 3.6)
save("detail_wall.png", alb, gr * .35 + streak * .2 - pit * 1.2, np.clip(1 - pit * .5 - .08 * norm01(-streak, 2), 0, 1), 2.0)
