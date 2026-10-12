-- 0005 progression, campus jobs and Campus Wars contributions (Phase 6-7). Rules live in packages/domain/src/{progression,jobs}.ts and apps/api/src/{progress,wars}.ts.
INSERT INTO achievements (id, title, description, reputation, reward_item_id) VALUES
  ('regular', 'Regular', 'Played on three days in a row.', 3, NULL),
  ('hired', 'Hired!', 'Started your first campus job.', 3, NULL);

CREATE TABLE player_progress (
  user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE, streak int NOT NULL DEFAULT 0 CHECK (streak >= 0), best_streak int NOT NULL DEFAULT 0,
  last_active_day date, job_id text, shifts_worked int NOT NULL DEFAULT 0, quiz_correct int NOT NULL DEFAULT 0, hunts_done int NOT NULL DEFAULT 0,
  reaction_plays int NOT NULL DEFAULT 0, reaction_best_ms int, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE daily_quests (
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE, day date NOT NULL, quest_id text NOT NULL, progress int NOT NULL DEFAULT 0 CHECK (progress >= 0),
  claimed_at timestamptz, PRIMARY KEY (user_id, day, quest_id)
);
-- Append-only: every Campus Wars point is a row, so any season score can be recomputed and audited. Rule version is stored with each row.
CREATE TABLE war_contributions (
  id uuid PRIMARY KEY, season text NOT NULL, rule_version int NOT NULL, user_id uuid NOT NULL REFERENCES users (id), campus_id text NOT NULL REFERENCES campuses (id),
  source text NOT NULL, points int NOT NULL CHECK (points > 0), day date NOT NULL, idempotency_key text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season, user_id, idempotency_key)
);
CREATE INDEX war_contributions_season_idx ON war_contributions (season, campus_id);
CREATE TRIGGER war_contributions_immutable BEFORE UPDATE OR DELETE ON war_contributions FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TABLE war_season_snapshots (
  season text PRIMARY KEY, rule_version int NOT NULL, standings jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE event_checkins (
  occurrence_key text NOT NULL, user_id uuid NOT NULL REFERENCES users (id), created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (occurrence_key, user_id)
);
