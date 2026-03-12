-- Skills Exchange
-- Adds skills_offered and skills_wanted arrays to profiles

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS skills_offered text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS skills_wanted  text[] DEFAULT '{}';

-- Index for fast querying of profiles that have skills
CREATE INDEX IF NOT EXISTS idx_profiles_skills_offered ON profiles USING GIN (skills_offered);
CREATE INDEX IF NOT EXISTS idx_profiles_skills_wanted  ON profiles USING GIN (skills_wanted);
