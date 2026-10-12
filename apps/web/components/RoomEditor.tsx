"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FLOOR_THEMES, ITEM_BY_ID, ROOM, WALL_THEMES, footprint, getItem, itemIndexAt, layoutsEqual, ownedCounts, validateLayout, wallIndexAt,
  type HomeLayout, type PlayerProfile, type Rotation,
} from "@campus/domain";
import { api } from "../lib/api";
import { drawItemIcon, drawRoom, hitTest, roomMetrics, type RoomMetrics } from "../lib/room";

type Load = { status: "loading" } | { status: "error" } | { status: "ready" };

/** Tap an item in the tray, tap the room to place it. Tap a placed item to select, rotate or remove it. */
export function RoomEditor({ profile }: { profile: PlayerProfile }) {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [saved, setSaved] = useState<{ layout: HomeLayout; revision: number } | null>(null);
  const [layout, setLayout] = useState<HomeLayout | null>(null);
  const [inv, setInv] = useState<Record<string, number>>({});
  const [tray, setTray] = useState<string | null>(null);
  const [rot, setRot] = useState<Rotation>(0);
  const [sel, setSel] = useState<number | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(360);
  const metrics = useMemo<RoomMetrics>(() => roomMetrics(width), [width]);

  const fetchAll = useCallback(async () => {
    setLoad({ status: "loading" });
    try {
      const [h, i] = await Promise.all([api.home(), api.inventory()]);
      setSaved({ layout: h.layout, revision: h.revision });
      setLayout(structuredClone(h.layout));
      setInv(ownedCounts(i.items));
      setSel(null); setTray(null);
      setLoad({ status: "ready" });
    } catch { setLoad({ status: "error" }); }
  }, []);
  useEffect(() => { void fetchAll(); }, [fetchAll]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.min(560, Math.max(240, el.clientWidth))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [load.status]);

  const verdict = useMemo(() => (layout ? validateLayout(layout, inv, profile.campus) : { ok: true as const }), [layout, inv, profile.campus]);
  const invalid = useMemo(() => new Set(verdict.ok ? [] : verdict.errors.map((e) => e.index).filter((i) => i >= 0)), [verdict]);
  const dirty = !!layout && !!saved && !layoutsEqual(layout, saved.layout);

  const ghost = useMemo(() => {
    if (!layout || !tray || !hover) return null;
    const item = getItem(tray);
    if (!item) return null;
    const r: Rotation = item.layer === "wall" ? 0 : rot;
    const fp = footprint(item, r);
    const x = Math.max(0, Math.min(ROOM.cols - fp.w, hover.x));
    const y = item.layer === "wall" ? 0 : Math.max(0, Math.min(ROOM.rows - fp.h, hover.y));
    const next: HomeLayout = { ...layout, items: [...layout.items, { itemId: item.id, x, y, rot: r }] };
    return { item, x, y, rot: r, ok: validateLayout(next, inv, profile.campus).ok };
  }, [layout, tray, hover, rot, inv, profile.campus]);

  useEffect(() => {
    const c = canvas.current, ctx = c?.getContext("2d");
    if (!c || !ctx || !layout) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = metrics.width * dpr; c.height = metrics.height * dpr;
    c.style.width = `${metrics.width}px`; c.style.height = `${metrics.height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawRoom(ctx, layout, metrics, { selected: sel, invalid, ghost, showGrid: !!tray });
  }, [layout, metrics, sel, invalid, ghost, tray, load.status]);

  const placed = useMemo(() => ownedCounts((layout?.items ?? []).map((p) => ({ itemId: p.itemId, qty: 1 }))), [layout]);
  const trayItems = useMemo(() => Object.keys(inv).filter((id) => ITEM_BY_ID.has(id)).sort((a, b) => (ITEM_BY_ID.get(a)!.layer + a).localeCompare(ITEM_BY_ID.get(b)!.layer + b)), [inv]);

  function pointer(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return hitTest(metrics, e.clientX - r.left, e.clientY - r.top);
  }
  function onMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const h = pointer(e);
    setHover(h.kind === "floor" ? { x: h.x, y: h.y } : h.kind === "wall" ? { x: h.x, y: 0 } : null);
  }
  function onTap(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!layout) return;
    const h = pointer(e);
    if (h.kind === "none") return;
    setMsg(null);
    if (tray && getItem(tray)) {
      const item = getItem(tray)!;
      if ((placed[tray] ?? 0) >= (inv[tray] ?? 0)) { setMsg({ kind: "err", text: `No more ${item.name} to place.` }); return; }
      const tapX = h.x, tapY = h.kind === "floor" ? h.y : 0;
      const r: Rotation = item.layer === "wall" ? 0 : rot;
      const fp = footprint(item, r);
      const x = Math.max(0, Math.min(ROOM.cols - fp.w, tapX));
      const y = item.layer === "wall" ? 0 : Math.max(0, Math.min(ROOM.rows - fp.h, tapY));
      const next: HomeLayout = { ...layout, items: [...layout.items, { itemId: item.id, x, y, rot: r }] };
      const v = validateLayout(next, inv, profile.campus);
      if (!v.ok) { setMsg({ kind: "err", text: v.errors[0]!.message }); return; }
      setLayout(next); setSel(next.items.length - 1);
      if ((placed[tray] ?? 0) + 1 >= (inv[tray] ?? 0)) setTray(null);
      return;
    }
    const idx = h.kind === "wall" ? wallIndexAt(layout, h.x) : itemIndexAt(layout, h.x, h.y);
    setSel(idx >= 0 ? idx : null);
  }

  function rotateSel() {
    if (!layout || sel === null) return;
    const p = layout.items[sel]!, d = getItem(p.itemId);
    if (!d || d.layer === "wall") return;
    const items = layout.items.map((q, i) => (i === sel ? { ...q, rot: (((q.rot + 1) % 4) as Rotation) } : q));
    const next = { ...layout, items };
    const v = validateLayout(next, inv, profile.campus);
    if (!v.ok) { setMsg({ kind: "err", text: "It does not fit when rotated there." }); return; }
    setLayout(next);
  }
  function removeSel() {
    if (!layout || sel === null) return;
    setLayout({ ...layout, items: layout.items.filter((_, i) => i !== sel) }); setSel(null);
  }
  const setTheme = (t: Partial<HomeLayout["theme"]>) => layout && setLayout({ ...layout, theme: { ...layout.theme, ...t } });

  async function save() {
    if (!layout || !saved || !verdict.ok || busy) return;
    setBusy(true); setMsg(null);
    try {
      const r = await api.saveHome(layout, saved.revision);
      setSaved({ layout: r.layout, revision: r.revision });
      setLayout(structuredClone(r.layout));
      if (r.newlyUnlocked?.length) { const i = await api.inventory(); setInv(ownedCounts(i.items)); }
      setMsg({ kind: "ok", text: r.newlyUnlocked?.length ? "Room saved. You unlocked something new, check the tray!" : "Room saved." });
    } catch (e) {
      const err = e as { status?: number; message?: string };
      if (err.status === 409) { setMsg({ kind: "err", text: "Your room changed somewhere else. Reloading it now." }); await fetchAll(); }
      else if (err.status === 422) setMsg({ kind: "err", text: "That layout is not allowed. Fix the red items and try again." });
      else setMsg({ kind: "err", text: "Could not save. Check your connection and try again." });
    } finally { setBusy(false); }
  }

  if (load.status === "loading") return <section className="card room-card" aria-busy="true"><p className="muted">Loading your room…</p></section>;
  if (load.status === "error" || !layout) return (
    <section className="card room-card"><p className="muted">Could not load your room.</p><button className="btn ghost" onClick={() => void fetchAll()}>Try again</button></section>
  );
  const selDef = sel !== null ? getItem(layout.items[sel]?.itemId ?? "") : undefined;

  return (
    <section className="card room-card" aria-label="Your room">
      <div className="room-head">
        <h3>Your room</h3>
        <span className="muted small">{layout.items.length}/{ROOM.maxItems} items</span>
      </div>
      <div ref={box} className="room-box">
        <canvas ref={canvas} className="room-canvas" aria-label="Room editor. Choose an item below, then tap the room to place it."
          onPointerMove={onMove} onPointerLeave={() => setHover(null)} onPointerUp={onTap} />
      </div>
      {tray && <p className="muted small" role="status">Placing {getItem(tray)?.name}. Tap the room{getItem(tray)?.layer === "wall" ? " wall" : ""} to place it.</p>}
      <div className="room-actions">
        {selDef && selDef.layer !== "wall" && <button className="btn ghost" onClick={rotateSel}>Rotate</button>}
        {tray && getItem(tray)?.layer !== "wall" && <button className="btn ghost" onClick={() => setRot((((rot + 1) % 4) as Rotation))}>Rotate ({rot * 90}°)</button>}
        {sel !== null && <button className="btn ghost" onClick={removeSel}>Remove {selDef?.name ?? "item"}</button>}
        {tray && <button className="btn ghost" onClick={() => setTray(null)}>Cancel</button>}
      </div>
      <div className="field"><label>Items</label>
        <div className="tray">
          {trayItems.map((id) => {
            const d = ITEM_BY_ID.get(id)!, left = (inv[id] ?? 0) - (placed[id] ?? 0);
            return <TrayItem key={id} id={id} name={d.name} left={left} active={tray === id} onPick={() => { setTray(tray === id ? null : id); setSel(null); setMsg(null); }} />;
          })}
        </div>
      </div>
      <div className="field"><label>Walls</label>
        <div className="swatches">{WALL_THEMES.map((c) => <button key={c} className="swatch" style={{ background: c }} aria-label={`Wall ${c}`} aria-pressed={layout.theme.wall === c} onClick={() => setTheme({ wall: c })} />)}</div>
      </div>
      <div className="field"><label>Floor</label>
        <div className="chips">{FLOOR_THEMES.map((f) => <button key={f} className="chip" aria-pressed={layout.theme.floor === f} onClick={() => setTheme({ floor: f })}>{f}</button>)}</div>
      </div>
      {!verdict.ok && <p className="err" role="alert">{verdict.errors[0]!.message}</p>}
      {msg && <p className={msg.kind === "ok" ? "ok-msg" : "err"} role={msg.kind === "ok" ? "status" : "alert"}>{msg.text}</p>}
      <div className="row">
        <button className="btn ghost" disabled={!dirty || busy} onClick={() => { setLayout(structuredClone(saved!.layout)); setSel(null); setTray(null); setMsg(null); }}>Revert</button>
        <button className="btn accent" disabled={!dirty || !verdict.ok || busy} onClick={() => void save()}>{busy ? "Saving…" : dirty ? "Save room" : "Saved"}</button>
      </div>
    </section>
  );
}

function TrayItem({ id, name, left, active, onPick }: { id: string; name: string; left: number; active: boolean; onPick: () => void }) {
  const c = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = c.current, ctx = el?.getContext("2d"), d = getItem(id);
    if (!el || !ctx || !d) return;
    const dpr = window.devicePixelRatio || 1;
    el.width = 48 * dpr; el.height = 48 * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, 48, 48);
    drawItemIcon(ctx, d, 48);
  }, [id]);
  return (
    <button className="tray-item" aria-pressed={active} disabled={left < 1} onClick={onPick} aria-label={`${name}, ${left} left`}>
      <canvas ref={c} style={{ width: 48, height: 48 }} /><span>{name}</span><i>{left}</i>
    </button>
  );
}
