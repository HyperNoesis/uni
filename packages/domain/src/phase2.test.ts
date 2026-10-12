import { describe, expect, it } from "vitest";
import { ACHIEVEMENTS, CAMPUS_IDS, DEFAULT_AVATAR, ITEMS, ITEM_BY_ID, RENAME_COOLDOWN_MS, ROOM, avatarEquals, canRename, checkBio, checkDisplayName, defaultLayout, footprint, itemIndexAt, ownedCounts, parseAvatar, randomAvatar, reputationTitle, starterKit, validateLayout, achievementsFor, type HomeLayout } from "@campus/domain";

const campus = "unity_heights" as const;
const owned = ownedCounts(starterKit(campus));
const L = (items: HomeLayout["items"]): HomeLayout => ({ theme: { wall: "#2a3b6e", floor: "wood" }, items });
const codes = (r: ReturnType<typeof validateLayout>) => (r.ok ? [] : r.errors.map((e) => e.code));

describe("avatar", () => {
  it("parses defaults, fills legacy parts, rejects junk", () => {
    expect(parseAvatar(DEFAULT_AVATAR)).toEqual(DEFAULT_AVATAR);
    expect(parseAvatar({ skin: "#f1d3b5", outfit: "#2f6bff", hair: "short", accessory: "none" })).toMatchObject({ hairColor: "#1a1210", top: "tee" });
    expect(parseAvatar({ ...DEFAULT_AVATAR, hair: "mohawk" })).toBeNull();
    expect(parseAvatar(null)).toBeNull();
  });
  it("randomAvatar is deterministic and valid", () => {
    for (let s = 0; s < 200; s++) { const a = randomAvatar(s); expect(avatarEquals(a, randomAvatar(s))).toBe(true); expect(parseAvatar(a)).toEqual(a); }
  });
});
describe("home rules", () => {
  it("default layout is valid for every campus", () => { for (const c of CAMPUS_IDS) expect(validateLayout(defaultLayout(c), ownedCounts(starterKit(c)), c)).toEqual({ ok: true }); });
  it("catches ownership, campus lock, bounds, overlap, door, wall errors", () => {
    expect(codes(validateLayout(L([{ itemId: "lamp_neon", x: 0, y: 0, rot: 0 }]), owned, campus))).toEqual(["not_owned"]);
    expect(codes(validateLayout(L([{ itemId: "banner_lagoon_tech", x: 0, y: 0, rot: 0 }]), { banner_lagoon_tech: 1 }, campus))).toEqual(["campus_locked"]);
    expect(codes(validateLayout(L([{ itemId: "bed_single", x: 9, y: 0, rot: 0 }]), owned, campus))).toEqual(["out_of_bounds"]);
    expect(codes(validateLayout(L([{ itemId: "desk", x: 0, y: 0, rot: 0 }, { itemId: "chair", x: 1, y: 0, rot: 0 }]), owned, campus))).toEqual(["overlap"]);
    expect(codes(validateLayout(L([{ itemId: "chair", x: ROOM.door.x, y: ROOM.rows - 1, rot: 0 }]), owned, campus))).toEqual(["blocks_door"]);
    expect(codes(validateLayout(L([{ itemId: "window", x: 0, y: 2, rot: 0 }]), owned, campus))).toEqual(["wall_row"]);
    expect(validateLayout(L([{ itemId: "rug_blue", x: 0, y: 0, rot: 0 }, { itemId: "chair", x: 1, y: 1, rot: 0 }]), owned, campus)).toEqual({ ok: true });
    expect(footprint({ w: 2, h: 3 }, 1)).toEqual({ w: 3, h: 2 });
  });
  it("hit test prefers furniture over rug", () => {
    const l = defaultLayout(campus);
    expect(itemIndexAt(l, 7, 1)).toBe(l.items.findIndex((i) => i.itemId === "chair"));
  });
});
describe("text and identity", () => {
  it("names: accepts normal, blocks reserved/contact/links/blocklist", () => {
    expect(checkDisplayName("  Ada   B ")).toEqual({ ok: true, text: "Ada B" });
    expect(checkDisplayName("admin_ada")).toMatchObject({ reason: "reserved_name" });
    expect(checkDisplayName("Modupe").ok).toBe(true);
    expect(checkDisplayName("call 08012345678")).toMatchObject({ reason: "contact_info" });
    expect(checkDisplayName("b4dw0rd", { blockedTerms: ["badword"] })).toMatchObject({ reason: "blocked_term" });
  });
  it("bios: empty ok, blocks phone/email/links", () => {
    expect(checkBio("  ")).toEqual({ ok: true, text: "" });
    expect(checkBio("0801-234-5678")).toMatchObject({ reason: "contact_info" });
    expect(checkBio("ada (at) example (dot) com")).toMatchObject({ reason: "contact_info" });
    expect(checkBio("see https://example.com")).toMatchObject({ reason: "link" });
    expect(checkBio("Class of 2027, 300 level").ok).toBe(true);
  });
  it("titles, cooldown, achievements", () => {
    expect(reputationTitle(15).title).toBe("Regular");
    expect(reputationTitle(400).next).toBeNull();
    const t = Date.parse("2026-10-01T00:00:00Z");
    expect(canRename(new Date(t).toISOString(), t + RENAME_COOLDOWN_MS - 1)).toMatchObject({ ok: false });
    expect(canRename("garbage", t)).toEqual({ ok: true });
    expect(achievementsFor({ type: "HOME_SAVED", placed: 4 })).toEqual([]);
    const earned = ITEMS.filter((i) => i.source === "achievement").map((i) => i.id).sort();
    expect(ACHIEVEMENTS.map((a) => a.itemId).filter(Boolean).sort()).toEqual(earned);
    for (const a of ACHIEVEMENTS) if (a.itemId) expect(ITEM_BY_ID.get(a.itemId)).toBeDefined();
  });
});
