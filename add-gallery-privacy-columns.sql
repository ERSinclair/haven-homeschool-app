-- ==========================================
-- GALLERY PRIVACY SETUP FOR HAVEN APP
-- ==========================================
-- Run this SQL in your Supabase SQL Editor to add gallery privacy features

-- 1. Add gallery privacy columns to the profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS gallery_privacy VARCHAR(20) DEFAULT 'public',
ADD COLUMN IF NOT EXISTS gallery_selected_users TEXT[] DEFAULT '{}';

-- 2. Add comments to describe the columns
COMMENT ON COLUMN profiles.gallery_privacy IS 'Gallery privacy setting: public, private, connections, or selected';
COMMENT ON COLUMN profiles.gallery_selected_users IS 'Array of user IDs who can view gallery when privacy is set to selected';

-- 3. Add check constraint for gallery_privacy values
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'gallery_privacy_check'
    ) THEN
        ALTER TABLE profiles 
        ADD CONSTRAINT gallery_privacy_check 
        CHECK (gallery_privacy IN ('public', 'private', 'connections', 'selected'));
    END IF;
END $$;

-- 4. Verify the changes
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'profiles' 
AND column_name IN ('gallery_privacy', 'gallery_selected_users');

-- Expected output:
-- column_name              | data_type        | column_default
-- gallery_privacy          | character varying| 'public'::character varying
-- gallery_selected_users   | ARRAY           | '{}'::text[]