import { createLogger, parseLogLevel } from "@campus/domain/logging";
import { createAdminServer } from "./app";

const log = createLogger({ service: "admin", level: parseLogLevel(process.env.LOG_LEVEL) });
const token = process.env.ADMIN_TOKEN ?? "dev-only-admin-token";
if (process.env.NODE_ENV === "production" && (token === "dev-only-admin-token" || token.length < 32)) {
  throw new Error("ADMIN_TOKEN must be set to at least 32 characters in production");
}
const port = Number(process.env.ADMIN_PORT ?? process.env.PORT ?? 4003);
const { server } = createAdminServer({ adminToken: token, featureFlags: process.env.FEATURE_FLAGS, logger: log, ...(process.env.API_INTERNAL_URL && process.env.INTERNAL_SECRET ? { apiUrl: process.env.API_INTERNAL_URL, internalSecret: process.env.INTERNAL_SECRET } : {}) });
server.listen(port, () => log.info("listening", { port }));

const shutdown = (signal: string) => { log.info("draining", { signal }); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 5000).unref(); };
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("unhandledRejection", (e) => log.error("unhandledRejection", { error: e }));
process.on("uncaughtException", (e) => { log.error("uncaughtException", { error: e }); process.exit(1); });
