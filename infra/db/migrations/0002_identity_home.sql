-- 0002 identity, inventory, home room (Phase 2). Catalog rows are generated from packages/domain;
-- packages/domain/src/catalog-parity.test.ts fails if this file and the code drift apart.
ALTER TABLE profiles ADD COLUMN bio text NOT NULL DEFAULT '' CHECK (char_length(bio) <= 140), ADD COLUMN renamed_at timestamptz;

CREATE TABLE items (
  id text PRIMARY KEY, name text NOT NULL,
  layer text NOT NULL CHECK (layer IN ('floor', 'object', 'wall')),
  width smallint NOT NULL CHECK (width >= 1), height smallint NOT NULL CHECK (height >= 1),
  source text NOT NULL CHECK (source IN ('starter', 'achievement', 'shop')),
  campus_id text REFERENCES campuses (id)
);
CREATE TABLE inventories (
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE, item_id text NOT NULL REFERENCES items (id),
  quantity integer NOT NULL CHECK (quantity > 0), updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (user_id, item_id)
);
-- Append-only audit of every item that entered an inventory; the idempotency key makes grants replay-safe.
CREATE TABLE item_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  item_id text NOT NULL REFERENCES items (id), quantity integer NOT NULL CHECK (quantity > 0), source text NOT NULL,
  idempotency_key text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 1 AND 200), created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key)
);
CREATE INDEX item_grants_user_idx ON item_grants (user_id, created_at DESC);
-- One room per player; `revision` powers optimistic concurrency (stale saves get HTTP 409).
CREATE TABLE home_layouts (
  user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE, layout jsonb NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision >= 1), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE achievements (
  id text PRIMARY KEY, title text NOT NULL, description text NOT NULL,
  reputation integer NOT NULL DEFAULT 0 CHECK (reputation >= 0), reward_item_id text REFERENCES items (id)
);
CREATE TABLE achievement_unlocks (
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE, achievement_id text NOT NULL REFERENCES achievements (id),
  unlocked_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (user_id, achievement_id)
);
CREATE TRIGGER item_grants_immutable BEFORE UPDATE OR DELETE ON item_grants FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER achievement_unlocks_immutable BEFORE UPDATE OR DELETE ON achievement_unlocks FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

INSERT INTO items (id, name, layer, width, height, source, campus_id) VALUES
  ('rug_blue', 'Blue Rug', 'floor', 4, 3, 'starter', NULL),
  ('bed_single', 'Single Bed', 'object', 2, 3, 'starter', NULL),
  ('desk', 'Study Desk', 'object', 2, 1, 'starter', NULL),
  ('chair', 'Desk Chair', 'object', 1, 1, 'starter', NULL),
  ('bookshelf', 'Bookshelf', 'object', 2, 1, 'starter', NULL),
  ('lamp', 'Reading Lamp', 'object', 1, 1, 'starter', NULL),
  ('plant', 'Potted Plant', 'object', 1, 1, 'starter', NULL),
  ('beanbag', 'Bean Bag', 'object', 1, 1, 'starter', NULL),
  ('speaker', 'Speaker', 'object', 1, 1, 'starter', NULL),
  ('window', 'Window', 'wall', 2, 1, 'starter', NULL),
  ('poster_study', 'Study Poster', 'wall', 1, 1, 'starter', NULL),
  ('banner_unity_heights', 'Unity Heights Banner', 'wall', 1, 1, 'starter', 'unity_heights'),
  ('banner_lagoon_tech', 'Lagoon Tech Banner', 'wall', 1, 1, 'starter', 'lagoon_tech'),
  ('banner_savannah_state', 'Savannah State Banner', 'wall', 1, 1, 'starter', 'savannah_state'),
  ('poster_football', 'Match Day Poster', 'wall', 1, 1, 'achievement', NULL),
  ('lamp_neon', 'Neon Lamp', 'object', 1, 1, 'achievement', NULL),
  ('typewriter', 'Typewriter', 'object', 1, 1, 'achievement', NULL),
  ('trophy_case', 'Trophy Case', 'object', 1, 1, 'achievement', NULL);

INSERT INTO achievements (id, title, description, reputation, reward_item_id) VALUES
  ('first_steps', 'First Steps', 'Created your CAMPUS identity.', 0, NULL),
  ('fresh_look', 'Fresh Look', 'Changed your look.', 2, 'poster_football'),
  ('home_sweet_home', 'Home Sweet Home', 'Placed 5 items in your room.', 3, 'lamp_neon'),
  ('storyteller', 'Storyteller', 'Wrote your bio.', 2, 'typewriter'),
  ('quick_hands', 'Quick Hands', 'Earned your first Reaction Challenge reward.', 3, 'trophy_case');
