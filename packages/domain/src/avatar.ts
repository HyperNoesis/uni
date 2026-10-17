// Single catalog of legal avatar values. Dependency-free; schemas.ts builds the zod contract from it.
export const AVATAR_OPTIONS = {
  skin: ["#f1d3b5", "#d9a77c", "#b97a4f", "#8a5a3b", "#5e3b26", "#3d2518"],
  outfit: ["#2f6bff", "#e8644a", "#4fb286", "#8b6fd6", "#e8a24a", "#1b2540"],
  hair: ["short", "fade", "afro", "braids", "locs", "bun", "cap", "wrap", "bald", "ponytail", "puffs"],
  hairColor: ["#1a1210", "#3b2415", "#6b3f1d", "#b5651d", "#d9b84a", "#2f6bff"],
  top: ["tee", "hoodie", "jersey", "kaftan", "stripes", "ankara", "camo", "polo"],
  accessory: ["none", "glasses", "sunglasses", "headphones", "chain", "round_glasses", "earrings"],
  // Added in step 3 (customizer parity with the reference: Face / Shoes / Backpack). Optional on input, defaulted by the parser/schema.
  face: ["smile", "calm", "grin", "cool"],
  shoes: ["white_sneakers", "black_sneakers", "red_sneakers", "boots", "sandals"],
  backpack: ["none", "backpack", "satchel"],
  // Wardrobe v2 (realistic bodies): hats, trousers and which body. Optional on input; legacy avatars get the defaults below.
  headwear: ["none", "fila", "beanie", "bucket"],
  bottom: ["jeans", "chinos", "joggers", "shorts"],
  body: ["m", "f"],
} as const;
export type AvatarPart = keyof typeof AVATAR_OPTIONS;
export const AVATAR_PARTS = Object.keys(AVATAR_OPTIONS) as AvatarPart[];
type FullAvatar = { [K in AvatarPart]: (typeof AVATAR_OPTIONS)[K][number] };
/** Parts added after step 3 are optional in the type so older literals/payloads still compile; parsers always fill them in. */
export type Avatar = Omit<FullAvatar, "face" | "shoes" | "backpack" | "headwear" | "bottom" | "body"> & Partial<Pick<FullAvatar, "face" | "shoes" | "backpack" | "headwear" | "bottom" | "body">>;
/** Parts added after Phase 1; older payloads get what they drew before the part existed. */
export const AVATAR_LEGACY_DEFAULTS = { hairColor: "#1a1210", top: "tee", face: "smile", shoes: "white_sneakers", backpack: "none", headwear: "none", bottom: "jeans", body: "m" } as const;
export const DEFAULT_AVATAR: Avatar = { skin: "#b97a4f", outfit: "#2f6bff", hair: "short", hairColor: "#1a1210", top: "tee", accessory: "none", face: "smile", shoes: "white_sneakers", backpack: "none", headwear: "none", bottom: "jeans", body: "m" };
/** Value of a part with the legacy default applied (use when reading an Avatar that may predate a part). */
export const avatarPart = <K extends AvatarPart>(a: Avatar, part: K): FullAvatar[K] =>
  ((a as Record<string, unknown>)[part] ?? (AVATAR_LEGACY_DEFAULTS as Record<string, unknown>)[part]) as FullAvatar[K];

/** Manifest slots (`avatar:<name>`) for the 3D parts this avatar needs. null = nothing to draw (none/bald). */
export function avatarSlots(a: Avatar): { hair: string | null; top: string; face: string; accessory: string | null; shoes: string; backpack: string | null } {
  return {
    hair: a.hair === "bald" ? null : `avatar:hair_${a.hair}`,
    top: `avatar:top_${a.top}`,
    face: `avatar:face_${avatarPart(a, "face")}`,
    accessory: a.accessory === "none" ? null : `avatar:acc_${a.accessory}`,
    shoes: `avatar:shoes_${avatarPart(a, "shoes")}`,
    backpack: avatarPart(a, "backpack") === "none" ? null : `avatar:pack_${avatarPart(a, "backpack")}`,
  };
}

