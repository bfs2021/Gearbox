-- Who's on each card: members add and remove themselves. Goes with its card.
CREATE TABLE card_members (
  team_id TEXT NOT NULL,
  card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  -- G3ID user id.
  user_id TEXT NOT NULL,
  added_at INTEGER NOT NULL,
  PRIMARY KEY (card_id, user_id)
);
CREATE INDEX card_members_team_idx ON card_members(team_id);
