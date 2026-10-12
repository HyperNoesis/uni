import { describe, it, expect } from "vitest";
import { ARCHITECTURE_ZONES, buildZoneArchitecture, hasZoneArchitecture, registerArchitecture, type P, type Quality } from "./world-architecture";
import { EXT_ARCH } from "./world-architecture-ext";

registerArchitecture(EXT_ARCH);

const NEW_ZONES = ["engineering_quarter", "science_complex", "medical_college", "arts_row", "business_law", "hostel_estate_east",
  "admin_quarter", "research_park", "innovation_village", "hostel_village", "market_town", "gate_road"];

function recorder() {
  const rec = { n: 0, bad: 0 };
  const f = (...v: unknown[]) => { rec.n++; if (v.some((t) => typeof t === "number" && !Number.isFinite(t))) rec.bad++; };
  const p: P = { box: f, cyl: f, sph: f, rbox: f, lbox: f, lsph: f };
  return { rec, p };
}

describe("zone architecture (extension set)", () => {
  it("registers every new quarter", () => { for (const z of NEW_ZONES) expect(hasZoneArchitecture(z)).toBe(true); expect(ARCHITECTURE_ZONES.length).toBeGreaterThanOrEqual(22); });
  it.each(NEW_ZONES)("%s emits finite, non-empty, deterministic geometry at every quality", (z) => {
    for (const q of ["low", "medium", "high"] as Quality[]) {
      const a = recorder(), b = recorder();
      expect(buildZoneArchitecture(z, q, a.p)).toBe(true); buildZoneArchitecture(z, q, b.p);
      expect(a.rec.n).toBeGreaterThan(40); expect(a.rec.bad).toBe(0); expect(a.rec.n).toBe(b.rec.n);
    }
  });
  it("high quality never emits fewer primitives than low", () => { for (const z of NEW_ZONES) { const l = recorder(), h = recorder(); buildZoneArchitecture(z, "low", l.p); buildZoneArchitecture(z, "high", h.p); expect(h.rec.n).toBeGreaterThanOrEqual(l.rec.n); } });
});
