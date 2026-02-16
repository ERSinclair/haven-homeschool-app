-- Quick setup for connections functionality
-- Run this in your Supabase SQL editor

-- Ensure connections table exists with proper structure
CREATE TABLE IF NOT EXISTS connections (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    requester_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    receiver_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    status TEXT CHECK (status IN ('pending', 'accepted', 'blocked')) DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Prevent duplicate connections
    UNIQUE(requester_id, receiver_id)
);

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_connections_requester ON connections(requester_id);
CREATE INDEX IF NOT EXISTS idx_connections_receiver ON connections(receiver_id);
CREATE INDEX IF NOT EXISTS idx_connections_status ON connections(status);

-- Enable RLS
ALTER TABLE connections ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist and recreate
DROP POLICY IF EXISTS "Users can view their connections" ON connections;
DROP POLICY IF EXISTS "Users can send connection requests" ON connections;
DROP POLICY IF EXISTS "Users can respond to connection requests" ON connections;
DROP POLICY IF EXISTS "Users can delete their connections" ON connections;

-- Create RLS policies
CREATE POLICY "Users can view their connections" ON connections
    FOR SELECT 
    USING (requester_id = auth.uid() OR receiver_id = auth.uid());

CREATE POLICY "Users can send connection requests" ON connections
    FOR INSERT 
    WITH CHECK (requester_id = auth.uid() AND requester_id != receiver_id);

CREATE POLICY "Users can respond to connection requests" ON connections
    FOR UPDATE 
    USING (receiver_id = auth.uid())
    WITH CHECK (receiver_id = auth.uid());

CREATE POLICY "Users can delete their connections" ON connections
    FOR DELETE 
    USING (requester_id = auth.uid() OR receiver_id = auth.uid());