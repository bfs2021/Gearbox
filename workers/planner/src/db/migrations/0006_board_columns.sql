-- The board's middle columns are the team's own: as many as it wants, named as it likes, between
-- Not Started and Done (which always stay). A card in one has status 'in_progress' and its
-- column_id; Not Started and Done cards have none.

CREATE TABLE board_columns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 40),
  -- Left to right.
  sort_order INTEGER NOT NULL,
  -- G3ID user id; null for one Gearbox made.
  created_by TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX board_columns_team_idx ON board_columns(team_id, sort_order);

ALTER TABLE cards ADD COLUMN column_id INTEGER REFERENCES board_columns(id);

-- Every team already using Planner keeps its In Progress column, now one of its own.
INSERT INTO board_columns (team_id, name, sort_order, created_by, created_at)
SELECT team_id, 'In Progress', 0, NULL, unixepoch()
FROM (SELECT team_id FROM cards UNION SELECT team_id FROM planner_settings);

UPDATE cards
SET column_id = (SELECT b.id FROM board_columns b WHERE b.team_id = cards.team_id)
WHERE status = 'in_progress';
