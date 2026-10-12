"use client";
import { HudIcon } from "./HudIcons";
import { useEffect, useRef, useState } from "react";
import { achievementById, type ShiftFinal, type ShiftStep } from "@campus/domain";
import { api } from "../lib/api";

type Phase = { k: "loading" } | { k: "error"; msg: string } | { k: "ask"; step: ShiftStep } | { k: "reveal"; step: ShiftStep; picked: number; correctIndex: number; correct: boolean; timedOut: boolean } | { k: "final"; final: ShiftFinal; title: string };
const LETTERS = ["A", "B", "C", "D"];

/** One work shift: server-timed tasks, server-held answers, server-paid wages. This component only renders and submits choices. */
export function ShiftSheet({ onClose }: { onClose: () => void }) {
  const [ph, setPh] = useState<Phase>({ k: "loading" });
  const [left, setLeft] = useState(0);
  const busy = useRef(false);

  const start = async () => {
    setPh({ k: "loading" });
    try { setPh({ k: "ask", step: await api.shiftStart() }); } catch (e) { setPh({ k: "error", msg: (e as Error).message || "Couldn't start the shift." }); }
  };
  useEffect(() => { void start(); }, []);

  // Countdown is display only: the server decides whether an answer was in time.
  const key = ph.k === "ask" ? ph.step.runId + ph.step.index : "";
  useEffect(() => {
    if (ph.k !== "ask") return;
    const end = Date.now() + ph.step.remainingMs; busy.current = false; setLeft(ph.step.remainingMs);
    const t = setInterval(() => { const l = Math.max(0, end - Date.now()); setLeft(l); if (l === 0) { clearInterval(t); void answer(-1); } }, 100);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const answer = async (choice: number) => {
    if (ph.k !== "ask" || busy.current) return;
    busy.current = true;
    const step = ph.step;
    try {
      const r = await api.shiftAnswer(step.runId, step.index, choice);
      setPh({ k: "reveal", step, picked: choice, correctIndex: r.correctIndex, correct: r.correct, timedOut: r.timedOut });
      setTimeout(() => setPh(r.final ? { k: "final", final: r.final, title: step.jobTitle } : { k: "ask", step: r.next! }), 1000);
    } catch (e) { setPh({ k: "error", msg: (e as Error).message || "Connection problem. Try again." }); }
  };

  const step = ph.k === "ask" || ph.k === "reveal" ? ph.step : null;
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Work shift">
      <div className="card panel-box shift">
        <header className="shift-head"><h3><HudIcon n="briefcase" /> {step?.jobTitle ?? "Work shift"}</h3><button className="btn ghost" onClick={onClose} aria-label="Leave shift">Leave</button></header>
        {ph.k === "loading" && <p className="muted" role="status">Clocking in…</p>}
        {ph.k === "error" && <><p className="err" role="alert">{ph.msg}</p><div className="row"><button className="btn" onClick={start}>Retry</button><button className="btn ghost" onClick={onClose}>Back to campus</button></div></>}
        {step && (<>
          <div className="shift-meta"><span>Task {step.index + 1} / {step.total}</span><span>{ph.k === "ask" ? `${Math.ceil(left / 1000)}s` : ""}</span></div>
          <div className="shift-timer" aria-hidden="true"><i style={{ width: `${ph.k === "ask" ? (left / step.timeLimitMs) * 100 : 0}%` }} /></div>
          <p className="shift-q">{step.prompt}</p>
          <div className="shift-opts">
            {step.options.map((o, i) => {
              const state = ph.k === "reveal" ? (i === ph.correctIndex ? "right" : i === ph.picked ? "wrong" : "") : "";
              return <button key={i} className={`shift-opt ${state}`} disabled={ph.k !== "ask"} onClick={() => answer(i)}><b>{LETTERS[i]}</b><span>{o}</span></button>;
            })}
          </div>
          {ph.k === "reveal" && <p className={ph.correct ? "ok-msg" : "err"} role="status">{ph.correct ? "Nice work!" : ph.timedOut ? "Too slow." : "Not quite."}</p>}
        </>)}
        {ph.k === "final" && (
          <div className="shift-final" role="status">
            <p className="shift-score">{ph.final.correct}<small>/{ph.final.total}</small></p>
            <p className="muted">{ph.final.perfect ? "Perfect shift, great job!" : ph.final.correct >= 3 ? "Good shift." : "Rough shift. You'll do better next time."}</p>
            {ph.final.paid ? <p className="reward">+{ph.final.coins} coins{ph.final.reputation ? ` · +${ph.final.reputation} rep` : ""}</p> : <p className="muted">{ph.final.capped ? "No paid shifts left today. Come back tomorrow." : "No pay this time."}</p>}
            {ph.final.levelUp && <p className="levelup">Level up! You are now {ph.final.levelUp.title}</p>}
            {ph.final.newlyUnlocked.map((id) => <p key={id} className="levelup"><HudIcon n="medal" /> {achievementById(id)?.title ?? id}</p>)}
            {ph.final.completedQuests.length > 0 && <p className="ok-msg">Quest complete! Claim it on Home.</p>}
            <div className="row"><button className="btn accent" onClick={start}>Another shift</button><button className="btn ghost" onClick={onClose}>Back to campus</button></div>
          </div>)}
      </div>
    </div>
  );
}
