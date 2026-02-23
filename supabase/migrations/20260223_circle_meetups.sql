-- Circle meetup scheduling
ALTER TABLE circles
  ADD COLUMN IF NOT EXISTS next_meetup_date DATE,
  ADD COLUMN IF NOT EXISTS next_meetup_time TIME,
  ADD COLUMN IF NOT EXISTS meetup_notes TEXT,
  ADD COLUMN IF NOT EXISTS meetup_location TEXT;

CREATE INDEX IF NOT EXISTS circles_next_meetup_idx ON circles(next_meetup_date) WHERE next_meetup_date IS NOT NULL;
