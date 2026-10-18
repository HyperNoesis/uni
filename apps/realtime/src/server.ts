import { createServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { ClientMessage, CAMPUSES, AvatarSchema, CampusId, WORLD, type ServerMessage } from "@campus/domain";
import { consoleSink, createTracker } from "@campus/analytics";
import { verifyToken } from "@campus/domain/token";
import { createLogger, parseLogLevel } from "@campus/domain/logging";
import { Room, type Conn } from "./room";

const log = createLogger({ service: "realtime", level: parseLogLevel(process.env.LOG_LEVEL) });

const sessionSecret = process.env.SESSION_SECRET ?? "dev-only-secret";
const internalSecret = process.env.INTERNAL_SECRET ?? "dev-only-internal";
const apiUrl = process.env.API_INTERNAL_URL ?? `http://localhost:${process.env.API_PORT ?? 4000}`;
const port = Number(process.env.REALTIME_PORT ?? 4001);
const allowedOrigin = process.env.API_ORIGIN ?? "http://localhost:3000";

if (process.env.NODE_ENV === "production" && (sessionSecret === "dev-only-secret" || internalSecret === "dev-only-internal")) {
  throw new Error("SESSION_SECRET and INTERNAL_SECRET must be set in production");
}

async function fetchProfile(token: string) {
  const res = await fetch(`${apiUrl}/api/v1/me`, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  return ((await res.json()) as { profile: { id: string; displayName: string; campus: unknown; avatar: unknown } }).profile;
}

function attestProximity(playerId: string, pointId: string) {
  fetch(`${apiUrl}/internal/proximity-grant`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-internal-secret": internalSecret },
    body: JSON.stringify({ playerId, pointId }),
  }).catch((e) => log.error("proximity attest failed", { error: e }));
}

const internalHeaders = { "content-type": "application/json", "x-internal-secret": internalSecret };
async function fetchBlockPeers(playerId: string): Promise<string[]> {
  try {
    const res = await fetch(`${apiUrl}/internal/blocks/${encodeURIComponent(playerId)}`, { headers: internalHeaders });
    return res.ok ? ((await res.json()) as { peers: string[] }).peers : [];
  } catch (e) { log.warn("block lookup failed; joining without block list", { playerId, error: e }); return []; }
}
const setPresence = (playerId: string, online: boolean) => {
  fetch(`${apiUrl}/internal/presence`, { method: "POST", headers: internalHeaders, body: JSON.stringify({ playerId, online }) }).catch(() => { /* presence is best effort */ });
};

const track = (playerId: string, event: "zone_joined" | "websocket_disconnect", props: Record<string, string | number> = {}) => {
  if (process.env.ANALYTICS !== "console") return;
  try { createTracker({ sink: consoleSink, sessionId: playerId }).track(event, props); } catch { /* analytics must never break the game loop */ }
};

// Rooms are capped; overflow players are placed into a new instance.
const rooms: Room[] = [];
const roomOf = new Map<string, Room>(); // playerId -> room
let draining = false;
/** Developer diagnostics (no personal data): why connections end, what we refused. */
const counters = { connectionsOpened: 0, helloRejected: 0, rateLimited: 0, badMessages: 0, disconnectCodes: {} as Record<string, number>, startedAt: Date.now() };

function newRoom(): Room {
  const r: Room = new Room({
    onProximity: attestProximity,
    onZone: (id, zone) => track(id, "zone_joined", { zone }),
    onLeave: (id) => { roomOf.delete(id); pruneRooms(); },
    onAbuse: (id, kind, detail) => log[kind === "kick" ? "error" : "warn"](`movement abuse: ${kind}`, { playerId: id, ...detail }),
  });
  rooms.push(r);
  return r;
}
/** Drops empty overflow instances (always keeps the first one) so idle capacity is released. */
function pruneRooms(): void {
  for (let i = rooms.length - 1; i > 0; i--) if (rooms[i]!.roomEmpty) rooms.splice(i, 1);
}

function pickRoom(playerId: string): Room {
  const existing = roomOf.get(playerId);
  if (existing && rooms.includes(existing)) return existing;
  return rooms.find((x) => !x.isFull) ?? newRoom();
}
newRoom();

const http = createServer((req, res) => {
  if (req.url === "/healthz") {
    res.writeHead(200, { "content-type": "application/json" });
    return void res.end(JSON.stringify({ ok: true, draining, rooms: rooms.length, players: rooms.reduce((n, r) => n + r.population, 0) }));
  }
  // Developer-only: protected by the internal secret; aggregate counters only, no player data.
  if (req.url === "/metrics") {
    if (req.headers["x-internal-secret"] !== internalSecret) return void res.writeHead(403).end();
    res.writeHead(200, { "content-type": "application/json" });
    return void res.end(JSON.stringify({ uptimeS: Math.round((Date.now() - counters.startedAt) / 1000), draining, ...counters, rooms: rooms.map((r) => r.stats()) }));
  }
  if (req.url === "/readyz") {
    res.writeHead(draining ? 503 : 200);
    return void res.end();
  }
  // Internal: the API pushes block changes so suppression is immediate, not next-login.
  if (req.method === "POST" && req.url === "/internal/blocks") {
    if (req.headers["x-internal-secret"] !== internalSecret) return void res.writeHead(403).end();
    let body = "";
    req.on("data", (d: Buffer) => { body += d; if (body.length > 1024) req.destroy(); });
    req.on("end", () => {
      try {
        const m = JSON.parse(body) as { a?: unknown; b?: unknown; blocked?: unknown };
        if (typeof m.a !== "string" || typeof m.b !== "string" || typeof m.blocked !== "boolean") return void res.writeHead(400).end();
        for (const r of rooms) r.setBlockedPair(m.a, m.b, m.blocked);
        res.writeHead(200).end();
      } catch { res.writeHead(400).end(); }
    });
    return;
  }
  res.writeHead(404).end();
});

const wss = new WebSocketServer({
  server: http,
  maxPayload: 2048,
  verifyClient: ({ origin }, cb) => cb(!origin || origin === allowedOrigin, 403, "bad origin"),
});

wss.on("connection", (ws: WebSocket) => {
  counters.connectionsOpened++;
  let playerId: string | null = null;
  let helloing = false; // a second hello while the first is still authenticating must not create a second join
  let room: Room | null = null;

  const conn: Conn = {
    send: (m: ServerMessage) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m));
    },
    close: () => ws.close(),
  };

  // Liveness: mobile networks drop silently, so ping and terminate connections that stop answering.
  let alive = true;
  ws.on("pong", () => { alive = true; });
  const heartbeat = setInterval(() => { if (!alive) return ws.terminate(); alive = false; ws.ping(); }, 15_000);

  const helloTimer = setTimeout(() => ws.close(4001, "hello timeout"), 5000);

  ws.on("message", async (raw) => {
    let parsed;
    try {
      parsed = ClientMessage.safeParse(JSON.parse(raw.toString()));
    } catch {
      counters.badMessages++;
      return conn.send({ t: "error", code: "bad_json", message: "Malformed message" });
    }
    if (!parsed.success) { counters.badMessages++; return conn.send({ t: "error", code: "bad_message", message: "Invalid message" }); }
    const msg = parsed.data;

    if (msg.t === "hello") {
      if (playerId || helloing || draining) return;
      helloing = true;
      const claims = verifyToken(msg.token, sessionSecret);
      if (!claims) {
        counters.helloRejected++;
        conn.send({ t: "error", code: "unauthorized", message: "Invalid session" });
        return ws.close(4003);
      }
      const profile = await fetchProfile(msg.token);
      const campus = CampusId.safeParse(profile?.campus);
      const avatar = AvatarSchema.safeParse(profile?.avatar);
      if (!profile || !campus.success || !avatar.success || !(campus.data in CAMPUSES)) {
        counters.helloRejected++;
        conn.send({ t: "error", code: "unauthorized", message: "Unknown player" });
        return ws.close(4003);
      }
      clearTimeout(helloTimer);
      playerId = profile.id;
      const peers = await fetchBlockPeers(playerId);
      room = pickRoom(playerId);
      roomOf.set(playerId, room);
      room.setBlocks(playerId, peers);
      setPresence(playerId, true);
      room.join({ id: playerId, name: profile.displayName, campus: campus.data, avatar: avatar.data }, conn, msg.reconnectToken);
      return;
    }

    if (!playerId || !room) return;
    if (!room.allow(playerId)) {
      counters.rateLimited++;
      conn.send({ t: "error", code: "rate_limited", message: "Slow down" });
      return;
    }
    switch (msg.t) {
      case "input": return room.input(playerId, msg.seq, msg.x, msg.y);
      case "emote": return room.emote(playerId, msg.emote);
      case "interact": return room.interact(playerId, msg.pointId);
      case "gate_pass": return room.gatePass(playerId);
      case "ping": return conn.send({ t: "pong", ts: msg.ts, serverTime: Date.now() });
    }
  });

  ws.on("close", (code) => {
    clearTimeout(helloTimer);
    clearInterval(heartbeat);
    counters.disconnectCodes[String(code)] = (counters.disconnectCodes[String(code)] ?? 0) + 1;
    if (playerId) track(playerId, "websocket_disconnect", { code });
    if (playerId && room && room.disconnect(playerId, conn)) setPresence(playerId, false);
  });
  ws.on("error", () => ws.close());
});

const interval = setInterval(() => {
  for (const r of rooms) r.tick();
}, Math.round(1000 / WORLD.snapshotHz));

http.listen(port, () => log.info("listening", { port }));

// Graceful drain: stop accepting joins, tell clients to reconnect elsewhere, then exit.
function shutdown() {
  draining = true;
  clearInterval(interval);
  for (const c of wss.clients) c.close(1012, "server restarting");
  setTimeout(() => process.exit(0), 1500);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

process.on("unhandledRejection", (e) => log.error("unhandledRejection", { error: e }));
process.on("uncaughtException", (e) => { log.error("uncaughtException", { error: e }); process.exit(1); });
