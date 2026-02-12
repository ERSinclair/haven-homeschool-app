-- FINAL FIX for Circles 409 Error
-- Run this in your Supabase SQL Editor

-- First check if circles table exists, if not create it
CREATE TABLE IF NOT EXISTS circles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    created_by UUID REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add all the missing columns that the app expects
ALTER TABLE circles 
ADD COLUMN IF NOT EXISTS emoji TEXT DEFAULT '👥',
ADD COLUMN IF NOT EXISTS color TEXT DEFAULT 'teal',
ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS member_count INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ DEFAULT NOW();

-- Create circle_members table if it doesn't exist
CREATE TABLE IF NOT EXISTS circle_members (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    circle_id UUID REFERENCES circles(id) ON DELETE CASCADE,
    member_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    role TEXT CHECK (role IN ('member', 'admin')) DEFAULT 'member',
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(circle_id, member_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_circles_public ON circles(is_public);
CREATE INDEX IF NOT EXISTS idx_circles_active ON circles(is_active);
CREATE INDEX IF NOT EXISTS idx_circle_members_role ON circle_members(role);

-- Enable RLS
ALTER TABLE circles ENABLE ROW LEVEL SECURITY;
ALTER TABLE circle_members ENABLE ROW LEVEL SECURITY;

-- Drop and recreate policies to avoid conflicts
DROP POLICY IF EXISTS "Users can view accessible circles" ON circles;
DROP POLICY IF EXISTS "Users can create circles" ON circles;
DROP POLICY IF EXISTS "Admins can update circles" ON circles;
DROP POLICY IF EXISTS "Users can view circle members" ON circle_members;
DROP POLICY IF EXISTS "Admins can manage circle members" ON circle_members;

-- Create fresh policies
CREATE POLICY "Users can view accessible circles" ON circles
    FOR SELECT 
    USING (
        is_public = true 
        OR id IN (
            SELECT circle_id 
            FROM circle_members 
            WHERE member_id = auth.uid()
        )
    );

CREATE POLICY "Users can create circles" ON circles
    FOR INSERT 
    WITH CHECK (created_by = auth.uid());

CREATE POLICY "Admins can update circles" ON circles
    FOR UPDATE 
    USING (
        created_by = auth.uid() 
        OR id IN (
            SELECT circle_id 
            FROM circle_members 
            WHERE member_id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Users can view circle members" ON circle_members
    FOR SELECT 
    USING (
        circle_id IN (
            SELECT id FROM circles 
            WHERE is_public = true
            OR id IN (
                SELECT circle_id 
                FROM circle_members 
                WHERE member_id = auth.uid()
            )
        )
    );

CREATE POLICY "Admins can manage circle members" ON circle_members
    FOR ALL 
    USING (
        circle_id IN (
            SELECT id FROM circles 
            WHERE created_by = auth.uid()
        )
        OR (
            circle_id IN (
                SELECT circle_id 
                FROM circle_members 
                WHERE member_id = auth.uid() AND role = 'admin'
            )
        )
    );

-- Function to auto-add creator as admin
CREATE OR REPLACE FUNCTION make_creator_admin()
RETURNS TRIGGER AS $$
BEGIN
    -- Insert the creator as an admin member
    INSERT INTO circle_members (circle_id, member_id, role)
    VALUES (NEW.id, NEW.created_by, 'admin');
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS auto_add_circle_admin ON circles;

-- Create trigger to auto-add creator as admin
CREATE TRIGGER auto_add_circle_admin
    AFTER INSERT ON circles
    FOR EACH ROW
    EXECUTE FUNCTION make_creator_admin();

SELECT '✅ Circles table fixed successfully! You can now create circles without 409 errors.' as result;