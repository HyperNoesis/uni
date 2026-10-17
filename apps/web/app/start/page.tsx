"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CAMPUS_IDS, DEFAULT_AVATAR, DisplayName, checkDisplayName, parseAvatar, type Avatar, type CampusId } from "@campus/domain";
import { api, setToken } from "../../lib/api";
import { AvatarBuilder } from "../../components/AvatarBuilder";
import { GateScene } from "../../components/GateScene";
import { BrandLockup } from "../../components/BrandMark";
import { clearDraft, readDraft, safeSession, saveDraft } from "../../lib/onboarding-draft";

const validators = { parseAvatar, campusIds: CAMPUS_IDS } as const;

export default function Start() {
  const router = useRouter();
  const [step, setStep] = useState(0); // 0 = name, 1 = look (school selection was removed: one flagship campus for now)
  const campus: CampusId = "unity_heights";
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState<Avatar>(DEFAULT_AVATAR);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    const d = readDraft(safeSession(), validators);
    if (d) { setStep(Math.min(1, Math.max(0, d.step - 1))); setName(d.name); setAvatar(d.avatar); } // drafts keep the legacy 0=campus,1=name,2=look numbering
    setRestored(true);
  }, []);
  useEffect(() => { if (restored) saveDraft(safeSession(), { step: step + 1, campus, name, avatar }); }, [restored, step, name, avatar]);

  function next() {
    setErr("");
    if (step === 0) {
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
      if (x.code === "text_rejected") { setStep(0); setErr(x.message ?? "That name is not allowed."); }
      else setErr(e instanceof Error ? e.message : "Something went wrong. Try again.");
      setBusy(false);
    }
  }

  return (
    <main className="shell" style={{ position: "relative", minHeight: "100dvh", display: "flex" }}>
      <GateScene dim />
      <div className="onb-glass">
        <div className="onb-top"><BrandLockup size={28} /><span className="onb-count">Step {step + 1} of 2</span></div>
        {step === 0 && (
          <>
            <h2>What should we call you?</h2>
            <div className="field">
              <label htmlFor="dn">Display name</label>
              <input id="dn" className="input" value={name} maxLength={20} autoFocus autoComplete="off"
                onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && next()} />
            </div>
            <div className="idcard" aria-hidden="true"><div><b>{name.trim() || "Your name"}</b><span>Student ID · Fresher</span></div></div>
          </>
        )}
        {step === 1 && (<><h2>Build your look</h2><AvatarBuilder value={avatar} onChange={setAvatar} /></>)}
        <div className="err" role="alert">{err}</div>
        <div className="row">
          {step > 0 && <button className="btn ghost" onClick={() => setStep(step - 1)} disabled={busy}>Back</button>}
          {step < 1
            ? <button className="btn" onClick={next}>Continue</button>
            : <button className="btn accent" onClick={finish} disabled={busy}>{busy ? "Entering…" : "Enter the campus"}</button>}
        </div>
      </div>
    </main>
  );
}
