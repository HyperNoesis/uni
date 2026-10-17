"use client";
import { useEffect, useRef, useState } from "react";
import { createLibraryWorld, type LibraryApi, type LibUi, type LibAvatar } from "../lib/library-world";
import type { BookData } from "../lib/library-content";

const CSS = `
.lw{position:fixed;inset:0;z-index:80;background:#0b0f1a;touch-action:none;user-select:none;font-family:system-ui,sans-serif;color:#fff}
.lw canvas{width:100%;height:100%;display:block}
.lw-top{position:absolute;top:10px;left:10px;right:10px;display:flex;gap:8px;align-items:center;pointer-events:none}
.lw-chip{background:rgba(15,20,35,.72);backdrop-filter:blur(6px);border:1px solid rgba(255,255,255,.14);border-radius:999px;padding:7px 13px;font-size:13px;pointer-events:auto}
.lw-sp{flex:1}
.lw-toast{position:absolute;top:56px;left:50%;transform:translateX(-50%);max-width:min(560px,92vw);background:rgba(20,28,48,.88);border:1px solid rgba(241,210,122,.5);border-radius:14px;padding:10px 14px;font-size:14px;text-align:center}
.lw-acts{position:absolute;left:50%;bottom:26px;transform:translateX(-50%);display:flex;flex-direction:column;gap:8px;align-items:center;width:min(440px,90vw)}
.lw-btn{width:100%;border:0;border-radius:14px;padding:14px 16px;font-size:16px;font-weight:700;background:#f1d27a;color:#2a1a0e;box-shadow:0 4px 16px rgba(0,0,0,.4);cursor:pointer}
.lw-btn.alt{background:#2b3a66;color:#fff}
.lw-stick{position:absolute;left:22px;bottom:26px;width:120px;height:120px;border-radius:50%;background:rgba(255,255,255,.1);border:2px solid rgba(255,255,255,.25)}
.lw-knob{position:absolute;left:35px;top:35px;width:50px;height:50px;border-radius:50%;background:rgba(255,255,255,.45)}
.lw-help{position:absolute;right:12px;bottom:12px;font-size:12px;opacity:.7;text-align:right;max-width:200px}
.lw-read{position:absolute;inset:0;background:rgba(8,10,18,.82);display:flex;align-items:center;justify-content:center;padding:12px}
.lw-card{display:flex;flex-direction:column;width:min(860px,100%);max-height:94vh;background:#f6efdc;color:#2a1a0e;border-radius:16px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.6)}
.lw-bar{display:flex;gap:8px;align-items:center;padding:10px 14px;background:#4a2f1c;color:#f1d27a;font-weight:700}
.lw-body{display:flex;min-height:0;flex:1}
.lw-list{width:230px;overflow:auto;border-right:1px solid #d6c9a6;background:#efe5c9}
.lw-li{padding:10px 12px;font-size:13px;border-bottom:1px solid #d6c9a6;cursor:pointer}
.lw-li.on{background:#f1d27a;font-weight:700}
.lw-li small{display:block;opacity:.65}
.lw-page{flex:1;padding:22px 26px;overflow:auto;font-family:Georgia,serif;line-height:1.7;font-size:18px;white-space:pre-wrap;min-height:260px}
.lw-page h3{margin:0 0 12px;font-size:22px}
.lw-nav{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-top:1px solid #d6c9a6}
.lw-nav button,.lw-bar button{border:0;border-radius:10px;padding:9px 14px;font-weight:700;cursor:pointer;background:#4a2f1c;color:#f1d27a}
.lw-bar button{background:#f1d27a;color:#2a1a0e}
@media(max-width:640px){.lw-body{flex-direction:column}.lw-list{width:auto;max-height:28vh;border-right:0;border-bottom:1px solid #d6c9a6}.lw-page{font-size:16px;padding:16px}}
`;

