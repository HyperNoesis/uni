"use client";
import type { PlayerProfile } from "@campus/domain";
import { PassCard } from "./GateCheck";

export type GateUiState = { phase: string; line: string | null; speaker: string | null; tapReady: boolean; passed: boolean };
const STEPS = ["Greeting", "Your pass", "Check", "Welcome"] as const;
/** Which step of the ceremony each controller phase belongs to (0 = not started). */
export const stepOf = (phase: string): number => (phase === "call" || phase === "ask" ? 1 : phase === "offer" || phase === "give" ? 2 : phase === "inspect" ? 3 : phase === "approve" || phase === "open" || phase === "through" ? 4 : 0);

/** Everything the player sees on top of the 3D gate scene: intro title, controls hint, the security card, and the welcome. Pure presentation. */
export function GateUI(p: { ui: GateUiState; profile: PlayerProfile | null; campus: string; introOn: boolean; moved: boolean; onShowPass: () => void; onSkipIntro: () => void }) {
  const { ui, profile, campus, introOn } = p, step = stepOf(ui.phase), active = step > 0 && ui.phase !== "done";
  return (
    <>
      {introOn && (
        <div className="gate-intro" aria-live="polite">
          <div className="gate-intro-title"><small>Welcome to</small><b>Rejuvini Campus</b><span>Grand Gate</span></div>
          <button type="button" className="gate-skip" onClick={p.onSkipIntro}>Skip <kbd>any key</kbd></button>
        </div>
      )}
      {!introOn && !active && !ui.passed && !p.moved && (
        <div className="gate-controls" role="note"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> walk</span><span><kbd>Q</kbd><kbd>R</kbd> look</span><em>Walk up to the gate to get in</em></div>
      )}
      {!introOn && active && (
        <section className="gate-card" aria-label="Campus gate security check" data-step={step}>
          <ol className="gate-steps" aria-label="Progress">
            {STEPS.map((s, i) => (<li key={s} className={i + 1 < step ? "done" : i + 1 === step ? "now" : ""} aria-current={i + 1 === step ? "step" : undefined}><i aria-hidden="true">{i + 1 < step ? "✓" : i + 1}</i><span>{s}</span></li>))}
          </ol>
          <div className="gate-line" role="status" aria-live="polite">
            {ui.line ? (<><span className="gate-who"><i aria-hidden="true" />{ui.speaker ?? "Gate Security"}</span><p>{ui.line}</p></>) : (<p className="soft">{step >= 4 ? "You're all set." : "One moment…"}</p>)}
          </div>
          {ui.tapReady && (
            <div className="gate-pocket">
              <div className="gate-pocket-row" aria-label="Your pocket holds one item"><span className="gate-pocket-ico" aria-hidden="true" /><div><b>In your pocket</b><small>Campus Pass · just the one</small></div></div>
              <button type="button" className="gate-cta" onClick={p.onShowPass}>Show my Campus Pass<kbd>E</kbd></button>
            </div>
          )}
          {step >= 4 && profile && (<div className="gate-welcome"><PassCard profile={profile} campus={campus} verified /><p>Welcome, <b>{profile.displayName.split(" ")[0]}</b>. Your pass stays in your phone whenever you need it.</p></div>)}
        </section>
      )}
    </>
  );
}
