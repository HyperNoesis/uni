import { describe, expect, it } from "vitest";
import { ZONE_DEFS, ASSET_MANIFEST, isBlocked, assetLimits, assetsForZone, parseAssetManifest } from "./index";

const base = { schemaVersion: 1, defaults: { maxBytes: 1000, maxTriangles: 100 }, residentBudget: { maxBytes: 5000, maxTriangles: 500 }, assets: [] as any[] };
const zones = ["library", "food_court"];
const asset = (o: any = {}) => ({ id: "palm", url: "/assets/props/palm.glb", slot: "prop:tree", zones: ["library"], ...o });

describe("asset manifest", () => {
  it("ships valid, with every prop kind and decor model resolvable to a streamable asset", () => {
    expect(ASSET_MANIFEST.assets.length).toBeGreaterThan(0);
    const bySlot = new Map(ASSET_MANIFEST.assets.map((a) => [a.slot, a]));
    for (const z of ZONE_DEFS) {
      for (const d of z.decor) {
        const a = bySlot.get(`decor:${d.model}`);
        expect(a).toBeDefined();
        expect(a!.zones === "all" || a!.zones.includes(z.id)).toBe(true); // streamed where it is placed
      }
    }
  });
  it("keeps decor off solid geometry and every model inside its size budget", () => {
    for (const z of ZONE_DEFS) for (const d of z.decor) expect(isBlocked(d.x, d.y)).toBe(false);
    for (const a of ASSET_MANIFEST.assets) { expect(a.size).toBeDefined(); expect(a.maxTriangles!).toBeLessThanOrEqual(2600); expect(a.maxBytes!).toBeLessThanOrEqual(300000); }
  });
  it("accepts a good entry and selects by zone", () => {
    const m = parseAssetManifest({ ...base, assets: [asset(), asset({ id: "bench", slot: "prop:bench", zones: "all" })] }, zones);
    expect(assetsForZone(m, "library").map((a) => a.id)).toEqual(["palm", "bench"]);
    expect(assetsForZone(m, "food_court").map((a) => a.id)).toEqual(["bench"]);
    expect(assetsForZone(m, undefined).map((a) => a.id)).toEqual(["bench"]);
  });
  it("rejects external urls, duplicates, unknown zones", () => {
    for (const url of ["https://evil.example/x.glb", "//evil/x.glb", "/assets/../x.glb", "data:model/gltf-binary;base64,AA", "/assets/x.exe"])
      expect(() => parseAssetManifest({ ...base, assets: [asset({ url })] }, zones)).toThrow();
    expect(() => parseAssetManifest({ ...base, assets: [asset(), asset()] }, zones)).toThrow(/duplicate/);
    expect(() => parseAssetManifest({ ...base, assets: [asset(), asset({ id: "other" })] }, zones)).toThrow(/slot/);
    expect(() => parseAssetManifest({ ...base, assets: [asset({ zones: ["nowhere"] })] }, zones)).toThrow(/unknown zone/);
  });
  it("caps per-asset limits at the resident budget", () => {
    const m = parseAssetManifest({ ...base, assets: [asset({ maxBytes: 99999 })] }, zones);
    expect(assetLimits(m, m.assets[0]!)).toEqual({ maxBytes: 5000, maxTriangles: 100 });
  });
});
