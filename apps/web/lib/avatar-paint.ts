// Turns a player's saved avatar (skin, outfit, top, shoes, hair, backpack, accessory) into per-material colours and
// the set of optional geometry groups (hood, kaftan skirt, backpack, satchel, chain) for the painted skinned body.
// The body GLB carries semantic material ids + baked AO per vertex (scripts/models/paint-character.py); this file is the
// only place that decides what those ids look like. Pure and dependency-free so it is unit-tested without GL.
import type { Avatar } from "@campus/domain";

/** Mirror of MAT in scripts/models/paint-character.py. */
export const MAT = {
  SKIN: 0, TORSO: 1, SLEEVE: 2, SLEEVE_HEM: 3, FOREARM: 4, CUFF: 5, HAND: 6, HEM: 7, COLLAR: 8, POCKET: 9, SASH: 10,
  PANTS: 11, PANTS_CUFF: 12, SOCK: 13, SHOE_UPPER: 14, SHOE_SOLE: 15, BOOT_SHAFT: 16, BOOT_TOP: 17, HAIR_TOP: 18, HAIR_LOW: 19,
  HOOD: 20, HOOD_INNER: 21, SKIRT: 22, SKIRT_HEM: 23, PACK: 24, PACK_ACCENT: 25, STRAP: 26, SATCHEL: 27, SATCHEL_FLAP: 28, BUCKLE: 29, CHAIN: 30,
  FACE_EYE: 31, FACE_IRIS: 32, FACE_BROW: 33, FACE_MOUTH: 34, FACE_TEETH: 35, NOSE: 36, EAR: 37, GLASS_FRAME: 38, LENS: 39, PHONE_BAND: 40, PHONE_CUP: 41,
  CAP: 42, CAP_VISOR: 43, WRAP: 44, WRAP_BAND: 45, HAIR: 46,
} as const;
export const MAT_COUNT = 48;
export type GroupName = string; // "hood" | "skirt" | "backpack" | "satchel" | "chain" | "hair_<style>" | "face_<expression>" | "acc_<kind>"
export type RGB = [number, number, number];

