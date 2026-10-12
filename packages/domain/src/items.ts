import type { CampusKey } from "./campuses";
export type ItemLayer = "floor" | "object" | "wall";
export type ItemSource = "starter" | "achievement" | "shop";
export interface ItemDef { id: string; name: string; layer: ItemLayer; w: number; h: number; art: string; color: string; accent: string; source: ItemSource; campus?: CampusKey }
const i = (id: string, name: string, layer: ItemLayer, w: number, h: number, art: string, color: string, accent: string, source: ItemSource, campus?: CampusKey): ItemDef => ({ id, name, layer, w, h, art, color, accent, source, ...(campus ? { campus } : {}) });
export const ITEMS: readonly ItemDef[] = [
  i("rug_blue", "Blue Rug", "floor", 4, 3, "rug", "#2f6bff", "#5b8bff", "starter"),
  i("bed_single", "Single Bed", "object", 2, 3, "bed", "#e8644a", "#f4f7ff", "starter"),
  i("desk", "Study Desk", "object", 2, 1, "desk", "#a9764a", "#7a5232", "starter"),
  i("chair", "Desk Chair", "object", 1, 1, "chair", "#1b2540", "#2f6bff", "starter"),
  i("bookshelf", "Bookshelf", "object", 2, 1, "shelf", "#8a5a3b", "#e8a24a", "starter"),
  i("lamp", "Reading Lamp", "object", 1, 1, "lamp", "#ffd166", "#1b2540", "starter"),
  i("plant", "Potted Plant", "object", 1, 1, "plant", "#4fb286", "#8a5a3b", "starter"),
  i("beanbag", "Bean Bag", "object", 1, 1, "beanbag", "#8b6fd6", "#b9a6f0", "starter"),
  i("speaker", "Speaker", "object", 1, 1, "speaker", "#1b2540", "#ffd166", "starter"),
  i("window", "Window", "wall", 2, 1, "window", "#9fd3ff", "#f4f7ff", "starter"),
  i("poster_study", "Study Poster", "wall", 1, 1, "poster", "#ffd166", "#1b2540", "starter"),
  i("banner_unity_heights", "Unity Heights Banner", "wall", 1, 1, "banner", "#2f6bff", "#ffd166", "starter", "unity_heights"),
  i("banner_lagoon_tech", "Lagoon Tech Banner", "wall", 1, 1, "banner", "#1fb7c9", "#0b1530", "starter", "lagoon_tech"),
  i("banner_savannah_state", "Savannah State Banner", "wall", 1, 1, "banner", "#e8a24a", "#1b2540", "starter", "savannah_state"),
  i("poster_football", "Match Day Poster", "wall", 1, 1, "poster", "#3fae5a", "#f4f7ff", "achievement"),
  i("lamp_neon", "Neon Lamp", "object", 1, 1, "neon_lamp", "#ff5fa2", "#5bf0ff", "achievement"),
  i("typewriter", "Typewriter", "object", 1, 1, "typewriter", "#3a3f4b", "#f4f7ff", "achievement"),
  i("trophy_case", "Trophy Case", "object", 1, 1, "trophy", "#ffd166", "#a9764a", "achievement"),
  // Purchasable room cosmetics. Art uses the existing lightweight canvas renderer.
  i("rug_cobalt", "Cobalt Lounge Rug", "floor", 4, 3, "rug", "#183d96", "#65c7ff", "shop"),
  i("neon_lamp_cyan", "Cyan Neon Lamp", "object", 1, 1, "neon_lamp", "#42e7ff", "#2f6bff", "shop"),
  i("campus_banner", "Campus Pride Banner", "wall", 1, 1, "banner", "#2f6bff", "#ffd166", "shop"),
  i("golden_trophy", "Golden Trophy", "object", 1, 1, "trophy", "#ffd166", "#a9764a", "shop"),
  i("beanbag_sunset", "Sunset Bean Bag", "object", 1, 1, "beanbag", "#ff7b54", "#ffd166", "shop"),
  i("speaker_pulse", "Pulse Speaker", "object", 1, 1, "speaker", "#183d96", "#42e7ff", "shop"),
  i("poster_campus", "Campus Life Poster", "wall", 1, 1, "poster", "#f4f7ff", "#2f6bff", "shop"),
  i("bookshelf_oak", "Oak Bookcase", "object", 2, 1, "shelf", "#8a5a3b", "#ffd166", "shop"),
];
export const ITEM_BY_ID: ReadonlyMap<string, ItemDef> = new Map(ITEMS.map((x) => [x.id, x]));
export const getItem = (id: string) => ITEM_BY_ID.get(id);
export const itemAllowedFor = (it: ItemDef, c: CampusKey) => it.campus === undefined || it.campus === c;
export interface KitEntry { itemId: string; qty: number }
export const starterKit = (c: CampusKey): KitEntry[] =>
  ITEMS.filter((x) => x.source === "starter" && itemAllowedFor(x, c)).map((x) => ({ itemId: x.id, qty: x.id === "plant" ? 2 : 1 }));
