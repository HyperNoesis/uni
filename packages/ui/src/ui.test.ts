import { describe, expect, it } from "vitest";
import { cssVariables, tokens } from "./index";

describe("tokens", () => {
  it("keeps primary touch targets at 44px or more", () => {
    expect(tokens.touch).toBeGreaterThanOrEqual(44);
  });
  it("keeps UI transitions between 200 and 300ms", () => {
    for (const ms of Object.values(tokens.motion)) {
      expect(ms).toBeGreaterThanOrEqual(200);
      expect(ms).toBeLessThanOrEqual(300);
    }
  });
  it("emits CSS variables", () => {
    const css = cssVariables();
    expect(css).toContain("--color-brand: #2f6bff;");
    expect(css).toContain("--touch: 48px;");
  });
});
