/* Nigeria (Africa/Lagos, WAT = UTC+1, no daylight saving) sky clock. Pure and dependency-free so it is unit-testable.
 *
 * The world follows the real Lagos sun: when it is night in Nigeria it is night in CAMPUS. We compute the solar
 * elevation for Lagos (6.45 N, 3.40 E) from the date + time, then map it to the renderer's `night` blend (0 = full day,
 * 1 = full night) and a `warmth` value (golden-hour tint, strongest when the sun is near the horizon).
 *
 *   night  : 0 above +4 deg elevation, ramps to 1 at -9 deg (civil + nautical twilight, ~45 min in the tropics)
 *   warmth : peaks as the sun crosses the horizon, fades out by +22 deg above / -6 deg below
 *
 * Nothing here touches gameplay or the server; it only picks lighting.
 */
export const LAGOS = { lat: 6.45, lon: 3.4, utcOffsetHours: 1 } as const;

export type SkyPhase = "night" | "dawn" | "day" | "dusk";
export interface LagosSky {
  /** Lagos wall-clock hour 0-23 and minute 0-59. */
  hour: number; minute: number;
  /** "HH:MM" in Lagos time. */
  clock: string;
  /** Solar elevation in degrees (negative = below horizon). */
  elevation: number;
  /** Renderer night blend 0..1. */
  night: number;
  /** Golden-hour warmth 0..1. */
  warmth: number;
  phase: SkyPhase;
  /** Human label: "Daylight", "Golden hour", "Dusk", "Night", "Dawn". */
  label: string;
  /** Plain greeting keyed to Lagos hour. */
  greeting: string;
}

const RAD = Math.PI / 180;
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Lagos wall-clock parts for an instant. Uses Intl when available, otherwise plain UTC+1 arithmetic (identical: Lagos has no DST). */
export function lagosParts(date: Date): { hour: number; minute: number; second: number; dayOfYear: number } {
  const t = date.getTime() + LAGOS.utcOffsetHours * 3600_000;
  const d = new Date(t); // read the shifted instant through UTC getters = Lagos wall clock
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  const dayOfYear = Math.floor((t - start) / 86400_000);
  return { hour: d.getUTCHours(), minute: d.getUTCMinutes(), second: d.getUTCSeconds(), dayOfYear };
}

/** Solar elevation (deg) at Lagos for an instant. Spencer/NOAA low-precision series: good to well under a degree, plenty for lighting. */
export function solarElevation(date: Date): number {
  const p = lagosParts(date);
  const g = (2 * Math.PI / 365) * (p.dayOfYear - 1 + (p.hour - 12) / 24);
  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g)); // minutes
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const minutes = p.hour * 60 + p.minute + p.second / 60;
  const trueSolar = (minutes + eqTime + 4 * LAGOS.lon - 60 * LAGOS.utcOffsetHours + 1440) % 1440;
  const ha = (trueSolar / 4 - 180) * RAD;
  const lat = LAGOS.lat * RAD;
  const sinEl = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(ha);
  return Math.asin(Math.max(-1, Math.min(1, sinEl))) / RAD;
}

export function greetingFor(hour: number): string {
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  if (hour >= 17 && hour < 22) return "Good evening";
  return "Late night";
}

export function lagosSky(date: Date = new Date()): LagosSky {
  const p = lagosParts(date), el = solarElevation(date);
  const night = 1 - smooth(-9, 4, el);
  const warmth = smooth(-6, 2, el) * (1 - smooth(8, 22, el)) ;
  const morning = p.hour < 12;
  const phase: SkyPhase = night > 0.9 ? "night" : night > 0.04 ? (morning ? "dawn" : "dusk") : "day";
  const label = phase === "night" ? "Night" : phase === "dawn" ? "Dawn" : phase === "dusk" ? "Dusk" : warmth > 0.35 ? "Golden hour" : "Daylight";
  return { hour: p.hour, minute: p.minute, clock: `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`, elevation: el, night, warmth, phase, label, greeting: greetingFor(p.hour) };
}
