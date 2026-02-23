-- Recurring events support
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS recurrence_rule TEXT CHECK (recurrence_rule IN ('weekly', 'fortnightly', 'monthly')),
  ADD COLUMN IF NOT EXISTS recurrence_end_date DATE;

-- Index for fast lookup of recurring events
CREATE INDEX IF NOT EXISTS events_recurrence_idx ON events(recurrence_rule) WHERE recurrence_rule IS NOT NULL;
