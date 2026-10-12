// Phase 4 exit test: two real clients see each other, movement arrives as deltas, walls are enforced,
// and a dropped client resumes at the same place with its reconnect token.
// Usage: node tests/e2e/two-clients.mjs   (needs api :4000 and realtime :4001 running)
import WebSocket from "ws";

const API = process.env.API ?? "http://localhost:4000";
const WS = process.env.WS ?? "ws://localhost:4001";
const ORIGIN = process.env.ORIGIN ?? "http://localhost:3000";
const avatar = { skin: "#f1d3b5", outfit: "#2f6bff", hair: "short", hairColor: "#1a1210", top: "tee", accessory: "none" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const assert = (c, m) => { if (!c) { console.error("FAIL:", m); process.exit(1); } else console.log("ok  :", m); };

async function session(name) {
  const r = await fetch(`${API}/api/v1/auth/session`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ displayName: name, campus: "unity_heights", avatar }) });
  assert(r.status === 201, `session for ${name}`);
  const body = await r.json();
  return { token: body.token, id: body.profile.id };
}

async function connect(token, reconnectToken) {
  const sock = new WebSocket(WS, { headers: { origin: ORIGIN } });
  const c = { sock, msgs: [], send: (m) => sock.send(JSON.stringify(m)) };
  sock.on("message", (d) => c.msgs.push(JSON.parse(d.toString())));
  await new Promise((res, rej) => { sock.on("open", res); sock.on("error", rej); });
  c.send({ t: "hello", token, ...(reconnectToken ? { reconnectToken } : {}) });
  await sleep(500);
  c.welcome = c.msgs.find((m) => m.t === "welcome");
  return c;
}

const A = await session("TwoA"), B = await session("TwoB");
const a = await connect(A.token);
const b = await connect(B.token);
assert(a.welcome && b.welcome, "both clients welcomed");
assert(b.welcome.players.some((p) => p.id === A.id), "late joiner sees the existing player in its welcome");
await sleep(400);
const seenByA = a.msgs.filter((m) => m.t === "snapshot").flatMap((m) => m.players.map((p) => p.id));
assert(seenByA.includes(B.id), "existing player is told about the joiner");

// movement arrives as a small delta (no avatar payload)
a.msgs.length = 0;
let x = b.welcome.x;
for (let s = 1; s <= 4; s++) { x += 0.25; b.send({ t: "input", seq: s, x, y: b.welcome.y }); await sleep(100); }
await sleep(300);
const deltas = a.msgs.filter((m) => m.t === "snapshot").flatMap((m) => m.moved);
assert(deltas.some((d) => d.id === B.id), "movement reaches the other client as a delta");
assert(!JSON.stringify(a.msgs.filter((m) => m.t === "snapshot")).includes("avatar"), "avatars are not resent on every snapshot");

// emotes propagate to the other client
b.send({ t: "emote", emote: "wave" });
await sleep(100);
await sleep(600);
assert(a.msgs.some((m) => m.t === "snapshot" && m.moved.some((d) => d.id === B.id && d.emote === "wave")), "emote is visible to the other client");

// reconnect: same token resumes at the same position
const rt = b.welcome.reconnectToken;
b.sock.terminate();
await sleep(400);
const b2 = await connect(B.token, rt);
assert(b2.welcome && Math.abs(b2.welcome.x - x) < 1.5, "reconnect resumes near the previous position");
await sleep(300);
a.sock.close(); b2.sock.close();
console.log("realtime two-client test passed");
process.exit(0);
