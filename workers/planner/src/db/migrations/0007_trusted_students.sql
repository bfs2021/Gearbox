-- Students a team's mentors and admins trust to put anyone on a card or take them off, besides
-- mentors and admins themselves.
CREATE TABLE trusted_students (
  team_id TEXT NOT NULL,
  -- G3ID user id.
  user_id TEXT NOT NULL,
  -- G3ID user id of the mentor or admin who added them.
  added_by TEXT NOT NULL,
  added_at INTEGER NOT NULL,
  PRIMARY KEY (team_id, user_id)
);
