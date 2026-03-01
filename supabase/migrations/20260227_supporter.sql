-- Supporter infrastructure for Haven

-- Add supporter fields to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_supporter BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS supporter_since TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS supporter_tier TEXT CHECK (supporter_tier IN ('monthly', 'annual', 'donor')),
  ADD COLUMN IF NOT EXISTS supporter_display_name TEXT,
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

-- Supporters table for the public thank-you wall
CREATE TABLE IF NOT EXISTS supporters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('monthly', 'annual', 'donor')),
  amount_cents INTEGER,
  supporter_since TIMESTAMPTZ DEFAULT NOW(),
  is_founding BOOLEAN DEFAULT FALSE,
  show_on_wall BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS supporters_since_idx ON supporters (supporter_since ASC);

ALTER TABLE supporters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view supporters"
  ON supporters FOR SELECT
  USING (show_on_wall = TRUE);

CREATE POLICY "Users can update own supporter record"
  ON supporters FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert supporters"
  ON supporters FOR INSERT
  WITH CHECK (TRUE);
