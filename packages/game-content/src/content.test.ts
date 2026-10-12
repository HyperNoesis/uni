import { describe, expect, it } from "vitest";
import { ZONES } from "@campus/domain";
import { ACTIVITY_CATALOG, ZONE_CONTENT, validateContent } from "./index";

describe("game content", () => {
  it("validates", () => {
    expect(() => validateContent()).not.toThrow();
  });
  it("has exactly one content entry for every campus zone", () => {
    expect(ZONES.length).toBeGreaterThanOrEqual(22);
    expect(ZONE_CONTENT).toHaveLength(ZONES.length);
    expect(new Set(ZONE_CONTENT.map((c) => c.zoneId))).toEqual(new Set(ZONES.map((z) => z.id)));
  });
  it("lists the six first activities with reaction and quiz live", () => {
    expect(ACTIVITY_CATALOG).toHaveLength(6);
    expect(ACTIVITY_CATALOG.filter((a) => a.status === "live").map((a) => a.id)).toEqual(["reaction", "quiz"]);
  });
});
