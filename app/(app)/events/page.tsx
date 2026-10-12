"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "../../../components/AppShell";
import { api } from "../../../lib/api";
import { WarsMe } from "../../../components/WarsMe";
import { CAMPUSES } from "@campus/domain";

type Wars = Awaited<ReturnType<typeof api.campusWars>>;
type EventList = Awaited<ReturnType<typeof api.events>>;

const ACTIVITIES = [
  { icon: "⚡", name: "Reaction Challenge", label: "LIVE", status: "live", description: "Test your reflexes at the glowing Commons board.", reward: "Coins + reputation + Campus Wars points" },
  { icon: "🧠", name: "Campus Quiz", label: "LIVE", status: "live", description: "A rotating mix of logic, science, technology and campus-life questions.", reward: "12 coins + 5 reputation + up to 10 Wars points" },
  { icon: "⚽", name: "Penalty Shootout", label: "COMING NEXT", status: "planned", description: "A skill-based football challenge with server-checked outcomes.", reward: "In development" },
  { icon: "🗺️", name: "Scavenger Hunt", label: "COMING NEXT", status: "planned", description: "Explore the campus and search for clues with your friends.", reward: "In development" },
  { icon: "🎵", name: "Rhythm Tap", label: "PLANNED", status: "planned", description: "Tap along with a short beat challenge.", reward: "Planned" },
  { icon: "📦", name: "Campus Delivery", label: "PLANNED", status: "planned", description: "Pick up and deliver parcels across campus routes.", reward: "Planned" },
] as const;

