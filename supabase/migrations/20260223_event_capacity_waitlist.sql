-- Ensure event_rsvps has a created_at for waitlist ordering
ALTER TABLE event_rsvps
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Index for fast waitlist queries (ordered by join time)
CREATE INDEX IF NOT EXISTS event_rsvps_waitlist_idx
  ON event_rsvps(event_id, status, created_at)
  WHERE status = 'waitlist';

-- events already has max_attendees column — just make sure it exists
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS max_attendees INTEGER;
