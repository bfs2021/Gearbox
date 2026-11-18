-- Which list of the overview each card was last in (Not Started, or Started for In Progress), so a
-- card that's finished stays crossed off where it was.
ALTER TABLE overview_cards ADD COLUMN section TEXT NOT NULL DEFAULT 'not_started'
  CHECK (section IN ('not_started', 'in_progress'));