export default function Page() {
  const [wars, setWars] = useState<Wars | null>(null);
  const [events, setEvents] = useState<EventList["events"] | null>(null);
  const [failed, setFailed] = useState(false);
  const [eventsFailed, setEventsFailed] = useState(false);
  const [eventBusy, setEventBusy] = useState<Record<string, boolean>>({});
  const [eventMessage, setEventMessage] = useState("");
  const [now, setNow] = useState(Date.now());
  const load = useCallback(() => {
    setFailed(false);
    api.campusWars().then(setWars).catch(() => setFailed(true));
    setEventsFailed(false);
    api.events().then((r) => setEvents(r.events)).catch(() => setEventsFailed(true));
  }, []);
  useEffect(() => { load(); const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, [load]);

  async function updateRsvp(eventId: string, attending: boolean) {
    setEventBusy((s) => ({ ...s, [eventId]: true }));
    setEventMessage("");
    try {
      const res = await api.rsvpEvent(eventId, attending);
      setEvents((list) => list?.map((e) => e.id === eventId ? { ...e, startsAt: res.startsAt, status: res.status, rsvped: res.rsvped, rsvpCount: res.rsvpCount } : e) ?? null);
      setEventMessage(attending ? "You're on the list. See you there!" : "Your RSVP has been cancelled.");
    } catch (e) {
      const err = e as { message?: string };
      setEventMessage(err.message ?? "Couldn't update your RSVP. Please try again.");
    } finally {
      setEventBusy((s) => ({ ...s, [eventId]: false }));
    }
  }

  const remaining = wars ? Math.max(0, Date.parse(wars.season.endsAt) - now) : 0;
  const days = Math.floor(remaining / 86_400_000);
  const hours = Math.floor((remaining % 86_400_000) / 3_600_000);
  const mins = Math.floor((remaining % 3_600_000) / 60_000);
  const secs = Math.floor((remaining % 60_000) / 1000);

  return (
    <AppShell title="Campus Wars">
      {({ profile }) => (
        <div className="event-hub">
          <section className="wars-hero card">
            <div className="wars-orb" aria-hidden="true">🏆</div>
            <div className="wars-copy">
              <p className="eyebrow">THE CAMPUS LEAGUE · SEASON ACTIVE</p>
              <h2>Make your campus count.</h2>
              <p className="muted">Play verified activities, earn contribution points, and represent your campus. Every player has a daily cap, so one grinder can't run away with the season.</p>
              <div className="season-meta">
                <span className="live-dot"><i /> LIVE SEASON</span>
                <span className="pill">{wars?.season.name ?? "Weekly Campus Wars"}</span>
              </div>
              {wars && <p className="muted small">{wars.season.pointsRule}</p>}
              <Link className="btn accent" href="/play">Enter the campus world <span aria-hidden="true">↗</span></Link>
            </div>
            <div className="season-clock" aria-label="Time remaining in current Campus Wars season">
              <span className="muted small">WEEK ENDS IN</span>
              <div><b>{String(days).padStart(2, "0")}</b><small>d</small><b>{String(hours).padStart(2, "0")}</b><small>h</small></div>
              <div><b>{String(mins).padStart(2, "0")}</b><small>m</small><b>{String(secs).padStart(2, "0")}</b><small>s</small></div>
              {wars && <span className="muted small">Ends {new Date(wars.season.endsAt).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" })}</span>}
            </div>
          </section>

          <WarsMe wars={wars} campusName={CAMPUSES[profile.campus].name} />

          <section className="event-section">
            <div className="section-head"><div><p className="eyebrow">MEET UP · TAKE PART</p><h2>Campus events</h2></div><button className="btn ghost" onClick={load}>↻ Refresh</button></div>
            <p className="muted small">Weekly community events rotate automatically. Times are shown in your device's local timezone. RSVP to help everyone see the crowd forming.</p>
            {eventsFailed && <div className="state-inline card" role="alert"><span>Couldn't load the event calendar.</span><button className="btn ghost" onClick={load}>Try again</button></div>}
            {!events && !eventsFailed && <div className="state-inline card" role="status">Loading campus events…</div>}
            {eventMessage && <p className="event-feedback" role="status">{eventMessage}</p>}
            {events && <div className="event-calendar-grid">{events.map((event) => (
              <article className="event-calendar-card card" key={event.id}>
                <div className="event-calendar-top"><span className="activity-icon" aria-hidden="true">{event.icon}</span><span className={`event-live-status ${event.status}`}>{event.status === "live" ? "HAPPENING NOW" : "UPCOMING"}</span></div>
                <h3>{event.title}</h3>
                <p className="muted">{event.description}</p>
                <div className="event-meta-line"><span>📍 {event.location}</span><span>👥 {event.rsvpCount} going</span></div>
                <div className="event-time"><b>{new Date(event.startsAt).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</b><span>Ends {new Date(event.endsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></div>
                <button className={`btn ${event.rsvped ? "ghost" : "accent"}`} disabled={!!eventBusy[event.id]} onClick={() => void updateRsvp(event.id, !event.rsvped)}>{eventBusy[event.id] ? "Saving…" : event.rsvped ? "✓ Going · Cancel" : "I'm going ↗"}</button>
              </article>
            ))}</div>}
          </section>

          <section className="event-section">
            <div className="section-head"><div><p className="eyebrow">THE RANKINGS</p><h2>Campus leaderboard</h2></div><button className="btn ghost" onClick={load}>↻ Refresh</button></div>
            <p className="muted small">Ranked by average seasonal points per contributing player—not raw enrollment. Contributors and total points are shown so the scoring stays transparent.</p>
            <div className="wars-table card">
              {failed && <div className="state-inline" role="alert"><span>Couldn't load live standings.</span><button className="btn ghost" onClick={load}>Try again</button></div>}
              {!wars && !failed && <div className="state-inline" role="status">Loading the live standings…</div>}
              {wars?.entries.map((entry, index) => {
                const isMine = entry.campus === profile.campus;
                return <div key={entry.campus} className={`wars-row ${isMine ? "mine" : ""}`}>
                  <div className={`rank rank-${index + 1}`}>{entry.rank === 1 && entry.score > 0 ? "♛" : entry.rank ? String(entry.rank).padStart(2, "0") : "—"}</div>
                  <div className="campus-mark" style={{ background: entry.campus === "unity_heights" ? "#2f6bff" : entry.campus === "lagoon_tech" ? "#1fb7c9" : "#e8a24a" }}>{entry.name.slice(0, 1)}</div>
                  <div className="campus-info"><b>{entry.name}{isMine ? <span className="you-tag"> YOUR CAMPUS</span> : null}{entry.ranked === false ? <span className="you-tag rising"> RISING</span> : null}</b><span>{entry.contributors} contributors · {entry.population} registered players</span></div>
                  <div className="score-info"><b>{entry.score}</b><span>avg pts</span><small>{entry.totalPoints.toLocaleString()} total</small></div>
                </div>;
              })}
              {wars?.entries.every((entry) => entry.totalPoints === 0) && <p className="empty-score">The season has just begun. Be the first contributor for your campus.</p>}
            </div>
          </section>

          <section className="event-section">
            <div className="section-head"><div><p className="eyebrow">PLAY · EARN · REPRESENT</p><h2>Activities</h2></div><Link className="text-link" href="/play">Open world ↗</Link></div>
            <div className="activity-grid">
              {ACTIVITIES.map((a) => (
                <article className={`activity-card card ${a.status !== "live" ? "planned" : ""}`} key={a.name}>
                  <div className="activity-card-top"><span className="activity-icon" aria-hidden="true">{a.icon}</span><span className={`activity-status ${a.status}`}>{a.label}</span></div>
                  <h3>{a.name}</h3>
                  <p className="muted">{a.description}</p>
                  <div className="activity-reward">{a.reward}</div>
                  {a.status === "live" ? <Link className="btn" href="/play">Play in world →</Link> : <span className="muted small">Not playable yet</span>}
                </article>
              ))}
            </div>
          </section>

          <section className="rules-strip card">
            <span className="rules-icon">🛡️</span>
            <div><b>Fair competition, by design</b><p className="muted small">Server-checked rewards · 30 Wars points per player per UTC day · Weekly reset · No buying leaderboard points</p></div>
          </section>
        </div>
      )}
    </AppShell>
  );
}
