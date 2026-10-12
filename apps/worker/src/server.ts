import { createServer } from "node:http";
import { createLogger, parseLogLevel } from "@campus/domain/logging";
import { JobQueue } from "./queue";

const log = createLogger({ service: "worker", level: parseLogLevel(process.env.LOG_LEVEL) });
const port = Number(process.env.WORKER_PORT ?? process.env.PORT ?? 4002);

const queue = new JobQueue({ logger: log, onRun: (r) => log.debug("job run", { ...r }) });
queue.register("system.heartbeat", async (_p, { log: l }) => l.info("worker heartbeat", queue.stats()));

let draining = false;
let busy = false;
const tick = setInterval(async () => {
  if (busy || draining) return;
  busy = true;
  try { await queue.processDue(); } catch (e) { log.error("queue tick failed", { error: e }); } finally { busy = false; }
}, 1000);
const beat = setInterval(() => queue.enqueue("system.heartbeat", {}, { id: `heartbeat:${Math.floor(Date.now() / 60_000)}` }), 60_000);

const http = createServer((req, res) => {
  if (req.url === "/healthz") return void res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: true, ...queue.stats() }));
  if (req.url === "/readyz") return void res.writeHead(draining ? 503 : 200).end();
  res.writeHead(404).end();
});
http.listen(port, () => log.info("listening", { port }));

function shutdown(signal: string) {
  log.info("draining", { signal });
  draining = true;
  clearInterval(tick);
  clearInterval(beat);
  const wait = setInterval(() => { if (!busy) { clearInterval(wait); http.close(() => process.exit(0)); } }, 100);
  setTimeout(() => process.exit(0), 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("unhandledRejection", (e) => log.error("unhandledRejection", { error: e }));
process.on("uncaughtException", (e) => { log.error("uncaughtException", { error: e }); process.exit(1); });
