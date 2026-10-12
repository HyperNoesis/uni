-- 0003 social + safety (Phase 5). Mirrors apps/api/src/social.ts; rules there are the source of truth.
INSERT INTO achievements (id, title, description, reputation, reward_item_id) VALUES
  ('good_neighbour', 'Good Neighbour', 'Made your first friend.', 3, NULL),
  ('joiner', 'Joiner', 'Joined your first campus group.', 2, NULL);

CREATE TABLE friendships (
  user_a uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE, user_b uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  requester uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE, status text NOT NULL CHECK (status IN ('pending', 'accepted')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_a, user_b), CHECK (user_a < user_b), CHECK (requester IN (user_a, user_b))
);
CREATE INDEX friendships_b_idx ON friendships (user_b);
CREATE TABLE blocks (
  blocker uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE, blocked uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (blocker, blocked), CHECK (blocker <> blocked)
);
CREATE INDEX blocks_blocked_idx ON blocks (blocked);
CREATE TABLE mutes (
  muter uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE, muted uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (muter, muted), CHECK (muter <> muted)
);
CREATE TABLE groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campus_id text NOT NULL REFERENCES campuses (id), owner_id uuid NOT NULL REFERENCES users (id),
  name text NOT NULL CHECK (char_length(name) BETWEEN 3 AND 30), description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 120),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE group_members (
  group_id uuid NOT NULL REFERENCES groups (id) ON DELETE CASCADE, user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'member')), joined_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (group_id, user_id)
);
CREATE INDEX group_members_user_idx ON group_members (user_id);
CREATE TABLE chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversation text NOT NULL, sender uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 200), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX chat_messages_conv_idx ON chat_messages (conversation, created_at DESC);
CREATE TABLE reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reporter uuid NOT NULL REFERENCES users (id), target uuid NOT NULL REFERENCES users (id),
  reason text NOT NULL, context text NOT NULL, evidence jsonb, note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 200),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'actioned', 'dismissed')), created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz, CHECK (reporter <> target)
);
CREATE INDEX reports_status_idx ON reports (status, created_at);
-- Append-only record of every moderator decision and automatic hold.
CREATE TABLE moderation_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), report_id uuid REFERENCES reports (id), target uuid NOT NULL REFERENCES users (id),
  action text NOT NULL, moderator text NOT NULL, until timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER moderation_actions_immutable BEFORE UPDATE OR DELETE ON moderation_actions FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
