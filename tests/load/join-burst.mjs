// Load test: N clients create sessions, join the plaza and send movement for a few seconds.
// Note: POST /auth/session is limited to 20 per minute per IP, so keep CLIENTS at or below 18 against a shared address.
// Usage: CLIENTS=15 node tests/load/join-burst.mjs   (needs api :4000 and realtime :4001 running)
import WebSocket from "ws";

const API = process.env.API ?? "http://localhost:4000";
const WS = process.env.WS ?? "ws://localhost:4001";
const N = Number(process.env.CLIENTS ?? 15);
const MAX_JOIN_MS = Number(process.env.MAX_JOIN_MS ?? 3000);
const avatar = { skin: "#f1d3b5", outfit: "#2f6bff", hair: "short", accessory: "none" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function client(i) {
  const res = await fetch(`${API}/api/v1/auth/session`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ displayName: `Load${i}`, campus: "unity_heights", avatar }) });
  if (res.status !== 201) return { ok: false, reason: `session ${res.status}` };
  const { token } = await res.json();
  const started = Date.now();
  const sock = new WebSocket(WS, { headers: { origin: process.env.ORIGIN ?? "http://localhost:3000" } });
  let welcomed = null, snapshots = 0, errors = 0, bytes = 0;
  sock.on("message", (d) => { const m = JSON.parse(d.toString()); if (m.t === "welcome") welcomed = Date.now() - started; if (m.t === "snapshot") { snapshots++; bytes += d.toString().length; } if (m.t === "error") errors++; });
  await new Promise((r, j) => { sock.on("open", r); sock.on("error", j); });
  sock.send(JSON.stringify({ t: "hello", token }));
  await sleep(100 + Math.random() * 200);
  let x = 60, y = 72;
  for (let s = 1; s <= 20; s++) { x += 0.3; sock.send(JSON.stringify({ t: "input", seq: s, x, y })); await sleep(100); }
  sock.close();
  return { ok: welcomed !== null, joinMs: welcomed, snapshots, errors, bytes };
}

const results = await Promise.all(Array.from({ length: N }, (_, i) => client(i).catch((e) => ({ ok: false, reason: String(e) }))));
const ok = results.filter((r) => r.ok);
const joins = ok.map((r) => r.joinMs).sort((a, b) => a - b);
const p95 = joins[Math.floor(joins.length * 0.95)] ?? Infinity;
console.log(JSON.stringify({ clients: N, joined: ok.length, p95JoinMs: p95, snapshotsAvg: Math.round(ok.reduce((a, r) => a + r.snapshots, 0) / (ok.length || 1)), bytesPerSnapshot: Math.round(ok.reduce((a, r) => a + (r.bytes ?? 0), 0) / Math.max(1, ok.reduce((a, r) => a + r.snapshots, 0))), errors: results.reduce((a, r) => a + (r.errors ?? 0), 0) }));
if (ok.length < N * 0.95 || p95 > MAX_JOIN_MS) { console.error("FAIL: join rate or p95 join time outside budget"); process.exit(1); }
console.log("ok  : load budget met");
