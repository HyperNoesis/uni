"use client";
import { HudIcon } from "./HudIcons";
import { useCallback, useEffect, useState } from "react";
import { achievementById, type JobsResponse } from "@campus/domain";
import { api } from "../lib/api";

/** Job Center: lists jobs, shows level gates and lets the player apply. The server enforces level and proximity. */
export function JobsSheet({ onClose }: { onClose: () => void }) {
  const [d, setD] = useState<JobsResponse | null>(null), [err, setErr] = useState<string | null>(null), [note, setNote] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const load = useCallback(() => api.jobs().then((r) => { setD(r); setErr(null); }).catch((e) => setErr((e as Error).message || "Can't load jobs.")), []);
  useEffect(() => { void load(); }, [load]);
  const apply = async (id: string, title: string) => {
    setBusy(true); setNote(null);
    try { const r = await api.applyJob(id); setD(r); setNote(`You're now a ${title}! Go to its workplace and work a shift.${r.newlyUnlocked?.length ? `  ${r.newlyUnlocked.map((a) => achievementById(a)?.title ?? a).join(", ")}` : ""}`); }
    catch (e) { setNote((e as Error).message || "Couldn't apply."); } finally { setBusy(false); }
  };
  const quit = async () => { setBusy(true); try { setD(await api.quitJob()); setNote("You left your job."); } catch (e) { setNote((e as Error).message); } finally { setBusy(false); } };
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Job Center">
      <div className="card panel-box jobs-sheet">
        <header className="shift-head"><h3><HudIcon n="briefcase" /> Job Center</h3><button className="btn ghost" onClick={onClose}>Close</button></header>
        {err && <><p className="err" role="alert">{err}</p><button className="btn" onClick={load}>Try again</button></>}
        {!d && !err && <p className="muted" role="status">Loading jobs…</p>}
        {d && <>
          <p className="muted small">Level {d.level} · {d.shiftsLeft} paid shifts left today. Work a shift at your job&apos;s workplace to earn Campus Coins.</p>
          <ul className="job-list">
            {d.jobs.map((j) => (
              <li key={j.id} className={j.current ? "current" : ""}>
                <span className="job-ico" aria-hidden="true">{j.icon}</span>
                <div><b>{j.title}</b><small>{j.blurb}</small><small><HudIcon n="pin" /> {j.siteName} · up to {Math.round(j.basePay * 1.2)} coins / shift</small></div>
                {j.current ? <span className="claimed">✓ Your job</span>
                  : j.locked ? <span className="muted"><HudIcon n="lock" /> Level {j.minLevel}</span>
                  : <button className="btn accent" disabled={busy} onClick={() => apply(j.id, j.title)}>Apply</button>}
              </li>))}
          </ul>
          {note && <p className="ok-msg" role="status">{note}</p>}
          {d.currentJobId && <button className="btn ghost" disabled={busy} onClick={quit}>Quit current job</button>}
        </>}
      </div>
    </div>
  );
}
