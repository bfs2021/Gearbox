-- Meeting overviews: a message on the team's chat listing the board, kept up to date as cards
-- change. Each team's settings, the overviews it posted, and which cards have been on each (so
-- one finished since shows crossed off).

CREATE TABLE planner_settings (
  team_id TEXT PRIMARY KEY,
  -- The Slack or Discord channel overviews go to; null until an admin picks one.
  overview_channel TEXT,
  updated_by TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE overviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id TEXT NOT NULL,
  -- The message, as G3ID gave it back: slack or discord, its channel, its id.
  provider TEXT NOT NULL CHECK (provider IN ('slack', 'discord')),
  channel TEXT NOT NULL,
  message_id TEXT NOT NULL,
  -- What it says now, so an edit is only sent when the text changes.
  last_text TEXT NOT NULL,
  -- G3ID user id.
  posted_by TEXT NOT NULL,
  posted_at INTEGER NOT NULL
);
CREATE INDEX overviews_team_idx ON overviews(team_id, id);

CREATE TABLE overview_cards (
  team_id TEXT NOT NULL,
  overview_id INTEGER NOT NULL REFERENCES overviews(id) ON DELETE CASCADE,
  card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  PRIMARY KEY (overview_id, card_id)
);
CREATE INDEX overview_cards_team_idx ON overview_cards(team_id);
