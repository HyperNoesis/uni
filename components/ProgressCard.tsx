"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { ProgressResponse } from "@campus/domain";
import { api } from "../lib/api";

/** Level, streak, job and today's quests. Everything shown is read from the server; claiming is a server call. */
export function ProgressCard({ onChange }: { onChange?: () => void }) {
  const [p, setP] = useState<ProgressResponse | null>(null), [err, setErr] = useState<string | null>(null), [note, setNote] = useState<string | null>(null), [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(() => api.progress().then((r) => { setP(r); setErr(null); }).catch(() => setErr("Can't load your progress.")), []);
  useEffect(() => { void load(); }, [load]);
  const claim = async (id: string) => {
    setBusy(id); setNote(null);
    try { const r = await api.claimQuest(id); setP(r.progress); setNote(`+${r.coins} coins · +${r.reputation} rep${r.levelUp ? ` · Level up: ${r.levelUp.title}!` : ""}`); onChange?.(); }
    catch (e) { setNote((e as Error).message); await load(); } finally { setBusy(null); }
  };
  if (err && !p) return <section className="card state" role="alert"><p>{err}</p><button className="btn" onClick={load}>Try again</button></section>;
  if (!p) return <section className="card state" role="status">Loading progress…</section>;
  const L = p.level;
  return (
    <section className="card progress">
      <div className="lvl-row">
        <div className="lvl-badge" aria-label={`Level ${L.level}`}>{L.level}</div>
        <div className="lvl-main"><b>{L.title}</b><small>{L.repForNext === null ? "Max level" : `${L.repIntoLevel} / ${L.repForNext} rep to next level`}</small>
          <div className="bar" role="progressbar" aria-valuenow={L.pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${L.pct}%` }} /></div></div>
        <div className={`streak ${p.playedToday ? "on" : ""}`} title="Days in a row"><span>Streak</span><b>{p.streak}</b></div>
      </div>
      <p className="muted small">{p.job ? `${p.job.title} · ${p.job.shiftsLeft} paid shift${p.job.shiftsLeft === 1 ? "" : "s"} left today` : "No job yet. Visit the Job Center in the Student Commons."}</p>
      <h3>Today&apos;s tasks</h3>
      <ul className="quests">
        {p.quests.map((q) => {
          const done = q.progress >= q.target;
          return (
            <li key={q.id} className={done ? "done" : ""}>
              <div><b>{q.title}</b><small>{q.blurb}</small><div className="bar thin"><i style={{ width: `${(q.progress / q.target) * 100}%` }} /></div></div>
              {q.claimed ? <span className="claimed">✓ Claimed</span>
                : done ? <button className="btn accent" disabled={busy === q.id} onClick={() => claim(q.id)}>Claim +{q.coins} coins</button>
                : <span className="muted">{q.progress}/{q.target} · {q.coins} coins</span>}
            </li>);
        })}
      </ul>
      {note && <p className="ok-msg" role="status">{note}</p>}
      <Link className="btn" href="/play">Go to campus</Link>
    </section>
  );
}
