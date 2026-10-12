import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { EventName, Props } from "@campus/analytics";
import type { Store } from "./store";
import { grant } from "./progress-routes";

interface EventSpec {
  id: string;
  title: string;
  description: string;
  location: string;
  category: "social" | "learning" | "sports" | "creator";
  weekdayUtc: number;
  hourUtc: number;
  minuteUtc: number;
  durationMinutes: number;
  icon: string;
}

// Recurring community events are deterministic UTC schedules; clients render in local time.
// These are lightweight official events, not free-form user-generated event listings.
const EVENT_SPECS: readonly EventSpec[] = [
  { id: "study-circle", title: "Campus Study Circle", description: "Bring one question, share one useful tip, and meet students who enjoy learning together.", location: "Library Steps", category: "learning", weekdayUtc: 2, hourUtc: 17, minuteUtc: 0, durationMinutes: 60, icon: "📚" },
  { id: "sports-social", title: "Sports Ground Social", description: "Find teammates, trade friendly challenges, and warm up for future campus sports games.", location: "Sports Ground", category: "sports", weekdayUtc: 4, hourUtc: 16, minuteUtc: 0, durationMinutes: 60, icon: "🏀" },
  { id: "creator-showcase", title: "Creator Showcase", description: "Share a campus-safe idea, celebrate student creativity, and discover what other players are making.", location: "Creator Hub", category: "creator", weekdayUtc: 6, hourUtc: 15, minuteUtc: 0, durationMinutes: 75, icon: "🎨" },
  { id: "campus-fest", title: "Campus Fest", description: "A weekly campus gathering with emotes, music-themed moments, and a chance to meet new people.", location: "Event Arena", category: "social", weekdayUtc: 0, hourUtc: 16, minuteUtc: 0, durationMinutes: 90, icon: "🎉" },
];

function occurrence(spec: EventSpec, nowMs: number) {
  const today = new Date(nowMs);
  const delta = (spec.weekdayUtc - today.getUTCDay() + 7) % 7;
  let start = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + delta, spec.hourUtc, spec.minuteUtc);
  let end = start + spec.durationMinutes * 60_000;
  let status: "upcoming" | "live" = "upcoming";
  if (nowMs >= start && nowMs < end) {
    status = "live";
  } else if (start <= nowMs) {
    start += 7 * 86_400_000;
    end += 7 * 86_400_000;
  }
  const startsAt = new Date(start).toISOString();
  const occurrenceKey = `${spec.id}@${startsAt}`;
  return { startsAt, endsAt: new Date(end).toISOString(), status, occurrenceKey };
}

export interface EventsCtx {
  store: Store;
  now: () => number;
  who: (req: FastifyRequest) => string | null;
  deny: (reply: FastifyReply) => unknown;
  track: (sessionId: string, event: EventName, props?: Props) => void;
  season: (ms: number) => string;
}

export function registerEvents(app: FastifyInstance, c: EventsCtx): void {
  app.get("/api/v1/events", async (req, reply) => {
    const me = c.who(req);
    if (!me) return c.deny(reply);
    const events = EVENT_SPECS.map((spec) => {
      const time = occurrence(spec, c.now());
      return {
        id: spec.id, title: spec.title, description: spec.description, location: spec.location,
        category: spec.category, icon: spec.icon, startsAt: time.startsAt, endsAt: time.endsAt,
        status: time.status, rsvpCount: c.store.eventRsvpCount(time.occurrenceKey),
        rsvped: c.store.hasEventRsvp(time.occurrenceKey, me),
      };
    }).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    return { events };
  });

  // Check-in: only while an event is live, only next to the arena board (attested by realtime), once per player per occurrence.
  app.post("/api/v1/events/checkin", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const me = c.who(req);
    if (!me) return c.deny(reply);
    const t = c.now(), exp = c.store.grants.get(`${me}:arena_checkin`);
    if (!exp || exp < t) return reply.code(403).send({ error: "not_in_range", message: "Walk up to the Event Arena check-in board first." });
    const live = EVENT_SPECS.map((spec) => ({ spec, time: occurrence(spec, t) })).find((x) => x.time.status === "live");
    if (!live) return reply.code(409).send({ error: "no_live_event", message: "No event is live right now. Check the Events tab for the next one." });
    const key = `${live.time.occurrenceKey}:${me}`;
    if (!c.store.wars.checkin(key)) return reply.code(409).send({ error: "already_checked_in", message: "You're already checked in. Enjoy the event!" });
    const day = new Date(t).toISOString().slice(0, 10);
    const levelUp = grant(c.store, me, { key: `checkin:${key}`, source: "EVENT_CHECKIN", coins: 10, reputation: 2, meta: { event: live.spec.id } }, c.track);
    const warPoints = c.store.awardWarPoints(me, c.season(t), day, 15, "event", `checkin:${live.time.occurrenceKey}`, t);
    c.track(me, "event_checked_in", { event: live.spec.id });
    return { ok: true, event: live.spec.title, coins: 10, reputation: 2, warPoints, levelUp };
  });

  app.post<{ Params: { eventId: string } }>("/api/v1/events/:eventId/rsvp", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
    const me = c.who(req);
    if (!me) return c.deny(reply);
    const spec = EVENT_SPECS.find((x) => x.id === req.params.eventId);
    if (!spec) return reply.code(404).send({ error: "event_not_found" });
    const time = occurrence(spec, c.now());
    const changed = c.store.setEventRsvp(time.occurrenceKey, me, true);
    if (changed) c.track(me, "event_rsvped", { event: spec.id, status: time.status });
    return { ok: true, eventId: spec.id, startsAt: time.startsAt, status: time.status, rsvped: true, rsvpCount: c.store.eventRsvpCount(time.occurrenceKey) };
  });

  app.delete<{ Params: { eventId: string } }>("/api/v1/events/:eventId/rsvp", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
    const me = c.who(req);
    if (!me) return c.deny(reply);
    const spec = EVENT_SPECS.find((x) => x.id === req.params.eventId);
    if (!spec) return reply.code(404).send({ error: "event_not_found" });
    const time = occurrence(spec, c.now());
    c.store.setEventRsvp(time.occurrenceKey, me, false);
    return { ok: true, eventId: spec.id, startsAt: time.startsAt, status: time.status, rsvped: false, rsvpCount: c.store.eventRsvpCount(time.occurrenceKey) };
  });
}
