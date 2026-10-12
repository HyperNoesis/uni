// Headless sanity test for the sports engine: bounds, scoring, timers, shot odds. Run via `pnpm check:sports`.
import { newGame, step, idleInput, shotChance, COURTS } from "../../apps/web/lib/sports-game.ts";
import assert from "node:assert/strict";

for (const sport of ["football", "basketball"]) {
  let totalGoals = 0, finished = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const g = newGame(sport, seed); const c = COURTS[sport];
    for (let i = 0; i < 60 * 400 && g.phase !== "over"; i++) {
      // Scripted "human": run at the ball / hoop and charge-shoot periodically.
      const cp = g.players[g.ctrl]; const tx = g.ball.holder === g.ctrl ? c.w - 2 : g.ball.x, ty = g.ball.holder === g.ctrl ? c.h / 2 : g.ball.y;
      const inp = idleInput(); inp.mx = Math.sign(tx - cp.x) * Math.min(1, Math.abs(tx - cp.x)); inp.my = Math.sign(ty - cp.y) * Math.min(1, Math.abs(ty - cp.y)); inp.sprint = i % 200 < 100;
      if (i % 90 === 0) inp.shoot = -0.78; if (i % 211 === 0) inp.pass = true; if (i % 150 === 0) inp.action2 = true;
      step(g, inp, 1 / 60);
      for (const p of g.players) assert.ok(p.x >= 0 && p.x <= c.w && p.y >= 0 && p.y <= c.h, `player out of bounds ${sport}`);
      assert.ok(Number.isFinite(g.ball.x + g.ball.y + g.ball.z), "ball NaN");
      assert.ok(g.ball.x >= 0 && g.ball.x <= c.w && g.ball.y >= 0 && g.ball.y <= c.h, `ball out of court ${sport} ${g.ball.x},${g.ball.y}`);
    }
    if (g.phase === "over") finished++;
    totalGoals += g.score[0] + g.score[1];
  }
  assert.equal(finished, 6, `${sport}: every match must end on the timer`);
  assert.ok(totalGoals > 0, `${sport}: scoring must be possible`);
  console.log(`${sport}: 6 matches finished, ${totalGoals} total scores`);
}
const g = newGame("basketball", 3); const p = g.players[0];
p.x = 12; p.y = 6; const close = shotChance(g, p, 0.78).chance; p.x = 4; const far = shotChance(g, p, 0.78); const bad = shotChance(g, p, 0.05).chance;
assert.ok(close > far.chance && far.chance > bad && far.pts === 3, "shot odds: closer better, timing matters, 3pt beyond the arc");
console.log("sports engine test passed");
