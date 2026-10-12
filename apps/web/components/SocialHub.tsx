"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { CAMPUSES, REPORT_REASONS, SOCIAL, type ChatMessage, type GroupView, type PublicPlayer, type SocialOverview } from "@campus/domain";
import { api } from "../lib/api";

type Tab = "friends" | "find" | "groups" | "safety";
type Thread = { kind: "dm" | "group"; id: string; title: string };
type Found = PublicPlayer & { relation: "friend" | "incoming" | "outgoing" | "none" };
type Err = { message?: string };
const REASON_LABEL: Record<string, string> = { harassment: "Harassment or bullying", spam: "Spam", inappropriate_name: "Inappropriate name", inappropriate_chat: "Inappropriate chat", cheating: "Cheating", other: "Something else" };
const msg = (e: unknown) => (e as Err)?.message ?? "Something went wrong. Try again.";

export function SocialHub({ me, campus }: { me: string; campus: keyof typeof CAMPUSES }) {
  const [tab, setTab] = useState<Tab>("friends");
  const [ov, setOv] = useState<SocialOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [report, setReport] = useState<{ id: string; name: string; context: string; messageId?: string } | null>(null);

  const load = useCallback(async () => { try { setOv(await api.social.overview()); setError(null); } catch { setError("Can't load your social space. Check your connection."); } }, []);
  useEffect(() => { void load(); const t = setInterval(load, 15_000); return () => clearInterval(t); }, [load]);
  const act = async (fn: () => Promise<unknown>, ok?: string) => { setNote(null); try { await fn(); if (ok) setNote(ok); await load(); } catch (e) { setNote(msg(e)); } };

  if (error && !ov) return <section className="card state" role="alert"><p>{error}</p><button className="btn" onClick={load}>Try again</button></section>;
  if (!ov) return <section className="card state" role="status">Loading…</section>;
  return (
    <div className="social">
      {ov.chatMutedUntil && <div className="card notice" role="alert">Chat is paused on your account while a moderator reviews it. It resumes {new Date(ov.chatMutedUntil).toLocaleString()}.</div>}
      <nav className="subtabs" aria-label="Social sections">
        {([["friends", `Friends${ov.incoming.length ? ` (${ov.incoming.length})` : ""}`], ["find", "Find"], ["groups", "Groups"], ["safety", "Safety"]] as [Tab, string][]).map(([k, l]) => (
          <button key={k} className="subtab" aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>))}
      </nav>
      {note && <p className="ok-msg" role="status">{note}</p>}

      {tab === "friends" && (<>
        {ov.incoming.length > 0 && <section className="card"><h3>Requests</h3><ul className="plist">{ov.incoming.map((p) => (
          <li key={p.id}><b>{p.name}</b><small>{CAMPUSES[p.campus as keyof typeof CAMPUSES]?.name}</small>
            <span className="acts"><button className="btn" onClick={() => act(() => api.social.respond(p.id, true), `You and ${p.name} are friends.`)}>Accept</button>
              <button className="btn ghost" onClick={() => act(() => api.social.respond(p.id, false))}>Decline</button></span></li>))}</ul></section>}
        <section className="card"><h3>Friends</h3>
          {ov.friends.length === 0 ? <p className="muted">No friends yet. Use Find to look someone up, or add people you meet in the plaza.</p> :
            <ul className="plist">{ov.friends.map((p) => (
              <li key={p.id}><span className={`dot ${p.online ? "on" : ""}`} aria-label={p.online ? "online" : "offline"} /><b>{p.name}</b><small>{p.online ? "Online" : "Offline"}</small>
                <span className="acts"><button className="btn" onClick={() => setThread({ kind: "dm", id: p.id, title: p.name })}>Chat</button>
                  <button className="btn ghost" onClick={() => act(() => api.social.remove(p.id), `${p.name} removed.`)}>Remove</button></span></li>))}</ul>}
          {ov.outgoing.length > 0 && <p className="muted">Pending: {ov.outgoing.map((p) => p.name).join(", ")}</p>}
        </section></>)}

      {tab === "find" && <Find onAct={act} onReport={(p) => setReport({ id: p.id, name: p.name, context: "profile" })} />}
      {tab === "groups" && <Groups campus={campus} mine={ov.groups} onAct={act} onOpen={(g) => setThread({ kind: "group", id: g.id, title: g.name })} />}

      {tab === "safety" && (
        <section className="card"><h3>Blocked</h3>
          {ov.blocked.length === 0 ? <p className="muted">Nobody blocked. Blocking hides you from each other everywhere: chat, search, and the world.</p> :
            <ul className="plist">{ov.blocked.map((p) => <li key={p.id}><b>{p.name}</b><span className="acts"><button className="btn ghost" onClick={() => act(() => api.social.block(p.id, false), `${p.name} unblocked.`)}>Unblock</button></span></li>)}</ul>}
          <h3>Muted in chat</h3>
          {ov.muted.length === 0 ? <p className="muted">Muting hides someone&apos;s messages from you only.</p> :
            <ul className="plist">{ov.muted.map((p) => <li key={p.id}><b>{p.name}</b><span className="acts"><button className="btn ghost" onClick={() => act(() => api.social.mute(p.id, false))}>Unmute</button></span></li>)}</ul>}
          <p className="muted">Chat never allows links, emails or phone numbers. Only friends can message you privately. Reports go to a moderator.</p>
        </section>)}

      {thread && <Chat key={thread.kind + thread.id} me={me} thread={thread} onClose={() => setThread(null)}
        onBlock={(id, n) => act(async () => { await api.social.block(id, true); setThread(null); }, `${n} blocked.`)}
        onMute={(id, n) => act(() => api.social.mute(id, true), `${n} muted.`)}
        onReport={(m) => setReport({ id: m.from, name: m.fromName, context: thread.kind === "dm" ? "chat" : "group", messageId: m.id })} />}
      {report && <ReportSheet target={report} onClose={() => setReport(null)} onDone={() => { setReport(null); setNote("Report sent. A moderator will review it."); }} onBlock={() => act(async () => { await api.social.block(report.id, true); setReport(null); }, `${report.name} blocked.`)} />}
    </div>
  );
}

