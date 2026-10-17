// First-playable-loop persistence: session -> walk to board (server proximity) -> reaction run -> verified reward -> API restart -> same progress.
// (runs node directly with --import tsx so killing the child really frees the port)
// Spawns its own api + realtime on :4100/:4101 with a temp DATA_DIR. Checks graceful stop (SIGTERM) and hard kill (SIGKILL after the debounce window).
// Usage: node tests/e2e/persistence-loop.mjs   (pnpm e2e:persistence)
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import WebSocket from "ws";

const root = path.resolve(new URL("../..", import.meta.url).pathname);
const dir = mkdtempSync(path.join(tmpdir(), "campus-persist-"));
const P = { api: 4100, rt: 4101 };
const API = `http://localhost:${P.api}`, WS = `ws://localhost:${P.rt}`;
const env = { ...process.env, DATA_DIR: dir, SESSION_SECRET: "persist-test-session-secret-0123456789", INTERNAL_SECRET: "persist-test-internal-secret-0123456789", API_PORT: String(P.api), REALTIME_PORT: String(P.rt), API_INTERNAL_URL: API, API_ORIGIN: "http://localhost:3000", LOG_LEVEL: "warn" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const assert = (c, m) => { if (!c) { console.error("FAIL:", m); cleanup(); process.exit(1); } else console.log("ok  :", m); };
const procs = {};
const start = (name, app, extra = {}) => { const p = spawn(process.execPath, ["--import", "tsx", "src/server.ts"], { cwd: path.join(root, `apps/${app}`), env: { ...env, ...extra }, stdio: ["ignore", "ignore", "inherit"] }); procs[name] = p; return p; };
const stop = (name, sig) => new Promise((res) => { const p = procs[name]; if (!p || p.exitCode !== null) return res(); p.once("exit", res); p.kill(sig); });
const cleanup = () => { for (const p of Object.values(procs)) try { p.kill("SIGKILL"); } catch {} try { rmSync(dir, { recursive: true, force: true }); } catch {} };
const waitUp = async (url) => { for (let i = 0; i < 80; i++) { try { if ((await fetch(url)).ok) return; } catch {} await sleep(250); } assert(false, `${url} did not come up`); };
const req = (method, p, body, token, extra = {}) => fetch(API + p, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));

start("api", "api"); await waitUp(`${API}/healthz`);
start("rt", "realtime"); await waitUp(`http://localhost:${P.rt}/healthz`);

const avatar = { skin: "#b97a4f", outfit: "#2f6bff", hair: "afro", hairColor: "#1a1210", top: "tee", accessory: "none" };
const s = await req("POST", "/api/v1/auth/session", { displayName: "PersistTest", campus: "lagoon_tech", avatar });
assert(s.status === 201, "session created");
const token = s.body.token, startCoins = s.body.profile.coins;

const sock = new WebSocket(WS, { headers: { origin: "http://localhost:3000" } }); const msgs = [];
sock.on("message", (d) => msgs.push(JSON.parse(d.toString()))); await new Promise((r) => sock.on("open", r));
sock.send(JSON.stringify({ t: "hello", token })); await sleep(700);
const w = msgs.find((m) => m.t === "welcome"); assert(w, "joined the world");
let seq = 1, x = w.x, y = w.y;
while (Math.hypot(60 - x, 55 - y) > 1.2) { const d = Math.hypot(60 - x, 55 - y), st = Math.min(d, .25); x += ((60 - x) / d) * st; y += ((55 - y) / d) * st; sock.send(JSON.stringify({ t: "input", seq: seq++, x, y })); await sleep(50); }
await sleep(200); sock.send(JSON.stringify({ t: "interact", pointId: "commons_board" })); await sleep(500);
assert(msgs.some((m) => m.t === "interaction" && m.ok), "server accepted proximity interaction");
const run = await req("POST", "/api/v1/activities/reaction/start", null, token); assert(run.status === 200, "activity started");
await sleep(run.body.delayMs + 250);
const done = await req("POST", "/api/v1/activities/reaction/complete", { runId: run.body.runId }, token, { "idempotency-key": "persist-key-0001" });
assert(done.status === 200 && done.body.rewardCoins > 0, `reward granted (${done.body.rewardCoins} coins)`);
sock.close();
const snap = async () => { const r = await req("GET", "/api/v1/profile", null, token); return { status: r.status, ...(r.body.profile ?? {}), ach: (r.body.achievements ?? []).length }; };
const before = await snap();
assert(before.coins >= startCoins + done.body.rewardCoins, "coins include the reward before restart (achievement bonuses may add more)");

// 1) graceful stop (SIGTERM flushes) then restart
await stop("api", "SIGTERM"); start("api", "api"); await waitUp(`${API}/healthz`);
const after1 = await snap();
assert(after1.status === 200 && after1.coins === before.coins && after1.reputation === before.reputation && after1.ach === before.ach, "progress survives graceful restart (same token, same coins)");
const replay = await req("POST", "/api/v1/activities/reaction/complete", { runId: run.body.runId }, token, { "idempotency-key": "persist-key-0001" });
assert(replay.status === 200 && replay.body.rewardCoins === done.body.rewardCoins, "idempotent replay still answers after restart");
const after1b = await snap();
assert(after1b.coins === before.coins, "replay after restart did NOT grant again");

// 2) hard kill after the debounce window (no flush hook): last durable state must still be there
await sleep(3000); await stop("api", "SIGKILL"); start("api", "api"); await waitUp(`${API}/healthz`);
const after2 = await snap();
assert(after2.status === 200 && after2.coins === before.coins && after2.reputation === before.reputation, "progress survives hard kill");

cleanup(); console.log("PERSISTENCE LOOP PASSED"); process.exit(0);
