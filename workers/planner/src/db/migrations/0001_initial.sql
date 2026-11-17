-- Planner: the team's plans. A placeholder to build on; the app has no features yet.
--
-- Everything here is one team's data (team_id), and every query goes through inTeam/withTeam from
-- @g3/auth (roadmap Phase 3).

CREATE TABLE plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id TEXT NOT NULL,
  title TEXT NOT NULL,
  -- G3ID user id.
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX plans_team_idx ON plans(team_id);
