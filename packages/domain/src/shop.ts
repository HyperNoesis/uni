import { ITEM_BY_ID, type ItemDef } from "./items";

/** Server-owned prices. A client may display these, but can never choose a price. */
export interface ShopOffer {
  itemId: string;
  price: number;
  tagline: string;
  featured?: boolean;
}

export const SHOP_CATALOG: readonly ShopOffer[] = [
  { itemId: "rug_cobalt", price: 35, tagline: "A cool blue centrepiece for your room.", featured: true },
  { itemId: "neon_lamp_cyan", price: 65, tagline: "Give your study corner a neon glow." },
  { itemId: "campus_banner", price: 80, tagline: "Show your campus pride on the wall.", featured: true },
  { itemId: "golden_trophy", price: 150, tagline: "A little trophy shelf motivation." },
  { itemId: "beanbag_sunset", price: 45, tagline: "A relaxed seat for late study sessions." },
  { itemId: "speaker_pulse", price: 75, tagline: "Bring a beat to your virtual room." },
  { itemId: "poster_campus", price: 40, tagline: "Make your wall feel like campus." },
  { itemId: "bookshelf_oak", price: 90, tagline: "Give your books a proper home." },
] as const;

const OFFERS = new Map(SHOP_CATALOG.map((offer) => [offer.itemId, offer]));
export function shopOffer(itemId: string): ShopOffer | undefined { return OFFERS.get(itemId); }
export function shopItem(itemId: string): ItemDef | undefined {
  const offer = OFFERS.get(itemId);
  const item = ITEM_BY_ID.get(itemId);
  return offer && item?.source === "shop" ? item : undefined;
}
