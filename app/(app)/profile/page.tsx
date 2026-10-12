"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ACHIEVEMENTS, BIO_MAX, CAMPUSES, DEFAULT_AVATAR, avatarEquals, checkBio, checkDisplayName, type Avatar, type IdentityResponse } from "@campus/domain";
import { AppShell } from "../../../components/AppShell";
import { AvatarBuilder } from "../../../components/AvatarBuilder";
import { api, clearToken } from "../../../lib/api";

export default function Profile() {
  const router = useRouter();
  return (
    <AppShell title="Profile">
      {() => <Identity onSignOut={() => { clearToken(); router.replace("/"); }} />}
    </AppShell>
  );
}

function Identity({ onSignOut }: { onSignOut: () => void }) {
  const [id, setId] = useState<IdentityResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [avatar, setAvatar] = useState<Avatar>(DEFAULT_AVATAR);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const adopt = (r: IdentityResponse) => { setId(r); setName(r.profile.displayName); setBio(r.profile.bio); setAvatar(r.profile.avatar); };
  const load = () => { setFailed(false); api.identity().then(adopt).catch(() => setFailed(true)); };
  useEffect(load, []);

  if (failed) return <section className="card hero-card"><p className="muted">Could not load your profile.</p><button className="btn ghost" onClick={load}>Try again</button></section>;
  if (!id) return <section className="card hero-card" aria-busy="true"><p className="muted">Loading…</p></section>;

  const p = id.profile;
  const nameCheck = checkDisplayName(name), bioCheck = checkBio(bio);
  const renaming = name.trim() !== p.displayName;
  const locked = renaming && id.renameAvailableAt !== null;
  const changed = renaming || bio !== p.bio || !avatarEquals(avatar, p.avatar);
  const problem = !nameCheck.ok ? nameCheck.message : !bioCheck.ok ? bioCheck.message : locked ? `You can change your name again on ${new Date(id.renameAvailableAt!).toLocaleDateString()}.` : "";

  async function save() {
    setBusy(true); setMsg(null);
    try {
      const patch: Parameters<typeof api.updateProfile>[0] = {};
      if (renaming && nameCheck.ok) patch.displayName = nameCheck.text;
      if (bio !== p.bio && bioCheck.ok) patch.bio = bioCheck.text;
      if (!avatarEquals(avatar, p.avatar)) patch.avatar = avatar as NonNullable<typeof patch.avatar>;
      const r = await api.updateProfile(patch);
      adopt(r);
      const names = (r.newlyUnlocked ?? []).map((u) => ACHIEVEMENTS.find((a) => a.id === u)?.title).filter(Boolean).join(", ");
      setMsg({ kind: "ok", text: names ? `Saved. Achievement unlocked: ${names}!` : "Saved." });
    } catch (e) {
      const x = e as { status?: number; message?: string };
      setMsg({ kind: "err", text: x.status === 429 || x.status === 400 ? x.message ?? "That change is not allowed." : "Could not save. Check your connection and try again." });
    } finally { setBusy(false); }
  }

  const unlocked = new Set(id.achievements.map((a) => a.id));
  return (
    <>
      <section className="card hero-card">
        <p className="eyebrow">{CAMPUSES[p.campus].name}</p>
        <h2>{p.displayName}</h2>
        <p><b>{id.title}</b> · Reputation {p.reputation} · {p.coins} Campus Coins</p>
        {id.nextTitle && <p className="muted small">{id.nextTitle.remaining} more reputation to become {id.nextTitle.title}.</p>}
      </section>

      <section className="card hero-card">
        <h3>Edit identity</h3>
        <div className="field"><label htmlFor="pn">Display name</label>
          <input id="pn" className="input" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} autoComplete="off" />
          <span className="muted small">You can change your name once a week.</span></div>
        <div className="field"><label htmlFor="pb">Bio</label>
          <textarea id="pb" className="input bio" value={bio} maxLength={BIO_MAX} rows={3} onChange={(e) => setBio(e.target.value)} placeholder="Course, hobbies, favourite jollof debate side…" />
          <span className="muted small">{bio.length}/{BIO_MAX}. No emails, phone numbers or links.</span></div>
        <AvatarBuilder value={avatar} onChange={setAvatar} />
        {(problem && changed) && <p className="err" role="alert">{problem}</p>}
        {msg && <p className={msg.kind === "ok" ? "ok-msg" : "err"} role={msg.kind === "ok" ? "status" : "alert"}>{msg.text}</p>}
        <div className="row">
          <button className="btn ghost" disabled={!changed || busy} onClick={() => { setName(p.displayName); setBio(p.bio); setAvatar(p.avatar); setMsg(null); }}>Revert</button>
          <button className="btn accent" disabled={!changed || !!problem || busy} onClick={() => void save()}>{busy ? "Saving…" : "Save changes"}</button>
        </div>
      </section>

      <section className="card hero-card">
        <h3>Achievements</h3>
        <ul className="ach">
          {ACHIEVEMENTS.map((a) => (
            <li key={a.id} className={unlocked.has(a.id) ? "got" : ""}>
              <b>{unlocked.has(a.id) ? "✓ " : "🔒 "}{a.title}</b><span>{a.description}{a.reputation || a.itemId ? ` Reward: ${[a.reputation ? `+${a.reputation} rep` : "", a.itemId ? "room item" : ""].filter(Boolean).join(", ")}.` : ""}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card hero-card">
        <button className="btn ghost" onClick={onSignOut}>Sign out</button>
        <p className="muted small">Sessions are saved on this device. Signing out removes it, so keep it if you want to resume this identity.</p>
      </section>
    </>
  );
}
