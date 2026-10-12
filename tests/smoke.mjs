// End-to-end smoke test against running API (:4000) and realtime (:4001).
// Usage: node tests/smoke.mjs
import WebSocket from "ws";

const API = process.env.API ?? "http://localhost:4000";
const WS = process.env.WS ?? "ws://localhost:4001";
const avatar = { skin: "#f1d3b5", outfit: "#2f6bff", hair: "short", accessory: "none" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const assert = (c, m) => { if (!c) { console.error("FAIL:", m); process.exit(1); } else console.log("ok  :", m); };

const post = (path, body, token, extra = {}) =>
  fetch(API + path, { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra }, body: body ? JSON.stringify(body) : undefined })
    .then(async (r) => ({ status: r.status, body: await r.json() }));

const s = await post("/api/v1/auth/session", { displayName: "Smoke", campus: "lagoon_tech", avatar });
assert(s.status === 201 && s.body.profile.coins === 50, "session created with starter coins");
const token = s.body.token;

const sock = new WebSocket(WS, { headers: { origin: "http://localhost:3000" } });
const msgs = [];
sock.on("message", (d) => msgs.push(JSON.parse(d.toString())));
await new Promise((r) => sock.on("open", r));
sock.send(JSON.stringify({ t: "hello", token }));
await sleep(600);
const welcome = msgs.find((m) => m.t === "welcome");
assert(welcome, "received welcome");

// Too far from the board: interaction must be refused and no grant issued.
sock.send(JSON.stringify({ t: "interact", pointId: "commons_board" }));
await sleep(300);
assert(msgs.some((m) => m.t === "interaction" && m.ok === false && m.reason === "too_far"), "interaction refused when far");
const early = await post("/api/v1/activities/reaction/start", null, token);
assert(early.status === 403, "reaction start refused without proximity");

// Walk toward the board at legal speed; teleporting must be corrected.
sock.send(JSON.stringify({ t: "input", seq: 1, x: 60, y: 54 }));
await sleep(200);
assert(msgs.some((m) => m.t === "correct"), "teleport corrected by server");

let seq = 2;
let x = welcome.x, y = welcome.y;
while (Math.hypot(60 - x, 55 - y) > 1.2) {
  const d = Math.hypot(60 - x, 55 - y);
  const step = Math.min(d, 0.25);
  x += ((60 - x) / d) * step; y += ((55 - y) / d) * step;
  sock.send(JSON.stringify({ t: "input", seq: seq++, x, y }));
  await sleep(50);
}
await sleep(200);
sock.send(JSON.stringify({ t: "interact", pointId: "commons_board" }));
await sleep(500);
assert(msgs.some((m) => m.t === "interaction" && m.ok && m.activity === "reaction"), "interaction accepted in range");

const start = await post("/api/v1/activities/reaction/start", null, token);
assert(start.status === 200, "reaction started after proximity grant");
await sleep(start.body.delayMs + 250);
const done = await post("/api/v1/activities/reaction/complete", { runId: start.body.runId }, token, { "idempotency-key": "smoke-key-0001" });
assert(done.status === 200 && done.body.rewardCoins > 0, `rewarded ${done.body.rewardCoins} coins for ${Math.round(done.body.reactionMs)}ms`);
const replay = await post("/api/v1/activities/reaction/complete", { runId: start.body.runId }, token, { "idempotency-key": "smoke-key-0001" });
assert(JSON.stringify(replay.body) === JSON.stringify(done.body), "replay is idempotent");

sock.close();
console.log("SMOKE PASSED");
process.exit(0);