function Find({ onAct, onReport }: { onAct: (fn: () => Promise<unknown>, ok?: string) => Promise<void>; onReport: (p: Found) => void }) {
  const [q, setQ] = useState(""), [res, setRes] = useState<Found[] | null>(null), [err, setErr] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const run = async () => { setBusy(true); setErr(null); try { setRes((await api.social.search(q.trim())).players); } catch (e) { setErr(msg(e)); } finally { setBusy(false); } };
  const rel = (p: Found) => p.relation === "friend" ? <small>Friends</small> : p.relation === "outgoing" ? <small>Requested</small> :
    <button className="btn" onClick={async () => { await onAct(() => api.social.request(p.id), p.relation === "incoming" ? `You and ${p.name} are friends.` : `Request sent to ${p.name}.`); void run(); }}>{p.relation === "incoming" ? "Accept" : "Add friend"}</button>;
  return (
    <section className="card"><h3>Find players</h3>
      <form className="row" onSubmit={(e) => { e.preventDefault(); if (q.trim().length >= SOCIAL.searchMin) void run(); }}>
        <input className="input" value={q} maxLength={20} onChange={(e) => setQ(e.target.value)} placeholder="Start of a name" aria-label="Player name" />
        <button className="btn" disabled={busy || q.trim().length < SOCIAL.searchMin} style={{ flex: "0 0 auto" }}>{busy ? "…" : "Search"}</button>
      </form>
      {err && <p className="err" role="alert">{err}</p>}
      {res && (res.length === 0 ? <p className="muted">No players found.</p> :
        <ul className="plist">{res.map((p) => <li key={p.id}><b>{p.name}</b><small>{CAMPUSES[p.campus as keyof typeof CAMPUSES]?.name}</small>
          <span className="acts">{rel(p)}<button className="btn ghost" aria-label={`Report ${p.name}`} onClick={() => onReport(p)}>Report</button></span></li>)}</ul>)}
    </section>
  );
}

