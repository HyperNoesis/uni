import { describe, expect, it } from "vitest";
import { SOCIAL, chatAllowed, checkChat, checkGroupName, dmKey, pairKey } from "./social";

describe("chat policy", () => {
  it("accepts normal text and normalises whitespace", () => { expect(checkChat("  hello   there  ")).toEqual({ ok: true, text: "hello there" }); });
  it.each([["", "empty"], ["x".repeat(SOCIAL.chatMax + 1), "too_long"], ["mail me bob@gmail.com", "contact_info"], ["call 0803 123 4567 now", "contact_info"],
    ["visit www.site.xyz", "link"], ["join discord.gg", "link"], ["heyyyyyyyyyy", "repetition"]])("rejects %s", (t, reason) => {
    const r = checkChat(t); expect(r.ok).toBe(false); if (!r.ok) expect(r.reason).toBe(reason);
  });
  it("applies operator blocked terms through leetspeak", () => { const r = checkChat("you are a b4dw0rd", { blockedTerms: ["badword"] }); expect(r.ok).toBe(false); });
  it("validates group names", () => {
    expect(checkGroupName("Library Crew").ok).toBe(true);
    expect(checkGroupName("ab").ok).toBe(false);
    expect(checkGroupName("bad!!name").ok).toBe(false);
    expect(checkGroupName("buy at shop.com").ok).toBe(false);
  });
});

describe("chat limiter and keys", () => {
  it("enforces min gap and per-minute cap", () => {
    expect(chatAllowed([], 1000)).toEqual({ ok: true });
    expect(chatAllowed([1000], 1500)).toMatchObject({ ok: false, retryMs: 500 });
    const many = Array.from({ length: SOCIAL.chatPerMinute }, (_, i) => 1000 + i * 1100);
    expect(chatAllowed(many, many.at(-1)! + 1100).ok).toBe(false);
    expect(chatAllowed(many, 1000 + 61_000 + 20_000).ok).toBe(true);
  });
  it("pair and dm keys are order independent", () => { expect(pairKey("b", "a")).toBe(pairKey("a", "b")); expect(dmKey("z", "a")).toBe(dmKey("a", "z")); });
});
