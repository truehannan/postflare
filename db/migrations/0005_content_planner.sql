-- Content planner: a planning layer above posts.
-- content_items are lightweight ideas/planned pieces (they exist before a
-- real post does). Converting an idea into a post links the two via post_id
-- and moves the item to the 'done' column.

CREATE TABLE content_items (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  notes        TEXT,
  platform_id  TEXT,
  status       TEXT NOT NULL DEFAULT 'idea',  -- idea | drafting | review | approved | done
  tags_json    TEXT NOT NULL DEFAULT '[]',
  campaign_id  TEXT,
  due_at       TEXT,                          -- planned date (calendar overlay)
  post_id      TEXT,                          -- set when converted to a post
  created_by   TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  deleted_at   TEXT
);
CREATE INDEX idx_content_items_workspace ON content_items(workspace_id, status);