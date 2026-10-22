import { describe, expect, it, vi } from "vitest";
import type { ServerMessage } from "@campus/domain";
import { INTERACTION_POINTS, isBlocked, SOLIDS, WORLD } from "@campus/domain";
import { Room, type Conn } from "./room";

const avatar = { skin: "#f1d3b5", outfit: "#2f6bff", hair: "short", hairColor: "#1a1210", top: "tee", accessory: "none" } as const;

function client() {
  const msgs: ServerMessage[] = [];
  const conn: Conn = { send: (m) => void msgs.push(m), close: () => {} };
  return { msgs, conn };
}
const id = (n: string) => ({ id: n, name: n, campus: "unity_heights" as const, avatar });

describe("Room", () => {
  it("welcomes a joiner and lets two players see each other", () => {
    const room = new Room();
    const a = client();
    const b = client();
    room.join(id("a"), a.conn);
    room.join(id("b"), b.conn);
    const bWelcome = b.msgs.find((m) => m.t === "welcome");
    expect(bWelcome && bWelcome.t === "welcome" && bWelcome.players.map((p) => p.id)).toEqual(["a"]); // late joiner sees existing player
    room.tick();
    const snap = a.msgs.filter((m) => m.t === "snapshot").at(-1);
    expect(snap && snap.t === "snapshot" && snap.players.map((p) => p.id)).toEqual(["b"]); // existing player is told about the joiner
  });

  it("corrects teleport attempts", () => {
    let t = 0;
    const room = new Room({ now: () => t });
    const a = client();
    const p = room.join(id("a"), a.conn);
    const startX = p.x;
    t += 100;
    room.input("a", 1, startX + 80, p.y);
    expect(a.msgs.some((m) => m.t === "correct")).toBe(true);
    expect(p.x - startX).toBeLessThan(2);
  });

  it("rejects moves into walls and props (collision authority)", () => {
    let t = 0;
    const room = new Room({ now: () => t });
    const a = client();
    const p = room.join(id("a"), a.conn);
    p.x = 38.9; p.y = 128; // just outside the west gate tower (x 39.94..50.06, y 127.48..136.53)
    t += 100;
    room.input("a", 1, 39.7, 128);
    expect(a.msgs.some((m) => m.t === "correct")).toBe(true);
    expect(p.x).toBe(38.9);
    t += 100;
    room.input("a", 2, 38.6, 128); // walking away is fine
    expect(p.x).toBe(38.6);
  });

  it("ignores replayed/stale input sequence numbers", () => {
    let t = 0;
    const room = new Room({ now: () => t });
    const a = client();
    const p = room.join(id("a"), a.conn);
    t += 100;
    room.input("a", 5, p.x + 0.3, p.y);
    const x = p.x;
    t += 100;
    room.input("a", 5, p.x + 0.3, p.y);
    expect(p.x).toBe(x);
  });

  it("only validates interaction when in range and attests proximity", () => {
    let t = 0;
    const onProximity = vi.fn();
    const room = new Room({ now: () => t, onProximity });
    const a = client();
    const p = room.join(id("a"), a.conn);
    const pt = INTERACTION_POINTS.find((i) => i.id === "commons_board")!;
    t += 1000;
    room.interact("a", "commons_board");
    const far = a.msgs.filter((m) => m.t === "interaction").at(-1);
    expect(far).toMatchObject({ ok: false, reason: "too_far" });
    expect(onProximity).not.toHaveBeenCalled();
    p.x = pt.x;
    p.y = pt.y + 1;
    t += 1000;
    room.interact("a", "commons_board");
    expect(onProximity).toHaveBeenCalledWith("a", "commons_board");
  });

  it("restores position on reconnect with a valid token, not an invalid one", () => {
    const room = new Room();
    const a1 = client();
    const p = room.join(id("a"), a1.conn);
    const token = p.reconnectToken;
    p.x = 33;
    p.y = 22;
    room.disconnect("a", a1.conn);
    const a2 = client();
    const back = room.join(id("a"), a2.conn, token);
    expect(back.x).toBe(33);
    room.disconnect("a", a2.conn);
    const a3 = client();
    const fresh = room.join(id("a"), a3.conn, "forged-token");
    expect(fresh.x).not.toBe(33);
  });

  it("rate-limits message floods", () => {
    const room = new Room();
    room.join(id("a"), client().conn);
    let allowed = 0;
    for (let i = 0; i < 100; i++) if (room.allow("a")) allowed++;
    expect(allowed).toBe(40);
  });

  it("applies interest management", () => {
    const room = new Room();
    const a = client();
    const b = client();
    const pa = room.join(id("a"), a.conn);
    const pb = room.join(id("b"), b.conn);
    pa.x = 2; pa.y = 2;
    pb.x = 118; pb.y = 78;
    room.tick();
    const snap = a.msgs.filter((m) => m.t === "snapshot").at(-1);
    expect(snap && snap.t === "snapshot" && snap.players.length + snap.moved.length).toBe(0); // out of interest range: never sent
  });

  it("sends deltas: idle viewers get nothing new, movers send only x/y, leavers send an id", () => {
    let t = 0;
    const room = new Room({ now: () => t });
    const a = client(), b = client();
    room.join(id("a"), a.conn);
    const pb = room.join(id("b"), b.conn);
    t += 100; room.tick();
    const count = () => a.msgs.filter((m) => m.t === "snapshot").length;
    const n1 = count();
    t += 100; room.tick(); // nothing changed, inside keepalive window
    expect(count()).toBe(n1);
    t += 100; room.input("b", 1, pb.x + 0.3, pb.y); room.tick();
    const mv = a.msgs.filter((m) => m.t === "snapshot").at(-1);
    expect(mv && mv.t === "snapshot" && mv.players.length === 0 && mv.moved.map((d) => d.id)).toEqual(["b"]);
    expect(JSON.stringify(mv)).not.toContain("avatar"); // avatars are only sent once, on first sight
    room.disconnect("b", b.conn);
    t += 100; room.tick();
    const gone = a.msgs.filter((m) => m.t === "snapshot").at(-1);
    expect(gone && gone.t === "snapshot" && gone.gone).toEqual(["b"]);
  });

  it("sends a keepalive snapshot to idle viewers about once a second", () => {
    let t = 0;
    const room = new Room({ now: () => t });
    const a = client();
    room.join(id("a"), a.conn);
    t += 100; room.tick();
    const n = a.msgs.filter((m) => m.t === "snapshot").length;
    t += 1100; room.tick();
    expect(a.msgs.filter((m) => m.t === "snapshot").length).toBe(n + 1);
  });

  it("logs repeated corrections and disconnects an extreme offender", () => {
    let t = 0;
    const events: string[] = [];
    const room = new Room({ now: () => t, onAbuse: (_id, kind) => void events.push(kind) });
    const a = client();
    let closed = false;
    const conn: Conn = { send: a.conn.send, close: () => { closed = true; } };
    room.join(id("a"), conn);
    for (let i = 1; i <= 130; i++) { t += 50; room.input("a", i, 0, 0); } // impossible teleports
    expect(events[0]).toBe("warn");
    expect(events).toContain("kick");
    expect(closed).toBe(true);
  });

  it("spawns players on walkable ground and reports zone changes and departures", () => {
    let t = 0;
    const zones: string[] = [], left: string[] = [];
    const room = new Room({ now: () => t, onZone: (_i, z) => void zones.push(z), onLeave: (i) => void left.push(i) });
    const a = client();
    const p = room.join(id("a"), a.conn);
    expect(isBlocked(p.x, p.y)).toBe(false);
    expect(zones[0]).toBe("gate_road");
    room.disconnect("a", a.conn);
    t += 31_000; room.tick();
    expect(left).toEqual(["a"]);
    expect(room.roomEmpty).toBe(true);
  });

  it("limits emote spam", () => {
    let t = 1000;
    const room = new Room({ now: () => t });
    const a = client();
    const p = room.join(id("a"), a.conn);
    room.emote("a", "wave"); t += 100; room.emote("a", "dance");
    expect(p.emote).toBe("wave");
    t += 500; room.emote("a", "dance");
    expect(p.emote).toBe("dance");
  });
});