const hex = (h: string): RGB => { const n = parseInt(String(h).replace("#", ""), 16) || 0; return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
const shade = (c: RGB, k: number): RGB => k >= 0 ? [c[0] + (1 - c[0]) * k, c[1] + (1 - c[1]) * k, c[2] + (1 - c[2]) * k] : [c[0] * (1 + k), c[1] * (1 + k), c[2] * (1 + k)];
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const luma = (c: RGB) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

interface ShoeLook { upper: RGB; sole: RGB; sock: RGB | null; boot: boolean }
const SHOES: Record<string, ShoeLook> = {
  white_sneakers: { upper: hex("#f1f2f4"), sole: hex("#aeb3bd"), sock: hex("#ffffff"), boot: false },
  black_sneakers: { upper: hex("#1b1d23"), sole: hex("#e6e7ea"), sock: hex("#d9dbe0"), boot: false },
  red_sneakers: { upper: hex("#c9362d"), sole: hex("#f0f0f0"), sock: hex("#ffffff"), boot: false },
  boots: { upper: hex("#4b3426"), sole: hex("#17110d"), sock: null, boot: true },
  sandals: { upper: [-1, -1, -1], sole: hex("#6c4a2e"), sock: null, boot: false }, // upper/sock = bare foot (skin)
};

/** Which optional geometry groups this avatar draws. */
export function groupsFor(a: Avatar): GroupName[] {
  const g: GroupName[] = [];
  if (a.top === "hoodie") g.push("hood");
  if (a.top === "kaftan") g.push("skirt");
  const pack = a.backpack ?? "none"; if (pack === "backpack") g.push("backpack"); else if (pack === "satchel") g.push("satchel");
  if (a.accessory === "chain") g.push("chain"); else if (a.accessory !== "none") g.push("acc_" + a.accessory);
  if (!hairIsPainted(a.hair)) g.push("hair_" + a.hair);
  g.push("face_" + (a.face ?? "smile"));
  return g;
}

/** Stable cache key: everything that changes the painted colours or the group set. */
export const paintKey = (a: Avatar) => [a.skin, a.outfit, a.top, a.hair, a.hairColor, a.shoes ?? "white_sneakers", a.backpack ?? "none", a.accessory].join("|");

/** Palette[materialId] -> rgb (0..1). */
export function paletteFor(a: Avatar): RGB[] {
  const skin = hex(a.skin), T = hex(a.outfit), hair = hex(a.hairColor), p = new Array<RGB>(MAT_COUNT).fill(skin);
  const pantsBase: RGB = luma(T) < 0.2 ? hex("#454c5c") : hex("#2a3144"), pants = a.top === "kaftan" ? shade(T, -0.42) : pantsBase;
  const shoe = SHOES[a.shoes ?? "white_sneakers"] ?? SHOES.white_sneakers!;
  const jerseyTrim: RGB = luma(T) > 0.62 ? hex("#1b2540") : hex("#f4f1e8"), gold = hex("#e8c25a");
  const long = a.top === "hoodie" || a.top === "kaftan";

  p[MAT.SKIN] = skin; p[MAT.HAND] = skin;
  p[MAT.TORSO] = T; p[MAT.SLEEVE] = T;
  p[MAT.SLEEVE_HEM] = a.top === "jersey" ? jerseyTrim : shade(T, -0.12);
  p[MAT.FOREARM] = long ? T : skin;
  p[MAT.CUFF] = long ? (a.top === "kaftan" ? gold : shade(T, -0.26)) : skin;
  p[MAT.HEM] = a.top === "hoodie" ? shade(T, -0.25) : a.top === "jersey" ? jerseyTrim : T;
  p[MAT.COLLAR] = a.top === "jersey" ? jerseyTrim : a.top === "kaftan" ? gold : a.top === "hoodie" ? shade(T, -0.32) : shade(T, -0.2);
  p[MAT.POCKET] = a.top === "hoodie" ? shade(T, -0.12) : T; p[MAT.SASH] = a.top === "jersey" ? jerseyTrim : T;
  p[MAT.PANTS] = pants; p[MAT.PANTS_CUFF] = shade(pants, -0.18);
  p[MAT.HOOD] = T; p[MAT.HOOD_INNER] = shade(T, -0.38);
  p[MAT.SKIRT] = T; p[MAT.SKIRT_HEM] = gold;
  // feet: boots swallow the trouser leg up to mid-shin; sneakers show a sock band; sandals leave the foot bare
  if (shoe.boot) { p[MAT.BOOT_SHAFT] = shoe.upper; p[MAT.BOOT_TOP] = shade(shoe.upper, -0.35); p[MAT.SOCK] = shoe.upper; }
  else { p[MAT.BOOT_SHAFT] = pants; p[MAT.BOOT_TOP] = pants; p[MAT.SOCK] = shoe.sock ?? skin; }
  p[MAT.SHOE_UPPER] = shoe.upper[0] < 0 ? skin : shoe.upper; p[MAT.SHOE_SOLE] = shoe.sole;
  // hair painted on the scalp (props add volume for afro/braids/locs/bun/wrap/cap)
  p[MAT.HAIR_TOP] = a.hair === "bald" ? skin : hair; p[MAT.HAIR_LOW] = a.hair === "bald" ? skin : a.hair === "fade" ? mix(skin, hair, 0.45) : hair;
  const capC = luma(T) > 0.5 ? hex("#1b2540") : hex("#f4f1e8");
  p[MAT.FACE_EYE] = hex("#f3efe8"); p[MAT.FACE_IRIS] = hex("#1a120e"); p[MAT.FACE_BROW] = shade(skin, -0.7);
  p[MAT.FACE_MOUTH] = mix(shade(skin, -0.55), hex("#7a2630"), 0.45); p[MAT.FACE_TEETH] = hex("#fafafa");
  p[MAT.NOSE] = shade(skin, -0.03); p[MAT.EAR] = shade(skin, -0.06);
  p[MAT.GLASS_FRAME] = hex("#1d2028"); p[MAT.LENS] = hex("#0c0e13"); p[MAT.PHONE_BAND] = hex("#1d2028"); p[MAT.PHONE_CUP] = shade(T, 0.12);
  p[MAT.CAP] = capC; p[MAT.CAP_VISOR] = shade(capC, -0.22); p[MAT.WRAP] = shade(T, 0.12); p[MAT.WRAP_BAND] = gold; p[MAT.HAIR] = hair;
  p[MAT.PACK] = shade(T, -0.5); p[MAT.PACK_ACCENT] = shade(T, 0.05); p[MAT.STRAP] = hex("#1d2028");
  p[MAT.SATCHEL] = hex("#9a6b3c"); p[MAT.SATCHEL_FLAP] = hex("#7d522b"); p[MAT.BUCKLE] = gold; p[MAT.CHAIN] = hex("#e2b84a");
  return p;
}

/** Hair painted onto the scalp is enough for these styles (no separate prop needed). */
export function hairIsPainted(hair: string): boolean { return hair === "short" || hair === "fade" || hair === "bald"; }

/** Per-vertex colours = palette[material] x baked AO. `ao` curve keeps shadowed creases readable but never black. */
export function paintVertexColors(paint: Uint8Array, vertexCount: number, a: Avatar): Float32Array {
  const pal = paletteFor(a), out = new Float32Array(vertexCount * 3);
  for (let v = 0; v < vertexCount; v++) {
    const c = pal[paint[v * 4]!] ?? pal[0]!, ao = 0.5 + 0.5 * (paint[v * 4 + 1]! / 255);
    out[v * 3] = c[0] * ao; out[v * 3 + 1] = c[1] * ao; out[v * 3 + 2] = c[2] * ao;
  }
  return out;
}
