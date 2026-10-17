// What an avatar wears on the realistic bodies: which optional geometry groups (hair, hats, glasses, bags, hood, skirt) and which
// shader styling (top pattern, trousers, shoe colour). Pure and dependency-free: unit-tested without GL.
import type { Avatar } from "@campus/domain";

export type RGB = [number, number, number];
const hex = (h: string): RGB => { const n = parseInt(String(h).replace("#", ""), 16) || 0; return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
const luma = (c: RGB) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

export const TOP_PATTERN: Record<string, number> = { tee: 0, hoodie: 0, kaftan: 0, jersey: 5, stripes: 1, ankara: 2, camo: 3, polo: 4 };
export const BOTTOM_KIND: Record<string, number> = { jeans: 0, chinos: 1, joggers: 2, shorts: 3 };
const SHOES: Record<string, { kind: number; color: RGB }> = {
  white_sneakers: { kind: 0, color: [1, 1, 1] }, black_sneakers: { kind: 1, color: [0.07, 0.07, 0.08] }, red_sneakers: { kind: 1, color: [0.72, 0.1, 0.08] },
  boots: { kind: 1, color: [0.22, 0.14, 0.09] }, sandals: { kind: 1, color: [0.5, 0.34, 0.2] },
};

/** Optional geometry groups (names as written by scripts/models/wardrobe.py) this avatar wears. */
export function wardrobeGroups(a: Avatar): string[] {
  const g: string[] = [], female = (a.body ?? "m") === "f";
  if (a.hair === "bald") g.push("hair_bald");
  else if (a.hair === "short" || a.hair === "fade") { if (female) g.push("hair_short"); } // the male head already carries painted short hair
  else g.push("hair_" + a.hair);
  if (a.headwear && a.headwear !== "none") g.push("head_" + a.headwear);
  if (a.accessory !== "none") g.push("acc_" + a.accessory);
  if (a.backpack === "backpack") g.push("pack_backpack"); else if (a.backpack === "satchel") g.push("pack_satchel");
  if (a.top === "hoodie") g.push("top_hood"); else if (a.top === "kaftan") g.push("top_skirt");
  if (female) g.push("shoes_f");
  return g;
}

export interface AvatarStyle { topPat: number; topAcc: RGB; botKind: number; shoeKind: number; shoeColor: RGB }
export function styleFor(a: Avatar): AvatarStyle {
  const shoe = SHOES[a.shoes ?? "white_sneakers"] ?? SHOES.white_sneakers!, light = luma(hex(a.outfit)) > 0.55;
  return { topPat: TOP_PATTERN[a.top] ?? 0, topAcc: light ? [0.1, 0.14, 0.28] : [0.96, 0.94, 0.9], botKind: BOTTOM_KIND[a.bottom ?? "jeans"] ?? 0, shoeKind: shoe.kind, shoeColor: shoe.color };
}
