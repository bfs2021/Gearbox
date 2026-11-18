-- The time zone of whoever sent each overview (from their browser), for the date in its heading.
-- Overviews sent before this show the date in UTC.
ALTER TABLE overviews ADD COLUMN time_zone TEXT NOT NULL DEFAULT 'UTC';