function Groups({ campus, mine, onAct, onOpen }: { campus: keyof typeof CAMPUSES; mine: GroupView[]; onAct: (fn: () => Promise<unknown>, ok?: string) => Promise<void>; onOpen: (g: GroupView) => void }) {
  const [all, setAll] = useState<GroupView[] | null>(null), [name, setName] = useState(""), [desc, setDesc] = useState(""), [err, setErr] = useState<string | null>(null);
  const reload = useCallback(() => api.social.groups().then((r) => setAll(r.groups)).catch(() => setAll([])), []);
  useEffect(() => { void reload(); }, [reload, mine.length]);
  const joined = new Set(mine.map((g) => g.id));
  return (
    <>
      <section className="card"><h3>Your groups</h3>
        {mine.length === 0 ? <p className="muted">You haven&apos;t joined a group yet.</p> : <ul className="plist">{mine.map((g) => (
          <li key={g.id}><b>{g.name}</b><small>{g.members} members</small><span className="acts"><button className="btn" onClick={() => onOpen(g)}>Open chat</button>
            <button className="btn ghost" onClick={() => onAct(() => api.social.leaveGroup(g.id), "You left the group.")}>Leave</button></span></li>))}</ul>}
      </section>
      <section className="card"><h3>{CAMPUSES[campus].name} groups</h3>
        {all === null ? <p className="muted">Loading…</p> : all.filter((g) => !joined.has(g.id)).length === 0 ? <p className="muted">No other groups yet. Start one below.</p> :
          <ul className="plist">{all.filter((g) => !joined.has(g.id)).map((g) => (<li key={g.id}><b>{g.name}</b><small>{g.members} members · {g.description || "Open to your campus"}</small>
            <span className="acts"><button className="btn" onClick={() => onAct(() => api.social.joinGroup(g.id), `Joined ${g.name}.`)}>Join</button></span></li>))}</ul>}
      </section>
      <section className="card"><h3>Start a group</h3>
        <form className="stack" onSubmit={async (e) => { e.preventDefault(); setErr(null); try { await api.social.createGroup(name, desc); setName(""); setDesc(""); await onAct(async () => {}, "Group created."); void reload(); } catch (x) { setErr(msg(x)); } }}>
          <input className="input" value={name} maxLength={SOCIAL.groupName.max} onChange={(e) => setName(e.target.value)} placeholder="Group name" aria-label="Group name" />
          <input className="input" value={desc} maxLength={SOCIAL.groupDesc} onChange={(e) => setDesc(e.target.value)} placeholder="Short description (optional)" aria-label="Group description" />
          {err && <p className="err" role="alert">{err}</p>}
          <button className="btn" disabled={name.trim().length < SOCIAL.groupName.min}>Create group</button>
        </form>
      </section>
    </>
  );
}

