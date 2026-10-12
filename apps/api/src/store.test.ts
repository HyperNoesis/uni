import { afterEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_AVATAR, RENAME_COOLDOWN_MS, ROOM, defaultLayout, validateLayout, type Avatar } from "@campus/domain";
import { FilePersistence, MemoryPersistence, startPersistence } from "./persistence";
import { Store } from "./store";

const T0 = Date.parse("2026-10-08T10:00:00Z");
const mk = (s = new Store()) => s.createPlayer({ displayName: "Ada", campus: "unity_heights", avatar: DEFAULT_AVATAR });
const other: Avatar = { ...DEFAULT_AVATAR, outfit: "#e8644a", hair: "afro" };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const dirs: string[] = [];
afterEach(async () => { for (const d of dirs.splice(0)) await fs.rm(d, { recursive: true, force: true }); });
const tmp = async () => { const d = await fs.mkdtemp(join(tmpdir(), "campus-")); dirs.push(d); return d; };

describe("new player", () => {
  it("gets coins, kit, valid room and first achievement; public profile hides internals", () => {
    const s = new Store(); const p = mk(s);
    expect(p.coins).toBe(50);
    expect(Object.keys(p).sort()).toEqual(["avatar", "bio", "campus", "coins", "createdAt", "displayName", "id", "reputation"]);
    const inv = s.ownedCounts(p.id);
    expect(inv.plant).toBe(2);
    expect(inv.banner_lagoon_tech).toBeUndefined();
    expect(inv.lamp_neon).toBeUndefined();
    expect(validateLayout(s.home(p.id)!.layout, inv, "unity_heights")).toEqual({ ok: true });
    expect(s.achievements(p.id).map((a) => a.id)).toEqual(["first_steps"]);
  });
});
describe("grants and profile", () => {
  it("grantItem is idempotent per key and refuses bad grants", () => {
    const s = new Store(); const p = mk(s);
    expect(s.grantItem(p.id, "lamp", "t", "k1")).toBe(true);
    expect(s.grantItem(p.id, "lamp", "t", "k1")).toBe(false);
    expect(s.ownedCounts(p.id).lamp).toBe(2);
    expect(() => s.grantItem(p.id, "banner_lagoon_tech", "t", "k")).toThrow();
    expect(() => s.grantItem(p.id, "nope", "t", "k")).toThrow();
  });
  it("new look unlocks Fresh Look exactly once (rep and item once)", () => {
    const s = new Store(); const p = mk(s);
    const a = s.updateProfile(p.id, { avatar: other }, T0);
    expect(a.ok && a.unlocked).toEqual(["fresh_look"]);
    s.updateProfile(p.id, { avatar: DEFAULT_AVATAR }, T0 + 1);
    expect(s.profile(p.id)!.reputation).toBe(2);
    expect(s.ownedCounts(p.id).poster_football).toBe(1);
  });
  it("bio unlocks Storyteller; clearing does not", () => {
    const s = new Store(); const p = mk(s);
    const c = s.updateProfile(p.id, { bio: "" }, T0);
    expect(c.ok && c.unlocked).toEqual([]);
    const r = s.updateProfile(p.id, { bio: "CS 300L" }, T0);
    expect(r.ok && r.unlocked).toEqual(["storyteller"]);
  });
  it("rename cooldown: refused rename applies nothing; allowed after a week", () => {
    const s = new Store(); const p = mk(s);
    expect(s.updateProfile(p.id, { displayName: "Ada B" }, T0).ok).toBe(true);
    const r = s.updateProfile(p.id, { displayName: "Ada C", avatar: other, bio: "hi" }, T0 + 5);
    expect(r).toEqual({ ok: false, code: "rename_cooldown", retryAt: new Date(T0 + RENAME_COOLDOWN_MS).toISOString() });
    expect(s.profile(p.id)!.avatar).toEqual(DEFAULT_AVATAR);
    expect(s.updateProfile(p.id, { displayName: "Ada C" }, T0 + RENAME_COOLDOWN_MS).ok).toBe(true);
  });
  it("re-submitting the current name does not start the cooldown", () => {
    const s = new Store(); const p = mk(s);
    s.updateProfile(p.id, { displayName: "Ada" }, T0);
    expect(s.renameAvailableAt(p.id, T0)).toBeNull();
  });
});
describe("saveHome", () => {
  const edited = (s: Store, id: string) => { const l = s.home(id)!.layout; l.items.push({ itemId: "beanbag", x: 0, y: 5, rot: 0 }, { itemId: "speaker", x: 9, y: 3, rot: 0 }); return l; };
  it("saves, bumps revision, stores a clone, unlocks Home Sweet Home and the neon lamp becomes placeable", () => {
    const s = new Store(); const p = mk(s);
    const l = edited(s, p.id);
    const r = s.saveHome(p.id, l, 1, T0);
    expect(r.ok && r.home.revision).toBe(2);
    expect(r.ok && r.unlocked).toEqual(["home_sweet_home"]);
    l.items.length = 0;
    expect(s.home(p.id)!.layout.items.length).toBe(12);
    const l2 = s.home(p.id)!.layout; l2.items.push({ itemId: "lamp_neon", x: 8, y: 6, rot: 0 });
    expect(s.saveHome(p.id, l2, 2, T0 + 1).ok).toBe(true);
  });
  it("stale revision conflicts; identical re-save is a safe no-op", () => {
    const s = new Store(); const p = mk(s);
    const l = edited(s, p.id);
    s.saveHome(p.id, l, 1, T0);
    const stale = defaultLayout("unity_heights"); stale.items.pop();
    expect(s.saveHome(p.id, stale, 1, T0)).toEqual({ ok: false, code: "conflict", revision: 2 });
    const again = s.saveHome(p.id, l, 1, T0);
    expect(again.ok && again.home.revision).toBe(2);
  });
  it("rejects unowned items and blocked doors with indices", () => {
    const s = new Store(); const p = mk(s);
    const a = s.home(p.id)!.layout; a.items.push({ itemId: "lamp_neon", x: 0, y: 5, rot: 0 });
    const r = s.saveHome(p.id, a, 1, T0);
    expect(r.ok === false && r.code === "invalid" && r.errors[0]).toMatchObject({ code: "not_owned", index: 10 });
    const b = s.home(p.id)!.layout; b.items.push({ itemId: "beanbag", x: ROOM.door.x, y: ROOM.rows - 1, rot: 0 });
    const r2 = s.saveHome(p.id, b, 1, T0);
    expect(r2.ok === false && r2.code === "invalid" && r2.errors[0]!.code).toBe("blocks_door");
  });
  it("Quick Hands unlocks once from a server-verified reward", () => {
    const s = new Store(); const p = mk(s);
    expect(s.recordEvent(p.id, { type: "ACTIVITY_REWARDED", activity: "reaction" }, T0)).toEqual(["quick_hands"]);
    expect(s.recordEvent(p.id, { type: "ACTIVITY_REWARDED", activity: "reaction" }, T0)).toEqual([]);
    expect(s.ownedCounts(p.id).trophy_case).toBe(1);
  });
});
describe("durability", () => {
  const populate = () => {
    const s = new Store(); const p = mk(s);
    s.updateProfile(p.id, { avatar: other, bio: "hello there", displayName: "Ada B" }, T0);
    const l = s.home(p.id)!.layout; l.items.push({ itemId: "beanbag", x: 0, y: 5, rot: 0 }); s.saveHome(p.id, l, 1, T0);
    s.noteCompletion(p.id, T0, "2026-10-08", true); s.setIdemResponse(p.id, "key-12345678", { ok: 1 });
    return { s, p };
  };
  it("round-trips through JSON and keeps every idempotency guarantee", () => {
    const { s, p } = populate();
    const c = new Store(); c.restore(JSON.parse(JSON.stringify(s.toSnapshot(T0))));
    expect(c.profile(p.id)).toEqual(s.profile(p.id));
    expect(c.inventory(p.id)).toEqual(s.inventory(p.id));
    expect(c.home(p.id)).toEqual(s.home(p.id));
    expect(c.reconcile(p.id)).toBe(c.balance(p.id));
    expect(c.renameAvailableAt(p.id, T0)).toBe(s.renameAvailableAt(p.id, T0));
    expect(c.dailyUsed(p.id, "2026-10-08")).toBe(1);
    expect(c.getIdemResponse(p.id, "key-12345678")).toEqual({ ok: 1 });
    expect(c.appendLedger({ idempotencyKey: `starter:${p.id}`, actorId: p.id, sourceEvent: "X", amount: 50 }).replay).toBe(true);
    expect(c.grantItem(p.id, "bed_single", "starter", `starter:${p.id}:bed_single`)).toBe(false);
    expect(c.recordEvent(p.id, { type: "AVATAR_CHANGED" }, T0)).toEqual([]);
  });
  it("falls back to the starter room when a stored room no longer validates; refuses bad versions; replaces state", () => {
    const { s, p } = populate();
    const snap = JSON.parse(JSON.stringify(s.toSnapshot(T0)));
    snap.homes[0].layout.items.push({ itemId: "gold_throne", x: 0, y: 0, rot: 0 });
    const c = new Store(); c.restore(snap);
    expect(c.home(p.id)!.layout).toEqual(defaultLayout("unity_heights"));
    expect(c.home(p.id)!.revision).toBe(snap.homes[0].revision + 1);
    expect(() => new Store().restore({ ...snap, version: 1 })).toThrow(/version/);
    const t = new Store(); const stranger = mk(t); t.restore(s.toSnapshot(T0));
    expect(t.profile(stranger.id)).toBeNull();
  });
});
describe("persistence", () => {
  it("file adapter: atomic, private, .bak kept, corrupt-main recovery, refuses unreadable/other-version data", async () => {
    const dir = await tmp(); const fp = new FilePersistence(dir);
    expect(await fp.load()).toBeNull();
    const s = new Store(); const p = mk(s);
    await fp.save(s.toSnapshot()); await fp.save(s.toSnapshot());
    expect((await fs.readdir(dir)).sort()).toEqual(["campus-store.json", "campus-store.json.bak"]);
    expect((await fs.stat(join(dir, "campus-store.json"))).mode & 0o777).toBe(0o600);
    await fs.writeFile(join(dir, "campus-store.json"), "{ torn");
    expect((await fp.load())!.players[0]!.id).toBe(p.id);
    await fs.writeFile(join(dir, "campus-store.json.bak"), "bad");
    let m = ""; try { await fp.load(); } catch (e) { m = (e as Error).message; }
    expect(m).toMatch(/readable/);
    await fs.writeFile(join(dir, "campus-store.json"), JSON.stringify({ version: 99 }));
    m = ""; try { await fp.load(); } catch (e) { m = (e as Error).message; }
    expect(m).toMatch(/version 99/);
  });
  it("writer coalesces bursts, retries after failure, flushes on stop", async () => {
    const s = new Store(); const mem = new MemoryPersistence();
    const h = startPersistence(s, mem, { debounceMs: 5 });
    const p = mk(s);
    for (let i = 0; i < 20; i++) s.addReputation(p.id, 1);
    await sleep(40);
    expect(mem.saves).toBe(1);
    mem.failNext = true; s.addReputation(p.id, 1);
    await h.flush();
    expect(h.status().lastError).toBe("disk full");
    await h.flush();
    expect(h.status()).toMatchObject({ lastError: null, pending: false });
    s.addReputation(p.id, 1);
    await h.stop();
    expect(mem.snapshot!.players[0]!.reputation).toBe(22);
  });
  it("survives a full restart cycle with the file adapter", async () => {
    const dir = await tmp();
    const s1 = new Store(); const h1 = startPersistence(s1, new FilePersistence(dir), { kind: "file", debounceMs: 5 });
    const p = mk(s1); s1.updateProfile(p.id, { bio: "still here" }, Date.now());
    await h1.stop();
    const s2 = new Store(); s2.restore((await new FilePersistence(dir).load())!);
    expect(s2.profile(p.id)!.bio).toBe("still here");
    expect(s2.balance(p.id)).toBe(50);
  });
});
