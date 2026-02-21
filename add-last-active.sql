-- Add last_active_at to profiles for real presence indicators
-- Run this in the Supabase SQL Editor

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ DEFAULT NOW();

-- Backfill with updated_at so existing users aren't all shown as inactive
UPDATE profiles SET last_active_at = updated_at WHERE last_active_at IS NULL;

-- Index for efficient "recently active" queries
CREATE INDEX IF NOT EXISTS idx_profiles_last_active ON profiles(last_active_at DESC);

-- Allow users to update their own last_active_at (already covered by existing "Users can update own profile" policy)
