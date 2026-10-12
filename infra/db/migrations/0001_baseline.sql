-- 0001 baseline: identity, economy ledger and operations tables. Runs inside one transaction (see migrate.sh).
-- Later phases add social, gameplay and creator tables as new numbered files; never edit an applied migration.

CREATE TABLE campuses (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  tagline     text NOT NULL,
  color       text NOT NULL CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'banned')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz
);

CREATE TABLE profiles (
  user_id      uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 20),
  campus_id    text NOT NULL REFERENCES campuses (id),
  avatar       jsonb NOT NULL,
  reputation   integer NOT NULL DEFAULT 0 CHECK (reputation >= 0),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX profiles_campus_idx ON profiles (campus_id);

-- Economy: fictional currency only. is_redeemable is pinned to false so cash-out cannot be modelled.
CREATE TABLE currencies (
  code          text PRIMARY KEY,
  name          text NOT NULL,
  is_redeemable boolean NOT NULL DEFAULT false CHECK (is_redeemable = false)
);

CREATE TABLE wallets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  currency_code text NOT NULL REFERENCES currencies (code),
  balance       bigint NOT NULL DEFAULT 0 CHECK (balance >= 0), -- cache; ledger_entries is the source of truth
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, currency_code)
);

CREATE TABLE ledger_entries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 200),
  actor_id        uuid NOT NULL REFERENCES users (id),
  receiver_id     uuid REFERENCES users (id),
  currency_code   text NOT NULL REFERENCES currencies (code),
  amount          bigint NOT NULL CHECK (amount <> 0),
  source_event    text NOT NULL,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (actor_id, idempotency_key)
);
CREATE INDEX ledger_entries_actor_idx ON ledger_entries (actor_id, created_at DESC);

-- Operations
CREATE TABLE audit_logs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  at             timestamptz NOT NULL DEFAULT now(),
  actor          text NOT NULL,
  action         text NOT NULL,
  target         text,
  correlation_id text,
  metadata       jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX audit_logs_at_idx ON audit_logs (at DESC);

CREATE TABLE feature_flags (
  key         text PRIMARY KEY,
  enabled     boolean NOT NULL DEFAULT false,
  description text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE job_runs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      text NOT NULL,
  job_type    text NOT NULL,
  status      text NOT NULL CHECK (status IN ('succeeded', 'retrying', 'dead')),
  attempt     integer NOT NULL CHECK (attempt >= 1),
  error       text,
  started_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX job_runs_type_idx ON job_runs (job_type, started_at DESC);

CREATE TABLE webhook_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider     text NOT NULL,
  event_id     text NOT NULL,
  payload      jsonb NOT NULL,
  received_at  timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (provider, event_id)
);

-- Append-only tables: no updates, no deletes.
CREATE FUNCTION forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END $$;
CREATE TRIGGER ledger_entries_immutable BEFORE UPDATE OR DELETE ON ledger_entries FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER audit_logs_immutable     BEFORE UPDATE OR DELETE ON audit_logs     FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- Reference data (matches packages/domain CAMPUSES).
INSERT INTO currencies (code, name) VALUES ('CAMPUS_COINS', 'Campus Coins');
INSERT INTO campuses (id, name, tagline, color) VALUES
  ('unity_heights',  'Unity Heights University',       'Where the whole country meets', '#2f6bff'),
  ('lagoon_tech',    'Lagoon Institute of Technology', 'Build fast. Ship faster.',      '#1fb7c9'),
  ('savannah_state', 'Savannah State University',      'Heat, hustle and heart',        '#e8a24a');
