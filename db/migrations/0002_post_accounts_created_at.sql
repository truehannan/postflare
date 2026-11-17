-- post_accounts was missing a created_at column, which the post hydration
-- query ordered by. Add it (default '' for any pre-existing rows).

ALTER TABLE post_accounts ADD COLUMN created_at TEXT NOT NULL DEFAULT '';