// Client-side helpers. The server stays authoritative: these only smooth what the server already decided.
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * Math.max(0, Math.min(1, t));

export interface Sample { t: number; x: number; y: number }

/** Keeps a short history of server snapshots and samples a position slightly in the past. */
export class SnapshotBuffer {
  private samples: Sample[] = [];
  constructor(private maxSamples = 8) {}
  push(s: Sample): void {
    this.samples.push(s);
    this.samples.sort((a, b) => a.t - b.t);
    if (this.samples.length > this.maxSamples) this.samples.shift();
  }
  sample(renderTime: number): { x: number; y: number } | null {
    const s = this.samples;
    if (s.length === 0) return null;
    const first = s[0]!;
    const last = s[s.length - 1]!;
    if (renderTime <= first.t) return { x: first.x, y: first.y };
    if (renderTime >= last.t) return { x: last.x, y: last.y };
    for (let i = 1; i < s.length; i++) {
      const b = s[i]!;
      if (renderTime <= b.t) {
        const a = s[i - 1]!;
        const k = (renderTime - a.t) / (b.t - a.t || 1);
        return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) };
      }
    }
    return { x: last.x, y: last.y };
  }
}

/** Snap to the server position when the prediction drifted past `snapDistance`, otherwise blend toward it. */
export function reconcile(predicted: { x: number; y: number }, authoritative: { x: number; y: number }, snapDistance = 2, blend = 0.2) {
  const d = Math.hypot(predicted.x - authoritative.x, predicted.y - authoritative.y);
  if (d >= snapDistance) return { x: authoritative.x, y: authoritative.y, snapped: true };
  return { x: lerp(predicted.x, authoritative.x, blend), y: lerp(predicted.y, authoritative.y, blend), snapped: false };
}