function Chat({ me, thread, onClose, onBlock, onMute, onReport }: { me: string; thread: Thread; onClose: () => void; onBlock: (id: string, name: string) => void; onMute: (id: string, name: string) => void; onReport: (m: ChatMessage) => void }) {
  const [list, setList] = useState<ChatMessage[] | null>(null), [text, setText] = useState(""), [err, setErr] = useState<string | null>(null), [pick, setPick] = useState<ChatMessage | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const poll = useCallback(async () => { try { setList((await api.social.messages(thread.kind, thread.id)).messages); setErr(null); } catch (e) { if ((e as { status?: number }).status === 403) { setErr("You can no longer chat here."); } } }, [thread]);
  useEffect(() => { void poll(); const t = setInterval(poll, 4000); return () => clearInterval(t); }, [poll]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [list?.length]);
  const send = async (e: React.FormEvent) => { e.preventDefault(); const t = text.trim(); if (!t) return; setErr(null); try { await api.social.send(thread.kind, thread.id, t); setText(""); await poll(); } catch (x) { setErr(msg(x)); } };
  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label={`Chat with ${thread.title}`}>
      <div className="sheet-card chat">
        <header className="sheet-head"><h3>{thread.title}</h3><button className="btn ghost" onClick={onClose} aria-label="Close chat">Close</button></header>
        <div className="msgs" aria-live="polite">
          {list === null ? <p className="muted">Loading…</p> : list.length === 0 ? <p className="muted">Say hi</p> : list.map((m) => (
            <button key={m.id} className={`msg ${m.mine ? "mine" : ""}`} onClick={() => !m.mine && setPick(pick?.id === m.id ? null : m)} aria-label={m.mine ? "Your message" : `Message from ${m.fromName}. Tap for options`}>
              {thread.kind === "group" && !m.mine && <small>{m.fromName}</small>}<span>{m.text}</span></button>))}
          <div ref={end} />
        </div>
        {pick && <div className="pickbar"><span>{pick.fromName}</span>
          <button className="btn ghost" onClick={() => { onReport(pick); setPick(null); }}>Report</button>
          <button className="btn ghost" onClick={() => { onMute(pick.from, pick.fromName); setPick(null); }}>Mute</button>
          <button className="btn ghost" onClick={() => onBlock(pick.from, pick.fromName)}>Block</button></div>}
        {err && <p className="err" role="alert">{err}</p>}
        <form className="row composer" onSubmit={send}>
          <input className="input" value={text} maxLength={SOCIAL.chatMax} onChange={(e) => setText(e.target.value)} placeholder="Message (no links or contact info)" aria-label="Message" />
          <button className="btn" disabled={!text.trim()} style={{ flex: "0 0 auto" }}>Send</button>
        </form>
        {thread.kind === "dm" && <div className="pickbar"><span>{thread.title}</span>
          <button className="btn ghost" onClick={() => onReport({ id: "", from: thread.id, fromName: thread.title, text: "", at: "", mine: false })}>Report</button>
          <button className="btn ghost" onClick={() => onBlock(thread.id, thread.title)}>Block</button></div>}
      </div>
    </div>
  );
}

function ReportSheet({ target, onClose, onDone, onBlock }: { target: { id: string; name: string; context: string; messageId?: string }; onClose: () => void; onDone: () => void; onBlock: () => void }) {
  const [reason, setReason] = useState<string>(REPORT_REASONS[0]), [note, setNote] = useState(""), [err, setErr] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const submit = async () => { setBusy(true); setErr(null); try { await api.social.report({ playerId: target.id, reason, context: target.context, note, ...(target.messageId ? { messageId: target.messageId } : {}) }); onDone(); } catch (e) { setErr(msg(e)); } finally { setBusy(false); } };
  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label={`Report ${target.name}`}>
      <div className="sheet-card"><header className="sheet-head"><h3>Report {target.name}</h3><button className="btn ghost" onClick={onClose}>Cancel</button></header>
        <label className="stack">Why are you reporting?
          <select className="input" value={reason} onChange={(e) => setReason(e.target.value)}>{REPORT_REASONS.map((r) => <option key={r} value={r}>{REASON_LABEL[r]}</option>)}</select></label>
        <label className="stack">Anything else a moderator should know? (optional)
          <textarea className="input bio" value={note} maxLength={SOCIAL.reportNoteMax} onChange={(e) => setNote(e.target.value)} /></label>
        {err && <p className="err" role="alert">{err}</p>}
        <div className="row"><button className="btn" disabled={busy} onClick={submit}>{busy ? "Sending…" : "Send report"}</button><button className="btn ghost" onClick={onBlock}>Block instead</button></div>
      </div>
    </div>
  );
}
