-- Add 3-tier admin system
-- Run this in Supabase SQL Editor

-- Add admin_level column to profiles table
DO $$ 
BEGIN
  -- Add admin_level column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'profiles' AND column_name = 'admin_level') THEN
    ALTER TABLE public.profiles ADD COLUMN admin_level text CHECK (admin_level IN ('gold', 'silver', 'bronze')) DEFAULT NULL;
  END IF;
END $$;

-- Create index for better performance when filtering admin levels
CREATE INDEX IF NOT EXISTS idx_profiles_admin_level ON public.profiles(admin_level);

-- Update existing is_admin users to gold level (full admin rights)
UPDATE public.profiles 
SET admin_level = 'gold' 
WHERE is_admin = true AND admin_level IS NULL;

-- Create a view for easy admin checking
CREATE OR REPLACE VIEW public.admin_users AS
SELECT 
  id,
  email,
  family_name,
  display_name,
  admin_level,
  CASE 
    WHEN admin_level = 'gold' THEN 'Full Admin'
    WHEN admin_level = 'silver' THEN 'Partial Admin' 
    WHEN admin_level = 'bronze' THEN 'Restricted Admin'
    ELSE 'Regular User'
  END as admin_title,
  CASE 
    WHEN admin_level IS NOT NULL THEN true
    ELSE false
  END as is_admin_user
FROM public.profiles
WHERE admin_level IS NOT NULL OR is_admin = true;

-- Grant access to the view
GRANT SELECT ON public.admin_users TO anon, authenticated;

-- Example: Set different admin levels (update emails as needed)
-- UPDATE public.profiles SET admin_level = 'gold' WHERE email = 'canetrott@gmail.com';
-- UPDATE public.profiles SET admin_level = 'silver' WHERE email = 'someone@example.com';
-- UPDATE public.profiles SET admin_level = 'bronze' WHERE email = 'another@example.com';

-- Test the changes
SELECT id, email, family_name, admin_level, is_admin 
FROM public.profiles 
WHERE admin_level IS NOT NULL OR is_admin = true
ORDER BY 
  CASE admin_level 
    WHEN 'gold' THEN 1 
    WHEN 'silver' THEN 2 
    WHEN 'bronze' THEN 3 
    ELSE 4 
  END;