// Typed product analytics. Anonymous session ids only; anything that looks like personal data is rejected.
export const EVENT_NAMES = [
  "landing_viewed", "play_started", "avatar_created", "campus_joined", "first_activity_completed", "activity_started", "activity_completed",
  "zone_joined", "friend_added", "group_joined", "message_sent", "event_rsvped", "report_created", "user_blocked", "reward_granted", "quest_claimed", "level_up", "job_started", "shift_completed", "event_checked_in",
  "day_1_return", "day_7_return", "weekly_meaningful_session",
  "currency_earned", "item_earned", "item_purchased",
  "creator_opened", "draft_created", "package_published",
  "client_error", "websocket_disconnect", "slow_api", "low_fps_sample",
] as const;
export type EventName = (typeof EVENT_NAMES)[number];
export type Props = Record<string, string | number | boolean>;

export interface AnalyticsRecord { event: EventName; sessionId: string; at: string; version: 1; props: Props }
export interface Sink { send(record: AnalyticsRecord): void }

const PII_KEY = /email|phone|name|address|password|token|ip$/i;

export class PiiError extends Error {}

export function assertNoPii(props: Props): void {
  for (const k of Object.keys(props)) if (PII_KEY.test(k)) throw new PiiError(`analytics property "${k}" looks like personal data`);
}

export function createTracker(opts: { sink: Sink; sessionId: string; now?: () => Date }) {
  const now = opts.now ?? (() => new Date());
  return {
    track(event: EventName, props: Props = {}): void {
      assertNoPii(props);
      opts.sink.send({ event, sessionId: opts.sessionId, at: now().toISOString(), version: 1, props });
    },
  };
}

export const consoleSink: Sink = { send: (r) => process.stdout.write(JSON.stringify({ analytics: r }) + "\n") };
export function memorySink(): Sink & { records: AnalyticsRecord[] } {
  const records: AnalyticsRecord[] = [];
  return { records, send: (r) => void records.push(r) };
}
