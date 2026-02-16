-- Fix circles table - add missing is_public column
-- Run this in your Supabase SQL Editor

-- Add the is_public column if it doesn't exist
ALTER TABLE circles 
ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT true;

-- Make sure the table has all the required columns
ALTER TABLE circles 
ADD COLUMN IF NOT EXISTS emoji TEXT DEFAULT '👥',
ADD COLUMN IF NOT EXISTS color TEXT DEFAULT 'teal',
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS member_count INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ DEFAULT NOW();

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_circles_public ON circles(is_public);

-- Update RLS policies if needed
DROP POLICY IF EXISTS "Users can create circles" ON circles;

CREATE POLICY "Users can create circles" ON circles
    FOR INSERT 
    WITH CHECK (created_by = auth.uid());

SELECT '✅ Circles table fixed successfully!' as result;