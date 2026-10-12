import { afterEach, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { createLogger } from "@campus/domain/logging";
import { createAdminServer } from "./app";

const TOKEN = "t".repeat(40);
let close: (() => void) | undefined;
afterEach(() => close?.());

async function boot(featureFlags?: string) {
  const { server, audit } = createAdminServer({ adminToken: TOKEN, featureFlags, logger: createLogger({ service: "t", sink: () => {} }) });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  close = () => server.close();
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { base, audit };
}
const auth = { authorization: `Bearer ${TOKEN}` };

describe("admin console", () => {
  it("serves health and readiness without auth", async () => {
    const { base } = await boot();
    expect((await fetch(`${base}/healthz`)).status).toBe(200);
    expect((await fetch(`${base}/readyz`)).status).toBe(200);
  });
  it("rejects missing and wrong tokens and audits the attempts", async () => {
    const { base, audit } = await boot();
    expect((await fetch(`${base}/admin/flags`)).status).toBe(401);
    expect((await fetch(`${base}/admin/flags`, { headers: { authorization: "Bearer nope" } })).status).toBe(401);
    expect(audit.map((a) => a.actor)).toEqual(["anonymous", "anonymous"]);
  });
  it("returns resolved flags and audits the privileged read", async () => {
    const { base, audit } = await boot('{"shop":true}');
    const res = await fetch(`${base}/admin/flags`, { headers: auth });
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).flags.shop).toBe(true);
    expect(audit.at(-1)!.action).toBe("GET /admin/flags");
    expect(audit.at(-1)!.actor).toBe("admin");
  });
  it("throttles repeated failed logins", async () => {
    const { base } = await boot();
    let last = 0;
    for (let i = 0; i < 12; i++) last = (await fetch(`${base}/admin/audit`)).status;
    expect(last).toBe(429);
  });
});

describe("moderation routes (Phase 5)", () => {
  it("requires auth, proxies with the internal secret, validates actions and audits every call", async () => {
    const calls: { url: string; secret: unknown; body?: string }[] = [];
    const fakeFetch = (async (url: string, init?: RequestInit) => { calls.push({ url, secret: (init?.headers as Record<string, string>)["x-internal-secret"], ...(init?.body ? { body: String(init.body) } : {}) }); return new Response(JSON.stringify({ reports: [] }), { status: 200 }); }) as unknown as typeof fetch;
    const { server, audit } = createAdminServer({ adminToken: TOKEN, apiUrl: "http://api", internalSecret: "sec", fetch: fakeFetch, logger: createLogger({ service: "t", sink: () => {} }) });
    await new Promise<void>((r) => server.listen(0, r));
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const h = { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" };
    expect((await fetch(`${base}/admin/reports`)).status).toBe(401);
    expect((await fetch(`${base}/admin/reports`, { headers: h })).status).toBe(200);
    expect(calls[0]).toMatchObject({ url: "http://api/internal/admin/reports", secret: "sec" });
    expect((await fetch(`${base}/admin/reports/abc/resolve`, { method: "POST", headers: h, body: JSON.stringify({ action: "ban_forever" }) })).status).toBe(400);
    expect((await fetch(`${base}/admin/reports/abc/resolve`, { method: "POST", headers: h, body: JSON.stringify({ action: "warn" }) })).status).toBe(200);
    expect(JSON.parse(calls[1]!.body!)).toEqual({ action: "warn", moderator: "admin" });
    expect(audit.length).toBeGreaterThanOrEqual(4);
    server.close();
  });
});
