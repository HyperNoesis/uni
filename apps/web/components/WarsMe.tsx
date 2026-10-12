"use client";
import { useEffect, useState } from "react";
import { api } from "../lib/api";

type Wars = Awaited<ReturnType<typeof api.campusWars>>;
const LABEL: Record<string, string> = { quiz: "Quiz", reaction: "Reaction", hunt: "Hunt", event: "Events", social: "Social", quest: "Quests", job: "Jobs" };

/** My contribution, how scoring works, last week's winner and a share button. All numbers come from the server. */
export function WarsMe({ wars, campusName }: { wars: Wars | null; campusName: string }) {
  const [last, setLast] = useState<string | null>(null), [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { api.campusWarsHistory().then((h) => { const r = h.seasons[0]; const w = r?.standings.find((s) => s.rank === 1); setLast(w ? `${r!.season}: ${w.campus.replace(/_/g, " ")} won with ${w.score} avg points` : null); }).catch(() => {}); }, []);
  if (!wars?.me) return null;
  const me = wars.me, mine = wars.entries.find((e) => e.campus === me.campus), used = me.today.total, cap = me.today.cap;
  const share = async () => {
    const rank = mine?.rank ? `#${mine.rank}` : "rising";
    const text = `I'm repping ${campusName} in CAMPUS Campus Wars. We're ${rank} with ${mine?.score ?? 0} avg points per player. Join us!`;
    const url = typeof window !== "undefined" ? window.location.origin : "";
    try {
      if (navigator.share) await navigator.share({ title: "CAMPUS Campus Wars", text, url });
      else { await navigator.clipboard.writeText(`${text} ${url}`); setMsg("Copied! Paste it anywhere to invite friends."); }
    } catch { /* cancelled share */ }
  };
  return (
    <section className="card wars-me">
      <div className="wars-me-top">
        <div><p className="eyebrow">YOUR CONTRIBUTION</p><h3>{me.points} pts this week</h3>
          <p className="muted small">{me.campusRank ? `You're #${me.campusRank} of ${me.campusContributors} contributors at ${campusName}.` : "Earn your first point: play an activity, work a shift or make a friend."}</p></div>
        <button className="btn accent" onClick={share}>Share my campus</button>
      </div>
      <div className="bar" role="progressbar" aria-valuenow={used} aria-valuemin={0} aria-valuemax={cap}><i style={{ width: `${(used / cap) * 100}%` }} /></div>
      <p className="muted small">{used}/{cap} points added today. The daily cap keeps it fair for everyone.</p>
      <div className="chips">{Object.entries(me.bySource).map(([k, v]) => <span key={k} className="chip">{LABEL[k] ?? k} · {v}</span>)}</div>
      <details><summary>How scoring works</summary><p className="muted small">{wars.scoring.explanation}</p></details>
      {last && <p className="muted small">Last season: {last}</p>}
      {msg && <p className="ok-msg" role="status">{msg}</p>}
    </section>
  );
}
