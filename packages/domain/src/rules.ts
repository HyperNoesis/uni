// Pure game rules. Everything here is deterministic and unit-tested; the
// API calls these with server-measured inputs only.

export const REACTION = {
  minDelayMs: 1200,
  maxDelayMs: 3200,
  /** A reaction faster than this is physically implausible; treat as early/macro. */
  humanFloorMs: 90,
  /** The server never trusts a run older than this. */
  runTtlMs: 20_000,
  cooldownMs: 4_000,
  dailyRewardCap: 15, // max rewarded runs per UTC day (lowered so reputation cannot be farmed)
} as const;

export interface RewardResult {
  coins: number;
  reputation: number;
  tooEarly: boolean;
}

/**
 * elapsedMs = serverNow - (serverStartedAt + delayMs): time the player took to
 * respond after the signal. Negative or sub-human values are rejected.
 */
export function scoreReaction(elapsedMs: number): RewardResult {
  if (!Number.isFinite(elapsedMs) || elapsedMs < REACTION.humanFloorMs) {
    return { coins: 0, reputation: 0, tooEarly: true };
  }
  if (elapsedMs <= 250) return { coins: 20, reputation: 5, tooEarly: false };
  if (elapsedMs <= 400) return { coins: 14, reputation: 3, tooEarly: false };
  if (elapsedMs <= 700) return { coins: 9, reputation: 2, tooEarly: false };
  if (elapsedMs <= 1500) return { coins: 5, reputation: 1, tooEarly: false };
  return { coins: 2, reputation: 0, tooEarly: false };
}

export const STARTER_COINS = 50;

/** Distance check used by the authoritative interaction validator. */
export function withinRange(ax: number, ay: number, bx: number, by: number, range: number): boolean {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy <= range * range;
}

/**
 * Validates a claimed position against the last authoritative position.
 * Returns the position the server should accept (either the claim or the
 * last good position) and whether a correction must be sent.
 */
export function validateMove(
  last: { x: number; y: number },
  claim: { x: number; y: number },
  dtMs: number,
  maxSpeed: number,
  tolerance: number,
  bounds: { width: number; height: number },
  blocked?: (x: number, y: number) => boolean,
  /** Minimum time credited per call. Default 50ms; the realtime room passes 0 because it meters time itself (a floor lets a client flood inputs for >max speed). */
  floorMs = 50,
): { x: number; y: number; corrected: boolean } {
  if (!Number.isFinite(claim.x) || !Number.isFinite(claim.y)) return { ...last, corrected: true };
  if (blocked?.(claim.x, claim.y)) return { ...last, corrected: true }; // never accept a position inside a wall or prop
  const dt = Math.min(Math.max(dtMs, 0), 500) / 1000; // cap so idle time cannot bank distance
  const maxDist = maxSpeed * tolerance * Math.max(dt, floorMs / 1000);
  const dx = claim.x - last.x;
  const dy = claim.y - last.y;
  const dist = Math.hypot(dx, dy);
  const inBounds = claim.x >= 0 && claim.y >= 0 && claim.x <= bounds.width && claim.y <= bounds.height;
  if (dist <= maxDist && inBounds) return { x: claim.x, y: claim.y, corrected: false };
  if (dist > maxDist) {
    // Accept partial movement toward the claim, capped at max speed.
    const k = maxDist / dist;
    const nx = Math.min(bounds.width, Math.max(0, last.x + dx * k));
    const ny = Math.min(bounds.height, Math.max(0, last.y + dy * k));
    if (blocked?.(nx, ny)) return { ...last, corrected: true };
    return { x: nx, y: ny, corrected: true };
  }
  return { ...last, corrected: true };
}
