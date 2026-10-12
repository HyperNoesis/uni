import { describe, expect, it } from "vitest";
import { AppError, createLogger, parseLogLevel, redact, toErrorBody } from "./logging";

describe("logging", () => {
  it("emits one JSON line with service, level and bindings", () => {
    const lines: string[] = [];
    const log = createLogger({ service: "t", sink: (l) => lines.push(l), now: () => new Date(0) }).child({ correlationId: "c1" });
    log.info("hello", { n: 1 });
    const rec = JSON.parse(lines[0]!);
    expect(rec.service).toBe("t");
    expect(rec.level).toBe("info");
    expect(rec.correlationId).toBe("c1");
    expect(rec.time).toBe("1970-01-01T00:00:00.000Z");
  });
  it("respects the minimum level", () => {
    const lines: string[] = [];
    const log = createLogger({ service: "t", level: "warn", sink: (l) => lines.push(l) });
    log.info("skip");
    log.error("keep");
    expect(lines).toHaveLength(1);
  });
  it("redacts secrets, including nested ones", () => {
    const out = redact({ token: "abc", nested: { Authorization: "Bearer x", ok: 1 } }) as any;
    expect(out.token).toBe("[redacted]");
    expect(out.nested.Authorization).toBe("[redacted]");
    expect(out.nested.ok).toBe(1);
  });
  it("survives cyclic objects", () => {
    const a: any = { x: 1 };
    a.self = a;
    expect(() => redact(a)).not.toThrow();
  });
  it("parses levels with a safe default", () => {
    expect(parseLogLevel("debug")).toBe("debug");
    expect(parseLogLevel("nope")).toBe("info");
  });
  it("hides unexpected error details but shows AppError messages", () => {
    expect(toErrorBody(new Error("db password leaked")).body.message).toBe("Something went wrong.");
    const e = toErrorBody(new AppError("not_found", "No such run", 404), "cid");
    expect(e.status).toBe(404);
    expect(e.body.correlationId).toBe("cid");
    expect(toErrorBody(new AppError("boom", "secret detail", 500)).body.error).toBe("internal_error");
  });
});
