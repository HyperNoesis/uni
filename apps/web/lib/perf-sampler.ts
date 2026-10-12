/* Frame-time evidence + safe quality governor. Pure (no DOM), unit-tested. */
export interface PerfReport {
  samples: number; seconds: number; fpsAvg: number; p50Ms: number; p95Ms: number; p99Ms: number; maxMs: number;
  over16Pct: number; over33Pct: number; over50Pct: number;
}
export function percentile(sorted: readonly number[], p: number): number {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i]!;
}
export function summarize(frameMs: readonly number[]): PerfReport {
  const ms = frameMs.filter((v) => Number.isFinite(v) && v > 0 && v < 5000);
  const n = ms.length, total = ms.reduce((a, b) => a + b, 0), s = [...ms].sort((a, b) => a - b);
  const pct = (th: number) => (n ? Math.round((ms.filter((v) => v > th).length / n) * 1000) / 10 : 0);
  const r1 = (v: number) => Math.round(v * 10) / 10;
  return { samples: n, seconds: r1(total / 1000), fpsAvg: total ? r1((n * 1000) / total) : 0, p50Ms: r1(percentile(s, 50)), p95Ms: r1(percentile(s, 95)),
    p99Ms: r1(percentile(s, 99)), maxMs: r1(s[n - 1] ?? 0), over16Pct: pct(16.7), over33Pct: pct(33.3), over50Pct: pct(50) };
}

/** Records frame times for a fixed window (default 60 s) so a repeatable route yields p50/p95 numbers. */
export class FrameSampler {
  private ms: number[] = []; private startedAt = 0; private on = false;
  constructor(private readonly windowMs = 60_000) {}
  get recording() { return this.on; }
  start(now: number) { this.ms = []; this.startedAt = now; this.on = true; }
  elapsed(now: number) { return this.on ? now - this.startedAt : 0; }
  /** Adds a frame; returns the final report once the window is complete (and stops). */
  push(frameMs: number, now: number): PerfReport | null { if (!this.on) return null; this.ms.push(frameMs); return now - this.startedAt >= this.windowMs ? this.stop() : null; }
  stop(): PerfReport | null { if (!this.on) return null; this.on = false; return summarize(this.ms); }
}

/** Upgrades quality only after sustained headroom and never after a downgrade burst (prevents flapping). */
export class QualityGovernor {
  private calm = 0; private downgrades = 0; private lastDownAt = -Infinity;
  constructor(private readonly needWindows = 10, private readonly headroom = 0.55, private readonly cooldownMs = 120_000, private readonly maxDowngrades = 2) {}
  noteDowngrade(now: number) { this.downgrades++; this.lastDownAt = now; this.calm = 0; }
  /** avgMs: mean frame time for the last 1 s window; nextBudgetMs: frame budget of the next-higher level. */
  observe(avgMs: number, nextBudgetMs: number, now: number): boolean {
    if (this.downgrades >= this.maxDowngrades || now - this.lastDownAt < this.cooldownMs) { this.calm = 0; return false; }
    this.calm = avgMs > 0 && avgMs <= nextBudgetMs * this.headroom ? this.calm + 1 : 0;
    if (this.calm >= this.needWindows) { this.calm = 0; return true; }
    return false;
  }
}
