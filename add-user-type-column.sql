-- Add user_type column to profiles table
-- Run this in Supabase SQL Editor to add user type support

-- Add user_type column if it doesn't exist
DO $$ 
BEGIN
  -- Add user_type column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'user_type') THEN
    ALTER TABLE profiles ADD COLUMN user_type TEXT DEFAULT 'family' CHECK (user_type IN ('family', 'teacher', 'business'));
  END IF;
  
  RAISE NOTICE 'User type column added to profiles table!';
END $$;

-- Verify the setup
SELECT 'User type column ready!' as status;

-- Show the profiles table structure
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns 
WHERE table_name = 'profiles' 
AND column_name IN ('user_type', 'family_name', 'display_name', 'email')
ORDER BY ordinal_position;