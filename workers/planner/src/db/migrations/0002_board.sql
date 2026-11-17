-- The team's board: cards in three columns, in the order the team drags them into. Replaces
-- 0001's placeholder table, which held nothing.

DROP TABLE plans;

CREATE TABLE cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  -- not_started, in_progress or done.
  status TEXT NOT NULL CHECK (status IN ('not_started', 'in_progress', 'done')),
  -- Its place in its column, top first. Gaps are fine: only the order counts.
  sort_order INTEGER NOT NULL,
  -- G3ID user id.
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX cards_team_status_idx ON cards(team_id, status, sort_order);
