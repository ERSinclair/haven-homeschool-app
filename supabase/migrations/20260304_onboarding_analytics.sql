-- Onboarding funnel analytics
-- Tracks anonymous signup events to identify where users drop off

CREATE TABLE IF NOT EXISTS onboarding_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL,           -- anonymous ID from sessionStorage (survives page refresh, not new tab)
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,  -- populated on completion
  event TEXT NOT NULL,                -- see event names below
  properties JSONB DEFAULT '{}',      -- e.g. { step: 2, user_type: 'family' }
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Events logged:
-- signup_started          → user landed on /signup
-- step_viewed             → { step: 1-4, user_type }
-- type_selected           → { user_type: 'family'|'teacher'|'business'|'playgroup' }
-- step_completed          → { step: 1-4, user_type }
-- signup_completed        → { user_type, user_id }
-- signup_abandoned        → { step, user_type } (best-effort, on beforeunload)

-- RLS: allow anonymous inserts, authenticated users can read (admin panel checks isAdmin client-side)
ALTER TABLE onboarding_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert onboarding events"
  ON onboarding_events FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Authenticated users can read onboarding events"
  ON onboarding_events FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Index for funnel queries
CREATE INDEX IF NOT EXISTS idx_onboarding_events_event ON onboarding_events (event, created_at);
CREATE INDEX IF NOT EXISTS idx_onboarding_events_session ON onboarding_events (session_id);
