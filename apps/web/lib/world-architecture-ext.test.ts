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

import { grandGate } from "./world-hero-gate";
describe("Grand Gate hero landmark", () => {
  it("is finite, deterministic and scales with quality, keeping the walking lane open", () => {
    const run = (q: Quality) => { const boxes: number[][] = []; let bad = 0, n = 0; const f = (...v: unknown[]) => { n++; if (v.some((t) => typeof t === "number" && !Number.isFinite(t))) bad++; };
      const p: P = { box: (x, z, w, d, h, _c, y0 = 0) => { f(x, z, w, d, h, y0); boxes.push([x, z, w, d, y0, y0 + h]); }, cyl: f, sph: f, rbox: f, lbox: f, lsph: f }; grandGate(60, 129.5, q, p); return { n, bad, boxes }; };
    const l = run("low"), m = run("medium"), h = run("high"), m2 = run("medium");
    expect(l.bad + m.bad + h.bad).toBe(0); expect(m.n).toBe(m2.n); expect(l.n).toBeGreaterThan(60); expect(h.n).toBeGreaterThanOrEqual(m.n); expect(m.n).toBeGreaterThan(l.n);
    // nothing solid (below 4.5 m) intrudes into the central lane |x-60|<5.95
    for (const [x, , w, , y0] of m.boxes) if (y0 < 4.5 && x < 60 + 5.95 && x + w > 60 - 5.95 && y0 > .1) throw new Error("gate blocks the lane " + JSON.stringify([x, w, y0]));
  });
});
