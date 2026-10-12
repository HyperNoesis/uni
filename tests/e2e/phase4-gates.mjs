// Phase 4 server-authority gates over a real WebSocket (needs api :4000 + realtime :4001, like two-clients.mjs).
// Covers: speed-hack burst, duplicate hello, ghost cleanup, invalid payloads, out-of-range interaction, /metrics.
import WebSocket from "ws";

const API = process.env.API ?? "http://localhost:4000";
const WS = process.env.WS ?? "ws://localhost:4001";
const RT = process.env.RT ?? "http://localhost:4001";
const ORIGIN = process.env.ORIGIN ?? "http://localhost:3000";
const INTERNAL = process.env.INTERNAL_SECRET ?? "dev-only-internal";
const MAX_SPEED = 6, TOL = 1.35; // packages/domain/src/world-data/world.json
const avatar = { skin: "#f1d3b5", outfit: "#2f6bff", hair: "short", hairColor: "#1a1210", top: "tee", accessory: "none" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (c, m) => { console.log(c ? "ok  :" : "FAIL:", m); if (!c) failed++; };

async function session(name) {
  const r = await fetch(`${API}/api/v1/auth/session`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ displayName: name, campus: "unity_heights", avatar }) });
  const b = await r.json();
  return { token: b.token, id: b.profile.id };
}
async function connect(token, { hellos = 1 } = {}) {
  const sock = new WebSocket(WS, { headers: { origin: ORIGIN } });
  const c = { sock, msgs: [], closed: null, send: (m) => sock.send(JSON.stringify(m)) };
  sock.on("message", (d) => c.msgs.push(JSON.parse(d.toString())));
  sock.on("close", (code) => { c.closed = code; });
  await new Promise((res, rej) => { sock.on("open", res); sock.on("error", rej); });
  for (let i = 0; i < hellos; i++) c.send({ t: "hello", token });
  await sleep(600);
  c.welcome = c.msgs.find((m) => m.t === "welcome");
  return c;
}
const metrics = async () => (await fetch(`${RT}/metrics`, { headers: { "x-internal-secret": INTERNAL } })).json();

// 1. speed-hack burst: 40 inputs in ~1s, each claiming 0.05s of max-speed travel. Honest limit ~8.1u/s.
{
  const u = await session("Speedy"); const c = await connect(u.token);
  const x0 = c.welcome.x, y0 = c.welcome.y;
  const step = MAX_SPEED * TOL * 0.05;
  let seq = 0, x = x0;
  const t0 = Date.now();
  for (let i = 0; i < 40; i++) { x -= step; c.send({ t: "input", seq: ++seq, x, y: y0 }); await sleep(25); }
  const elapsed = (Date.now() - t0) / 1000;
  await sleep(300);
  const last = [...c.msgs].reverse().find((m) => m.t === "correct");
  const finalX = last ? last.x : x;
  const moved = Math.abs(finalX - x0);
  check(c.msgs.some((m) => m.t === "correct"), "flooded movement is corrected by the server");
  check(moved <= MAX_SPEED * TOL * (elapsed + 0.6), `server-accepted travel ${moved.toFixed(2)}u within ${(MAX_SPEED * TOL * (elapsed + 0.6)).toFixed(2)}u allowance over ${elapsed.toFixed(2)}s`);
  c.sock.close();
}

// 2. duplicate hello on one socket must not create two players
{
  const u = await session("Doubler"); const c = await connect(u.token, { hellos: 3 });
  check(c.msgs.filter((m) => m.t === "welcome").length === 1, "three concurrent hellos yield exactly one welcome");
  c.sock.close();
}

// 3. ghost cleanup: when a client vanishes the other client is told it is gone
{
  const A = await session("GhostA"), B = await session("GhostB");
  const a = await connect(A.token), b = await connect(B.token);
  await sleep(500);
  check(a.msgs.some((m) => m.t === "snapshot" && m.players.some((p) => p.id === B.id)), "A sees B");
  b.sock.terminate();
  await sleep(1200);
  check(a.msgs.some((m) => m.t === "snapshot" && m.gone.includes(B.id)), "A is told B is gone after B drops (no ghost avatar)");
  a.sock.close();
}

// 4. invalid payloads are rejected, never crash the room
{
  const u = await session("Fuzzer"); const c = await connect(u.token);
  c.sock.send("not json");
  c.send({ t: "input", seq: -1, x: "a", y: 0 });
  c.send({ t: "emote", emote: "rm -rf" });
  c.send({ t: "input", seq: 1, x: null, y: 0 });
  c.send({ t: "interact", pointId: "x".repeat(500) });
  await sleep(400);
  const errs = c.msgs.filter((m) => m.t === "error").map((m) => m.code);
  check(errs.includes("bad_json") && errs.filter((e) => e === "bad_message").length >= 3, `malformed/forbidden messages rejected (${errs.join(",")})`);
  c.sock.send("y".repeat(5000)); // over maxPayload 2048
  await sleep(400);
  check(c.closed !== null, "oversize frame closes the connection");
  const h = await (await fetch(`${RT}/healthz`)).json();
  check(h.ok === true, "server still healthy after fuzzing");
}

// 5. out-of-range interaction is refused by the server
{
  const u = await session("Faraway"); const c = await connect(u.token);
  c.send({ t: "interact", pointId: "commons_board" });
  await sleep(400);
  const r = c.msgs.find((m) => m.t === "interaction");
  check(r && (r.ok === false || r.reason), `interaction result from server: ${JSON.stringify(r)}`);
  c.sock.close();
}

// 6. diagnostics endpoint: protected, aggregate only
{
  const denied = await fetch(`${RT}/metrics`);
  check(denied.status === 403, "/metrics requires the internal secret");
  const m = await metrics();
  const body = JSON.stringify(m);
  check(m.rooms?.length >= 1 && typeof m.rooms[0].maxTickMs === "number", "metrics expose room count and tick timing");
  check(m.rateLimited >= 0 && m.badMessages >= 3 && Object.keys(m.disconnectCodes).length >= 1, `metrics expose rejects (${m.badMessages} bad) and disconnect reasons ${JSON.stringify(m.disconnectCodes)}`);
  check(!/Speedy|Ghost|Fuzzer|Doubler/.test(body), "metrics contain no player names");
}

console.log(failed ? `${failed} phase-4 gate check(s) FAILED` : "phase-4 gates passed");
process.exit(failed ? 1 : 0);
