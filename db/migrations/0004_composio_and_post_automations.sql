-- Composio hub integration + quick automations.
--
-- connection_mode: 'direct' (per-platform credentials) or 'composio'
-- (publishes through the Composio tool API using the workspace Composio key).
-- config_json: per-account settings required by some providers at publish
-- time (Facebook pageId, Reddit subreddit, Telegram chatId, LinkedIn authorUrn).

ALTER TABLE connected_accounts ADD COLUMN connection_mode TEXT NOT NULL DEFAULT 'direct';
ALTER TABLE connected_accounts ADD COLUMN config_json TEXT NOT NULL DEFAULT '{}';

-- Quick-automation attachments: automations instantiated from templates and
-- bound to a specific post (e.g. Instagram comment-to-DM on this post).
CREATE TABLE post_automations (
  id            TEXT PRIMARY KEY,
  post_id       TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  automation_id TEXT NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  created_at    TEXT NOT NULL,
  UNIQUE (post_id, automation_id)
);
CREATE INDEX idx_post_automations_post ON post_automations(post_id);