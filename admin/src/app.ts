import { createServer, type IncomingMessage, type Server } from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { createLogger, type Logger } from "@campus/domain/logging";
import { TokenBucket, resolveFlags } from "@campus/game-core";

export interface AuditEntry { id: string; at: string; actor: string; action: string; correlationId: string; status: number }
export interface AdminConfig { adminToken: string; featureFlags?: string; logger?: Logger; now?: () => Date; /** Phase 5 moderation: API base URL + shared secret. Omitted = moderation routes answer 503. */ apiUrl?: string; internalSecret?: string; fetch?: typeof fetch }

const safeEqual = (a: string, b: string): boolean => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * Operations console API. Every request to a privileged route is audited, including failed logins.
 * The audit list is in memory until the Postgres adapter lands; infra/db/migrations creates the audit_logs table it will use.
 */
export function createAdminServer(cfg: AdminConfig): { server: Server; audit: readonly AuditEntry[] } {
  const log = cfg.logger ?? createLogger({ service: "admin" });
  const now = cfg.now ?? (() => new Date());
  const audit: AuditEntry[] = [];
  const failures = new Map<string, TokenBucket>();

  const record = (actor: string, action: string, correlationId: string, status: number) => {
    const entry: AuditEntry = { id: randomUUID(), at: now().toISOString(), actor, action, correlationId, status };
    audit.push(Object.freeze(entry));
    log.info("audit", { ...entry });
  };

  const doFetch = cfg.fetch ?? fetch;
  const MOD_ACTIONS = ["dismiss", "warn", "chat_mute_24h", "chat_mute_7d"];
  const readBody = (req: IncomingMessage) => new Promise<string>((ok) => { let b = ""; req.on("data", (d: Buffer) => { b += d; if (b.length > 2048) req.destroy(); }); req.on("end", () => ok(b)); });
  const server = createServer(async (req: IncomingMessage, res) => {
    const correlationId = String(req.headers["x-correlation-id"] ?? randomUUID());
    const send = (status: number, body?: unknown) => {
      res.writeHead(status, { "content-type": "application/json", "x-correlation-id": correlationId, "x-content-type-options": "nosniff", "cache-control": "no-store" });
      res.end(body === undefined ? undefined : JSON.stringify(body));
    };
    const url = (req.url ?? "/").split("?")[0]!;
    if (req.method === "GET" && url === "/healthz") return send(200, { ok: true });
    if (req.method === "GET" && url === "/readyz") return send(200, { ok: true });
    if (!url.startsWith("/admin/")) return send(404, { error: "not_found" });

    const ip = req.socket.remoteAddress ?? "unknown";
    const bucket = failures.get(ip) ?? new TokenBucket(10, 10 / 60);
    failures.set(ip, bucket);
    const header = req.headers.authorization ?? "";
    const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!safeEqual(presented, cfg.adminToken)) {
      const allowed = bucket.take();
      record("anonymous", `${req.method} ${url}`, correlationId, allowed ? 401 : 429);
      return send(allowed ? 401 : 429, { error: allowed ? "unauthorized" : "rate_limited" });
    }

    const action = `${req.method} ${url}`;
    if (req.method === "GET" && url === "/admin/flags") {
      record("admin", action, correlationId, 200);
      return send(200, { flags: resolveFlags(cfg.featureFlags) });
    }
    if (req.method === "GET" && url === "/admin/audit") {
      record("admin", action, correlationId, 200);
      return send(200, { entries: audit.slice(-200) });
    }
    // ---- moderation (Phase 5): every call is audited; the console never touches player data directly ----
    const reportRoute = url.match(/^\/admin\/reports\/([\w-]{1,64})\/resolve$/), playerRoute = url.match(/^\/admin\/players\/([\w-]{1,64})$/);
    if ((req.method === "GET" && (url === "/admin/reports" || playerRoute)) || (req.method === "POST" && reportRoute)) {
      if (!cfg.apiUrl || !cfg.internalSecret) { record("admin", action, correlationId, 503); return send(503, { error: "moderation_not_configured" }); }
      const headers = { "content-type": "application/json", "x-internal-secret": cfg.internalSecret };
      try {
        let r: Response;
        if (reportRoute) {
          let parsed: { action?: unknown } = {};
          try { parsed = JSON.parse((await readBody(req)) || "{}"); } catch { /* handled below */ }
          if (typeof parsed.action !== "string" || !MOD_ACTIONS.includes(parsed.action)) { record("admin", action, correlationId, 400); return send(400, { error: "invalid_action", allowed: MOD_ACTIONS }); }
          r = await doFetch(`${cfg.apiUrl}/internal/admin/reports/${reportRoute[1]}/resolve`, { method: "POST", headers, body: JSON.stringify({ action: parsed.action, moderator: "admin" }) });
        } else r = await doFetch(`${cfg.apiUrl}${playerRoute ? `/internal/admin/players/${playerRoute[1]}` : "/internal/admin/reports"}`, { headers });
        record("admin", action, correlationId, r.status);
        return send(r.status, await r.json().catch(() => ({})));
      } catch (e) { log.error("moderation upstream failed", { error: e }); record("admin", action, correlationId, 502); return send(502, { error: "upstream_unavailable" }); }
    }
    record("admin", action, correlationId, 404);
    return send(404, { error: "not_found" });
  });
  return { server, audit };
}