export function LibraryWorld({ avatar, onClose }: { avatar: LibAvatar; onClose: () => void }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const api = useRef<LibraryApi | null>(null);
  const [ui, setUi] = useState<LibUi | null>(null);
  const [err, setErr] = useState(false);
  const [reading, setReading] = useState(false);
  const [books, setBooks] = useState<BookData[]>([]);
  const [sel, setSel] = useState(0);
  const [pg, setPg] = useState(0);
  const knob = useRef<HTMLDivElement>(null);
  const stickId = useRef<number | null>(null);
  const lookId = useRef<{ id: number; x: number; y: number } | null>(null);

  useEffect(() => {
    const c = cv.current; if (!c) return;
    let w: LibraryApi;
    try { w = createLibraryWorld(c, avatar, setUi); } catch { setErr(true); return; }
    api.current = w;
    const fit = () => w.resize(c.clientWidth, c.clientHeight); fit();
    const ro = new ResizeObserver(fit); ro.observe(c);
    const kd = (e: KeyboardEvent) => { if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault(); w.key(e.code, true); if (e.code === "KeyE" || e.code === "Enter") { const a = lastActs.current[0]; if (a) w.act(a); } };
    const ku = (e: KeyboardEvent) => w.key(e.code, false);
    window.addEventListener("keydown", kd); window.addEventListener("keyup", ku);
    return () => { window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); ro.disconnect(); w.dispose(); api.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lastActs = useRef<string[]>([]);
  useEffect(() => { lastActs.current = (ui?.actions ?? []).map((a) => a.id); }, [ui]);
  useEffect(() => { if (!ui?.sitting) setReading(false); }, [ui?.sitting]);

  function openBooks() { const b = api.current?.picked() ?? []; setBooks(b); setSel(0); setPg(0); setReading(true); }
  function act(id: string) { if (id === "read") { openBooks(); return; } api.current?.act(id); if (id === "stand") setReading(false); }

  const down = (e: React.PointerEvent) => { if (reading) return; const t = e.currentTarget as HTMLElement; t.setPointerCapture(e.pointerId); lookId.current = { id: e.pointerId, x: e.clientX, y: e.clientY }; };
  const move = (e: React.PointerEvent) => { const l = lookId.current; if (!l || l.id !== e.pointerId) return; api.current?.look(-(e.clientX - l.x), e.clientY - l.y); l.x = e.clientX; l.y = e.clientY; };
  const up = (e: React.PointerEvent) => { if (lookId.current?.id === e.pointerId) lookId.current = null; };
  const sMove = (e: React.PointerEvent) => {
    if (stickId.current !== e.pointerId) return; const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    let dx = (e.clientX - (r.left + r.width / 2)) / 50, dy = (e.clientY - (r.top + r.height / 2)) / 50; const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
    if (knob.current) knob.current.style.transform = `translate(${dx * 35}px,${dy * 35}px)`; api.current?.setStick(dx, -dy);
  };
  const sEnd = () => { stickId.current = null; if (knob.current) knob.current.style.transform = ""; api.current?.setStick(0, 0); };

  const cur = books[sel]; const page = cur?.pages[pg];

  return (
    <div className="lw" role="dialog" aria-label="Library">
      <style>{CSS}</style>
      <canvas ref={cv} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
      {err && <div className="lw-toast" style={{ top: "40%" }}>3D is not available on this device. <button className="lw-btn alt" onClick={onClose}>Back to campus</button></div>}
      <div className="lw-top">
        <span className="lw-chip">📚 {ui?.levelName ?? "Library"}</span>
        <span className="lw-chip">🎒 {ui?.picked ?? 0} book{(ui?.picked ?? 0) === 1 ? "" : "s"}</span>
        <span className="lw-sp" />
        <button className="lw-chip" onClick={onClose}>✕ Leave to campus</button>
      </div>
      {ui?.toast && <div className="lw-toast">{ui.toast}</div>}
      {!reading && (
        <>
          <div className="lw-stick" onPointerDown={(e) => { stickId.current = e.pointerId; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); sMove(e); }} onPointerMove={sMove} onPointerUp={sEnd} onPointerCancel={sEnd}><div className="lw-knob" ref={knob} /></div>
          <div className="lw-help">WASD / stick: walk · Shift: run · drag: look · E: action</div>
          <div className="lw-acts">
            {ui?.actions.map((a, i) => <button key={a.id} className={`lw-btn${i ? " alt" : ""}`} onClick={() => act(a.id)}>{a.id === "pick" ? "📖 " : a.id === "sit" ? "🪑 " : a.id === "stand" ? "🧍 " : a.id === "read" ? "📚 " : a.id.startsWith("up") || a.id === "climbOut" ? "🪜 " : a.id.startsWith("dn") || a.id === "down" || a.id === "downOut" ? "⬇ " : a.id === "enter" ? "🚪 " : ""}{a.label}</button>)}
          </div>
        </>
      )}
      {ui?.sitting && !reading && null}
      {reading && (
        <div className="lw-read">
          <div className="lw-card">
            <div className="lw-bar"><span>📖 {cur ? cur.title : "Your books"}</span><span className="lw-sp" style={{ flex: 1 }} /><button onClick={() => { setReading(false); api.current?.act("stand"); }}>Stand up</button><button onClick={() => setReading(false)}>Close</button></div>
            {books.length === 0 ? <div className="lw-page">You have no books yet. Stand up, walk to a shelf and press Pick on a book you like.</div> : (
              <div className="lw-body">
                <div className="lw-list">{books.map((b, i) => <div key={b.id} className={`lw-li${i === sel ? " on" : ""}`} onClick={() => { setSel(i); setPg(0); }}>{b.title}<small>{b.field} · {b.author}</small></div>)}</div>
                <div className="lw-page"><h3>{page?.h}</h3>{page?.b}</div>
              </div>
            )}
            {cur && <div className="lw-nav"><button disabled={pg === 0} onClick={() => setPg(pg - 1)}>◀ Previous</button><span>Page {pg + 1} of {cur.pages.length}</span><button disabled={pg >= cur.pages.length - 1} onClick={() => setPg(pg + 1)}>Next ▶</button></div>}
          </div>
        </div>
      )}
    </div>
  );
}
