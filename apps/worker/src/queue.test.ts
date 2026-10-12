import { describe, expect, it } from "vitest";
import { createLogger } from "@campus/domain/logging";
import { JobQueue, type RunRecord } from "./queue";

const logger = createLogger({ service: "test", sink: () => {} });
function setup(opts: { maxAttempts?: number } = {}) {
  let t = 0;
  const runs: RunRecord[] = [];
  const q = new JobQueue({ logger, now: () => t, baseBackoffMs: 100, onRun: (r) => runs.push(r), ...opts });
  return { q, runs, advance: (ms: number) => void (t += ms) };
}

describe("JobQueue", () => {
  it("runs a job once and is idempotent per id", async () => {
    const { q } = setup();
    let n = 0;
    q.register("x", async () => void n++);
    expect(q.enqueue("x", {}, { id: "a" })).toBe(true);
    expect(q.enqueue("x", {}, { id: "a" })).toBe(false);
    await q.processDue();
    await q.processDue();
    expect(n).toBe(1);
  });
  it("retries with backoff then succeeds", async () => {
    const { q, runs, advance } = setup();
    let calls = 0;
    q.register("flaky", async () => { if (++calls < 3) throw new Error("nope"); });
    q.enqueue("flaky", {}, { id: "f" });
    await q.processDue();
    expect((await q.processDue()).ran).toBe(0); // still backing off
    advance(100);
    await q.processDue();
    advance(200);
    await q.processDue();
    expect(calls).toBe(3);
    expect(runs.map((r) => r.status)).toEqual(["retrying", "retrying", "succeeded"]);
  });
  it("dead-letters after max attempts", async () => {
    const { q, advance } = setup({ maxAttempts: 2 });
    q.register("bad", async () => { throw new Error("x"); });
    q.enqueue("bad", {}, { id: "b" });
    await q.processDue();
    advance(100);
    const r = await q.processDue();
    expect(r.dead).toBe(1);
    expect(q.dead).toHaveLength(1);
    expect(q.stats().pending).toBe(0);
  });
  it("dead-letters jobs with no handler instead of crashing", async () => {
    const { q } = setup({ maxAttempts: 1 });
    q.enqueue("ghost", {}, { id: "g" });
    expect((await q.processDue()).dead).toBe(1);
  });
});
