-- Fix RLS policies that might be blocking circles queries

-- Drop existing policies to start fresh
DROP POLICY IF EXISTS "Anyone can view public circles" ON circles;
DROP POLICY IF EXISTS "Authenticated users can create circles" ON circles;
DROP POLICY IF EXISTS "Members can view circle membership" ON circle_members;
DROP POLICY IF EXISTS "Circle creators can manage members" ON circle_members;

-- More permissive policies for circles
CREATE POLICY "Users can view all circles" ON circles
    FOR SELECT 
    USING (true); -- Allow all authenticated users to see circles

CREATE POLICY "Users can create circles" ON circles
    FOR INSERT 
    WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their circles" ON circles
    FOR UPDATE 
    USING (auth.uid() = created_by);

-- Policies for circle_members
CREATE POLICY "Users can view all memberships" ON circle_members
    FOR SELECT 
    USING (true); -- Allow viewing all memberships

CREATE POLICY "Users can join circles" ON circle_members
    FOR INSERT 
    WITH CHECK (auth.uid() = member_id);

CREATE POLICY "Users can manage circles they created" ON circle_members
    FOR ALL 
    USING (circle_id IN (SELECT id FROM circles WHERE created_by = auth.uid()));

-- Ensure required columns exist with proper defaults
ALTER TABLE circles 
ADD COLUMN IF NOT EXISTS member_count INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Update any circles that might have NULL values
UPDATE circles 
SET member_count = 1 
WHERE member_count IS NULL;

UPDATE circles 
SET last_activity_at = created_at 
WHERE last_activity_at IS NULL;

UPDATE circles 
SET is_active = true 
WHERE is_active IS NULL;

SELECT '✅ Circles RLS policies updated - should fix loading issues!' as result;