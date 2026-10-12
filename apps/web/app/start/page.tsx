"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CAMPUSES, CAMPUS_IDS, DEFAULT_AVATAR, DisplayName, checkDisplayName, parseAvatar, type Avatar, type CampusId } from "@campus/domain";
import { api, setToken } from "../../lib/api";
import { AvatarBuilder } from "../../components/AvatarBuilder";
import { clearDraft, readDraft, safeSession, saveDraft } from "../../lib/onboarding-draft";

const validators = { parseAvatar, campusIds: CAMPUS_IDS } as const;

export default function Start() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [campus, setCampus] = useState<CampusId>("unity_heights");
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState<Avatar>(DEFAULT_AVATAR);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    const d = readDraft(safeSession(), validators);
    if (d) { setStep(d.step); setCampus(d.campus); setName(d.name); setAvatar(d.avatar); }
    setRestored(true);
  }, []);
  useEffect(() => { if (restored) saveDraft(safeSession(), { step, campus, name, avatar }); }, [restored, step, campus, name, avatar]);

  function next() {
    setErr("");
    if (step === 1) {
      const r = DisplayName.safeParse(name);
      if (!r.success) return setErr("Use 2–20 characters: letters, numbers, spaces, _ . -");
      const t = checkDisplayName(name); // same rules the server applies: reserved names, contact info, links
      if (!t.ok) return setErr(t.message);
    }
    setStep((s) => s + 1);
  }

  async function finish() {
    setBusy(true);
    setErr("");
    try {
      const res = await api.createSession({ displayName: name.trim(), campus, avatar: avatar as Parameters<typeof api.createSession>[0]["avatar"] });
      setToken(res.token);
      clearDraft(safeSession());
      router.push("/play");
    } catch (e) {
      const x = e as { code?: string; body?: { field?: string }; message?: string };
      if (x.code === "text_rejected") { setStep(1); setErr(x.message ?? "That name is not allowed."); }
      else setErr(e instanceof Error ? e.message : "Something went wrong. Try again.");
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <div className="onb">
        <div className="steps" aria-hidden="true">
          {[0, 1, 2].map((i) => <i key={i} className={i <= step ? "on" : ""} />)}
        </div>

        {step === 0 && (
          <>
            <h2>Choose your campus</h2>
            <p className="sub">You will represent it everywhere in the world.</p>
            <button type="button" className="chip" onClick={() => setCampus(CAMPUS_IDS[Math.floor(Math.random() * CAMPUS_IDS.length)]!)}>Surprise me</button>
            {CAMPUS_IDS.map((id) => (
              <button key={id} className="card campus-card" aria-pressed={campus === id} onClick={() => setCampus(id)}>
                <div className="campus-dot" style={{ background: CAMPUSES[id].color }} />
                <div><b>{CAMPUSES[id].name}</b><span>{CAMPUSES[id].tagline}</span></div>
              </button>
            ))}
          </>
        )}

        {step === 1 && (
          <>
            <h2>What should we call you?</h2>
            <div className="field">
              <label htmlFor="dn">Display name</label>
              <input id="dn" className="input" value={name} maxLength={20} autoFocus autoComplete="off"
                onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && next()} />
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h2>Build your look</h2>
            <AvatarBuilder value={avatar} onChange={setAvatar} />
          </>
        )}

        <div className="err" role="alert">{err}</div>
        <div className="row">
          {step > 0 && <button className="btn ghost" onClick={() => setStep(step - 1)} disabled={busy}>Back</button>}
          {step < 2
            ? <button className="btn" onClick={next}>Continue</button>
            : <button className="btn accent" onClick={finish} disabled={busy}>{busy ? "Entering…" : "Enter the plaza"}</button>}
        </div>
      </div>
    </main>
  );
}