describe("Sit emote (server-validated)", () => {
  it("only seats a player beside a bench, and standing up (moving away) ends it", () => {
    const room = new Room();
    const a = client();
    room.join(id("a"), a.conn);
    const p = (room as any).players.get("a");
    p.x = 1; p.y = 1; // open ground far from any bench
    room.emote("a", "sit");
    expect(p.emote).not.toBe("sit");
  });
  it("seats beside a bench and clears when the player walks away", () => {
    const bench = SOLIDS.find((s) => s.kind === "bench")!;
    let t = 1000;
    const room = new Room({ now: () => t });
    const a = client();
    room.join(id("a"), a.conn);
    const p = (room as any).players.get("a");
    p.x = bench.x + bench.w / 2; p.y = bench.y + bench.h + 0.8;
    t += 1000; room.emote("a", "sit");
    expect(p.emote).toBe("sit");
    expect(p.emoteUntil).toBeGreaterThan(t + 10000);
    t += 1000; room.input("a", 1, p.x, p.y + 0.1); // still seated
    expect(p.emoteUntil).toBeGreaterThan(t);
    t += 1000; room.input("a", 2, p.x, p.y + 2);
    expect(p.emoteUntil).toBe(0);
  });
});

describe("Room blocks (Phase 5)", () => {
  it("never shows a blocked pair to each other, at join or live, and restores visibility on unblock", () => {
    const room = new Room();
    const a = client(), b = client(), c = client();
    room.join(id("a"), a.conn);
    room.setBlocks("b", ["a"]); // loaded from the API before join
    room.join(id("c"), c.conn); // c is already present when b joins, so b's welcome can list it
    room.join(id("b"), b.conn);
    const bWelcome = b.msgs.find((m) => m.t === "welcome");
    expect(bWelcome && bWelcome.t === "welcome" && bWelcome.players.map((p) => p.id)).toEqual(["c"]); // a hidden from b
    room.tick();
    const seen = (cl: ReturnType<typeof client>) => cl.msgs.flatMap((m) => (m.t === "snapshot" ? m.players.map((p) => p.id) : []));
    expect(seen(a)).not.toContain("b"); // and b hidden from a
    expect(seen(a)).toContain("c");
    room.setBlockedPair("a", "b", false);
    room.tick();
    expect(seen(a)).toContain("b");
    room.setBlockedPair("a", "b", true); // live block: both are told the other is gone
    room.tick();
    const gone = (cl: ReturnType<typeof client>) => cl.msgs.flatMap((m) => (m.t === "snapshot" ? m.gone : []));
    expect(gone(a)).toContain("b");
    expect(gone(b)).toContain("a");
  });

  it("cannot exceed max speed by flooding inputs faster than the 50ms floor (speed-hack burst)", () => {
    let t = 0;
    const room = new Room({ now: () => t });
    const a = client();
    const p = room.join(id("a"), a.conn);
    // Open ground west of spawn, away from solids.
    const startX = p.x, startY = p.y;
    const perInput = WORLD.maxSpeed * WORLD.speedTolerance * 0.05; // what the old 50ms floor granted per message
    let seq = 0;
    for (let i = 0; i < 40; i++) { // 40 msgs in 1s: the server's own rate cap
      t += 25;
      room.input("a", ++seq, p.x - perInput, p.y);
    }
    const moved = Math.hypot(p.x - startX, p.y - startY);
    const allowed = WORLD.maxSpeed * WORLD.speedTolerance * 1.0; // one real second
    expect(moved).toBeLessThanOrEqual(allowed + 0.5);
    expect(moved).toBeGreaterThan(allowed * 0.5); // the path was open: this is a speed limit, not a wall
  });

  it("does not punish an honest client whose packets arrive late in a burst (network jitter)", () => {
    let t = 0;
    const room = new Room({ now: () => t });
    const a = client();
    const p = room.join(id("a"), a.conn);
    t += 50; // steady start
    room.input("a", 1, p.x - WORLD.maxSpeed * 0.05, p.y);
    // 3 packets sent 50ms apart at honest 6 u/s all arrive together 150ms later
    t += 150;
    const step = WORLD.maxSpeed * 0.05;
    const before = a.msgs.filter((m) => m.t === "correct").length;
    for (let i = 0; i < 3; i++) room.input("a", 2 + i, p.x - step, p.y);
    expect(a.msgs.filter((m) => m.t === "correct").length).toBe(before);
  });

  it("exposes diagnostics: rejected actions, corrections, tick timing", () => {
    let t = 0;
    const room = new Room({ now: () => t });
    const a = client();
    const p = room.join(id("a"), a.conn);
    t += 100;
    room.input("a", 1, p.x + 80, p.y); // teleport -> correction
    t += 600; // clear the interact cooldown
    room.interact("a", "nope"); // unknown point
    room.tick();
    const s = room.stats();
    expect(s.connected).toBe(1);
    expect(s.corrections).toBeGreaterThanOrEqual(1);
    expect(s.rejected.unknown_point).toBe(1);
    expect(s.ticks).toBe(1);
    expect(s.lastTickMs).toBeGreaterThanOrEqual(0);
  });

  it("reports whether a disconnect was the current connection", () => {
    const room = new Room();
    const a1 = client(), a2 = client();
    const first = room.join(id("a"), a1.conn);
    expect(room.disconnect("a", a2.conn)).toBe(false);
    expect(room.disconnect("a", a1.conn)).toBe(true);
    expect(first.conn).toBeNull();
  });

  it("keeps an unapproved player out of the wicket and lets an approved one through", () => {
    const walk = (approve: boolean) => {
      let t = 0;
      const room = new Room({ now: () => t });
      const a = client();
      const p = room.join(id("a"), a.conn);
      p.x = 68.8; p.y = 133.2; // just outside the pedestrian wicket (x 67.6-70, line y=132)
      if (approve) room.gatePass("a");
      let seq = 0;
      for (let i = 0; i < 20; i++) { t += 100; room.input("a", ++seq, 68.8, 133.2 - (i + 1) * 0.2); }
      return p;
    };
    expect(walk(false).y).toBeGreaterThan(132.0); // blocked by the closed wicket / car-gate line
    expect(walk(true).y).toBeLessThan(132.0);     // approved: walks through
  });
});
