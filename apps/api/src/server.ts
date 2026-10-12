import { consoleSink } from "@campus/analytics";
import { buildApp } from "./app";
import { FilePersistence, startPersistence, type PersistenceHandle } from "./persistence";
import { Store } from "./store";

const sessionSecret = process.env.SESSION_SECRET ?? "dev-only-secret";
const internalSecret = process.env.INTERNAL_SECRET ?? "dev-only-internal";
if (process.env.NODE_ENV === "production" && (sessionSecret === "dev-only-secret" || internalSecret === "dev-only-internal")) {
  throw new Error("SESSION_SECRET and INTERNAL_SECRET must be set in production");
}

async function main() {
  const store = new Store();
  // DATA_DIR on a persistent disk makes players, ledger, inventory and rooms survive restarts (D-016).
  const dataDir = process.env.DATA_DIR;
  let persistence: PersistenceHandle | null = null;
  const boot: { level: "info" | "warn"; msg: string; obj?: object }[] = [];
  if (dataDir) {
    const adapter = new FilePersistence(dataDir);
    const snap = await adapter.load(); // throws on unreadable data: never boot an empty world over real data
    if (snap) { store.restore(snap); boot.push({ level: "info", msg: "restored store", obj: { players: store.playerCount(), savedAt: snap.savedAt } }); }
    else boot.push({ level: "info", msg: "no snapshot found, starting fresh" });
    persistence = startPersistence(store, adapter, { kind: "file" });
  } else {
    boot.push({ level: "warn", msg: "DATA_DIR is not set: progress is memory-only and is lost on restart" });
  }
  const blockedTerms = (process.env.BLOCKED_TERMS ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  const { app } = buildApp(
    {
      sessionSecret, internalSecret, allowedOrigin: process.env.API_ORIGIN ?? "http://localhost:3000", blockedTerms, ...(process.env.REALTIME_INTERNAL_URL ? { realtimeUrl: process.env.REALTIME_INTERNAL_URL } : {}),
      ...(process.env.ANALYTICS === "console" ? { analytics: consoleSink } : {}),
      ...(persistence ? { persistence: () => persistence!.status() } : {}),
      logger: { level: process.env.LOG_LEVEL ?? "info", redact: { paths: ["req.headers.authorization", "req.headers.cookie"], remove: true } },
    },
    store,
  );
  for (const l of boot) app.log[l.level](l.obj ?? {}, l.msg);
  if (persistence) { const p = persistence; setInterval(() => { const st = p.status(); if (st.lastError) app.log.error({ persistence: st }, "persistence is failing"); }, 30_000).unref(); }

  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen({ port, host: "0.0.0.0" });
  app.log.info({ port }, "listening");

  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    try { await app.close(); await persistence?.stop(); } finally { process.exit(0); }
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  process.on("unhandledRejection", (e) => app.log.error({ err: e }, "unhandledRejection"));
  process.on("uncaughtException", (e) => { app.log.error({ err: e }, "uncaughtException"); void (persistence?.flush() ?? Promise.resolve()).finally(() => process.exit(1)); });
}
main().catch((e) => { console.error(JSON.stringify({ level: "fatal", msg: "failed to start", err: e instanceof Error ? e.message : String(e) })); process.exit(1); });
