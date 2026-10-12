"use client";
import { HudIcon } from "./HudIcons";
import { useEffect, useState } from "react";
import type { ProgressResponse } from "@campus/domain";
import { api } from "../lib/api";

/** In-world "Today's Tasks" list (top-left HUD). Read-only; claiming happens on Home. */
export function TasksPanel({ refreshKey, onClose }: { refreshKey: number; onClose: () => void }) {
  const [p, setP] = useState<ProgressResponse | null>(null);
  useEffect(() => { let live = true; const load = () => api.progress().then((r) => live && setP(r)).catch(() => {}); void load(); const t = setInterval(load, 20_000); return () => { live = false; clearInterval(t); }; }, [refreshKey]);
  return (
    <aside className="tasks-panel" aria-label="Today's tasks">
      <header><b>Today&apos;s Tasks</b><button className="x" onClick={onClose} aria-label="Hide tasks"><HudIcon n="close" /></button></header>
      {!p ? <p className="muted small">Loading…</p> : (
        <ul>
          {p.quests.map((q) => <li key={q.id} className={q.progress >= q.target ? "done" : ""}><span className="chk" aria-hidden="true">{q.progress >= q.target ? "✓" : ""}</span><span>{q.title}</span><small>{q.progress}/{q.target}</small></li>)}
        </ul>)}
      {p?.quests.some((q) => q.progress >= q.target && !q.claimed) && <p className="small claimable"><HudIcon n="gift" /> Reward ready: claim it on Home</p>}
    </aside>
  );
}
