-- Track onboarding completion
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS onboarding_complete BOOLEAN DEFAULT FALSE;

-- Allow unauthenticated (anon) users to read profiles for public share pages
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'profiles_public_read'
  ) THEN
    CREATE POLICY "profiles_public_read" ON profiles
      FOR SELECT
      USING (true);
  END IF;
END $$;