export function parseAvatar(input: unknown): Avatar | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  const o = input as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const part of AVATAR_PARTS) {
    let v = o[part];
    if (v === undefined && part in AVATAR_LEGACY_DEFAULTS) v = AVATAR_LEGACY_DEFAULTS[part as keyof typeof AVATAR_LEGACY_DEFAULTS];
    if (typeof v !== "string" || !(AVATAR_OPTIONS[part] as readonly string[]).includes(v)) return null;
    out[part] = v;
  }
  return out as Avatar;
}
export const avatarEquals = (a: Avatar, b: Avatar) => AVATAR_PARTS.every((p) => avatarPart(a, p) === avatarPart(b, p));

export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T,>(rng: () => number, l: readonly T[]): T => l[Math.min(l.length - 1, Math.floor(rng() * l.length))] as T;

/** "Surprise me": deterministic per seed, mostly natural hair colours. */
export function randomAvatar(seed: number): Avatar {
  const rng = mulberry32(seed);
  return {
    skin: pick(rng, AVATAR_OPTIONS.skin), outfit: pick(rng, AVATAR_OPTIONS.outfit), hair: pick(rng, AVATAR_OPTIONS.hair),
    hairColor: rng() < 0.8 ? pick(rng, AVATAR_OPTIONS.hairColor.slice(0, 3)) : pick(rng, AVATAR_OPTIONS.hairColor),
    top: pick(rng, AVATAR_OPTIONS.top), accessory: rng() < 0.45 ? "none" : pick(rng, AVATAR_OPTIONS.accessory),
    // new parts draw after the legacy ones so existing seeds keep their old look
    face: pick(rng, AVATAR_OPTIONS.face), shoes: pick(rng, AVATAR_OPTIONS.shoes), backpack: rng() < 0.6 ? "none" : pick(rng, AVATAR_OPTIONS.backpack),
    headwear: rng() < 0.7 ? "none" : pick(rng, AVATAR_OPTIONS.headwear), bottom: pick(rng, AVATAR_OPTIONS.bottom), body: rng() < 0.5 ? "m" : "f",
  };
}
export interface AvatarPreset { id: string; name: string; avatar: Avatar }
const P = (id: string, name: string, skin: Avatar["skin"], outfit: Avatar["outfit"], hair: Avatar["hair"], hairColor: Avatar["hairColor"], top: Avatar["top"], accessory: Avatar["accessory"], extra: Pick<FullAvatar, "face" | "shoes" | "backpack"> & Partial<Pick<FullAvatar, "headwear" | "bottom" | "body">> = { face: "smile", shoes: "white_sneakers", backpack: "none" }): AvatarPreset => ({ id, name, avatar: { skin, outfit, hair, hairColor, top, accessory, ...extra } });
export const AVATAR_PRESETS: readonly AvatarPreset[] = [
  P("fresher", "Fresher", "#b97a4f", "#2f6bff", "short", "#1a1210", "tee", "none"),
  P("scholar", "Scholar", "#8a5a3b", "#1b2540", "fade", "#1a1210", "hoodie", "glasses", { face: "calm", shoes: "black_sneakers", backpack: "backpack" }),
  P("striker", "Striker", "#5e3b26", "#4fb286", "cap", "#1a1210", "jersey", "none", { face: "grin", shoes: "red_sneakers", backpack: "none" }),
  P("creator", "Creator", "#d9a77c", "#8b6fd6", "braids", "#2f6bff", "hoodie", "headphones", { face: "cool", shoes: "white_sneakers", backpack: "satchel" }),
  P("chief", "Chief", "#3d2518", "#e8a24a", "bald", "#1a1210", "kaftan", "chain", { face: "smile", shoes: "sandals", backpack: "none" }),
  P("gele", "Gele Queen", "#5e3b26", "#e8a24a", "wrap", "#1a1210", "ankara", "earrings", { face: "smile", shoes: "white_sneakers", backpack: "none", body: "f", bottom: "jeans" }),
  P("campusboy", "Campus Boy", "#8a5a3b", "#4fb286", "fade", "#1a1210", "polo", "round_glasses", { face: "calm", shoes: "white_sneakers", backpack: "backpack", bottom: "chinos", headwear: "none", body: "m" }),
  P("sporty", "Sporty", "#3d2518", "#2f6bff", "ponytail", "#1a1210", "jersey", "headphones", { face: "grin", shoes: "red_sneakers", backpack: "none", body: "f", bottom: "joggers" }),
  P("vibes", "Vibes", "#f1d3b5", "#e8644a", "afro", "#3b2415", "tee", "sunglasses", { face: "cool", shoes: "boots", backpack: "none" }),
];
