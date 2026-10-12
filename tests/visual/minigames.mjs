import { newRhythm, rhythmHit, rhythmStep, rhythmGrade, RHYTHM, newDelivery, deliveryStep, DELIVERY } from "../../apps/web/lib/minigames.ts";
import assert from "node:assert/strict";
// Rhythm: a perfect-timing bot must get S; an idle player must get D and finish.
const bot = newRhythm(7); const dt = 1 / 120;
while (!bot.over) { rhythmStep(bot, dt); for (const n of bot.notes) if (n.state === "pending" && Math.abs(n.t - bot.time) < 0.02) rhythmHit(bot, n.lane); }
assert.equal(rhythmGrade(bot), "S"); assert.ok(bot.notes.length > 40 && bot.best > 20, `notes ${bot.notes.length} combo ${bot.best}`);
const idle = newRhythm(7); while (!idle.over) rhythmStep(idle, 1 / 60); assert.equal(rhythmGrade(idle), "D"); assert.equal(idle.miss, idle.notes.length);
// Delivery: greedy bot completes several orders; positions stay in bounds; run ends on the timer.
const d = newDelivery(3);
for (let i = 0; i < 60 * 200 && !d.over; i++) {
  const t = d.carrying ? d.customers[d.customer] : d.kitchens[d.kitchen];
  deliveryStep(d, t.x - d.x, t.y - d.y, true, 1 / 60);
  assert.ok(d.x >= 0 && d.x <= DELIVERY.w && d.y >= 0 && d.y <= DELIVERY.h && Number.isFinite(d.x + d.y));
}
assert.ok(d.over && d.delivered >= 4, `delivered ${d.delivered}`);
console.log(`minigames test passed: rhythm ${bot.notes.length} notes (bot S, idle D); delivery bot ${d.delivered} orders, score ${d.score}`);
