"use client";
import { useEffect, useState } from "react";
import { getItem, CAMPUSES, type PlayerProfile, type InventoryResponse } from "@campus/domain";
import { api } from "../lib/api";
import { SocialHub } from "./SocialHub";
import { PassCard } from "./GateCheck";

type View = null | "pocket" | "phone";
type App = "home" | "chats" | "pass" | "wallet";
const Ico = ({ d }: { d: string }) => <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
const BAG = "M7 8V6a5 5 0 0110 0v2M5 8h14l1 12H4zM9 13h6";
const PHONE = "M8 2h8a2 2 0 012 2v16a2 2 0 01-2 2H8a2 2 0 01-2-2V4a2 2 0 012-2zM11 18h2";
const CHAT = "M4 5h16v11H9l-5 4z";

/** Right-edge launchers + the pocket (items you carry) and the phone (chats, pass, wallet). Chats reuse the safe social stack (friends-only DMs, block/report). */
export function PocketPhone({ profile, onOpenChange }: { profile: PlayerProfile; onOpenChange: (open: boolean) => void }) {
  const [view, setView] = useState<View>(null);
  const [app, setApp] = useState<App>("home");
  const [inv, setInv] = useState<InventoryResponse["items"] | null>(null);
  const [err, setErr] = useState(false);
  const [now, setNow] = useState("");
  useEffect(() => { onOpenChange(view !== null); }, [view, onOpenChange]);
  useEffect(() => { const f = () => setNow(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })); f(); const t = setInterval(f, 15_000); return () => clearInterval(t); }, []);
  useEffect(() => { if (view !== "pocket") return; setErr(false); api.inventory().then((r) => setInv(r.items)).catch(() => setErr(true)); }, [view]);
  const open = (v: View) => { setView(v); setApp("home"); };
  return (<>
    <div className="pp-launch">
      <button className="pp-btn" onClick={() => open("pocket")} aria-label="Open pocket"><Ico d={BAG} /><small>Pocket</small></button>
      <button className="pp-btn" onClick={() => open("phone")} aria-label="Open phone"><Ico d={PHONE} /><small>Phone</small></button>
    </div>
    {view === "pocket" && (
      <div className="pp-scrim" onClick={() => setView(null)}><section className="pp-pocket" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Pocket">
        <header><h3>Pocket</h3><button className="btn ghost" onClick={() => setView(null)}>Close</button></header>
        <div className="pp-stats"><span>Coins <b>{profile.coins}</b></span><span>Reputation <b>{profile.reputation}</b></span></div>
        <div className="pp-grid">
          <button className="pp-item" onClick={() => open("phone")}><Ico d={PHONE} /><b>Phone</b><small>Chats, pass</small></button>
          <button className="pp-item" onClick={() => { setView("phone"); setApp("pass"); }}><Ico d={CHAT} /><b>Campus Pass</b><small>{profile.displayName}</small></button>
          {inv?.map((it) => { const d = getItem(it.itemId); return <div className="pp-item" key={it.itemId}><i className="pp-swatch" style={{ background: d?.color ?? "#5b6b94", borderColor: d?.accent ?? "#fff" }} /><b>{d?.name ?? it.itemId}</b><small>x{it.qty}</small></div>; })}
        </div>
        {err && <p className="muted" role="alert">Can't load your items. Check your connection.</p>}
        {!err && inv && inv.length === 0 && <p className="muted">Nothing else yet. Items from activities and the shop show up here.</p>}
        {!err && !inv && <p className="muted" role="status">Loading…</p>}
      </section></div>)}
    {view === "phone" && (
      <div className="pp-scrim" onClick={() => setView(null)}><section className="pp-phone" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Phone">
        <div className="pp-status"><span>{now}</span><span>CAMPUS Net</span></div>
        {app === "home" && <div className="pp-home">
          <h3>Hello, {profile.displayName}</h3>
          <div className="pp-apps">
            <button onClick={() => setApp("chats")}><i style={{ background: "#25d366" }}><Ico d={CHAT} /></i>Chats</button>
            <button onClick={() => setApp("pass")}><i style={{ background: "#2f6bff" }}><Ico d="M3 6h18v12H3zM7 10h4M7 14h6" /></i>Pass</button>
            <button onClick={() => setApp("wallet")}><i style={{ background: "#e8a24a" }}><Ico d="M3 7h18v12H3zM3 7l2-3h14l2 3M16 13h2" /></i>Wallet</button>
          </div></div>}
        {app !== "home" && <header className={`pp-bar ${app}`}><button onClick={() => setApp("home")} aria-label="Back">‹</button><b>{app === "chats" ? "Chats" : app === "pass" ? "Campus Pass" : "Wallet"}</b></header>}
        {app === "chats" && <div className="pp-chats"><SocialHub me={profile.id} campus={profile.campus as keyof typeof CAMPUSES} /></div>}
        {app === "pass" && <div className="pp-page"><PassCard profile={profile} /><p className="muted">Show this at the Main Gate. It is yours alone.</p></div>}
        {app === "wallet" && <div className="pp-page"><div className="pp-stats big"><span>Campus Coins <b>{profile.coins}</b></span><span>Reputation <b>{profile.reputation}</b></span></div><p className="muted">Coins are game-only and can't be cashed out.</p></div>}
        <button className="pp-close" onClick={() => setView(null)} aria-label="Close phone" />
      </section></div>)}
  </>);
}
