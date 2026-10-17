// Lagos sky clock: UTC+1 wall clock, day at noon, night at midnight, ramps monotonic through dusk.
import assert from "node:assert/strict";
import { lagosSky, lagosParts, solarElevation } from "../../apps/web/lib/lagos-time.ts";
const at = (h, m = 0) => new Date(Date.UTC(2026, 9, 17, h - 1, m)); // h = Lagos wall clock (UTC+1)
assert.equal(lagosParts(at(14, 30)).hour, 14, "UTC+1 wall clock");
assert.equal(lagosSky(at(14, 30)).clock, "14:30");
const noon = lagosSky(at(12)), mid = lagosSky(at(0));
assert.ok(noon.night === 0 && noon.phase === "day", "noon is day");
assert.ok(mid.night === 1 && mid.phase === "night", "midnight is night");
assert.ok(solarElevation(at(12)) > 60, "tropical noon sun is high");
let prev = -1;
for (let m = 17 * 60; m <= 20 * 60; m += 10) { const s = lagosSky(at(Math.floor(m / 60), m % 60)); assert.ok(s.night >= prev - 1e-9, "night blend non-decreasing through dusk"); assert.ok(s.night >= 0 && s.night <= 1 && s.warmth >= 0 && s.warmth <= 1); prev = s.night; }
assert.ok(lagosSky(at(18, 40)).warmth > lagosSky(at(12)).warmth, "golden hour warmer than noon");
for (let h = 0; h < 24; h++) assert.ok(lagosSky(at(h)).greeting.length > 0 && lagosSky(at(h)).label.length > 0);
console.log("lagos-time ok");
