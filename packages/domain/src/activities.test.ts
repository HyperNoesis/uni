import { describe, expect, it } from "vitest";
import { HUNT_START_POINT_ID, HUNT_STOPS } from "./activities";
import { getItem } from "./items";
import { SHOP_CATALOG, shopItem, shopOffer } from "./shop";
import { INTERACTION_POINTS, isBlocked } from "./index";

describe("server-owned Campus activities and shop content", () => {
  it("has a unique, walkable, visible hunt start and ordered hidden checkpoints", () => {
    const ids = new Set(INTERACTION_POINTS.map((p) => p.id));
    expect(ids.size).toBe(INTERACTION_POINTS.length);
    const start = INTERACTION_POINTS.find((p) => p.id === HUNT_START_POINT_ID);
    expect(start?.activity).toBe("hunt");
    expect(start?.hidden).toBeFalsy();
    expect(start && isBlocked(start.x, start.y)).toBe(false);
    expect(HUNT_STOPS).toHaveLength(3);
    for (const stop of HUNT_STOPS) {
      const point = INTERACTION_POINTS.find((p) => p.id === stop.pointId);
      expect(point).toMatchObject({ activity: "hunt", hidden: true });
      expect(point && isBlocked(point.x, point.y)).toBe(false);
    }
    expect(new Set(HUNT_STOPS.map((s) => s.pointId)).size).toBe(HUNT_STOPS.length);
  });

  it("offers only real shop items at unique, positive server-owned prices", () => {
    const ids = new Set<string>();
    for (const offer of SHOP_CATALOG) {
      expect(ids.has(offer.itemId)).toBe(false);
      ids.add(offer.itemId);
      expect(Number.isSafeInteger(offer.price) && offer.price > 0).toBe(true);
      expect(shopOffer(offer.itemId)).toEqual(offer);
      expect(shopItem(offer.itemId)).toBeDefined();
      expect(getItem(offer.itemId)).toMatchObject({ id: offer.itemId, source: "shop" });
    }
    expect(SHOP_CATALOG).toHaveLength(8);
    expect(shopOffer("rug_blue")).toBeUndefined();
    expect(shopItem("rug_blue")).toBeUndefined();
  });
});
