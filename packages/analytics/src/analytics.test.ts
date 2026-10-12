import { describe, expect, it } from "vitest";
import { EVENT_NAMES, PiiError, createTracker, memorySink } from "./index";

describe("analytics", () => {
  it("covers the events named in the product spec", () => {
    for (const e of ["landing_viewed", "play_started", "weekly_meaningful_session", "low_fps_sample"]) expect(EVENT_NAMES).toContain(e);
  });
  it("records versioned events with an anonymous session id", () => {
    const sink = memorySink();
    createTracker({ sink, sessionId: "s1", now: () => new Date(0) }).track("play_started", { campus: "unity_heights" });
    expect(sink.records[0]).toEqual({ event: "play_started", sessionId: "s1", at: "1970-01-01T00:00:00.000Z", version: 1, props: { campus: "unity_heights" } });
  });
  it("rejects properties that look like personal data", () => {
    const t = createTracker({ sink: memorySink(), sessionId: "s" });
    expect(() => t.track("play_started", { email: "a@b.c" })).toThrow(PiiError);
    expect(() => t.track("play_started", { displayName: "x" })).toThrow(PiiError);
  });
});
