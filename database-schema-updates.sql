-- Database Schema Updates for Circles and Connections Enhancement
-- Run these SQL commands in your Supabase SQL editor

-- 1. Update circles table to add public/private visibility
ALTER TABLE circles 
ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT true;

-- 2. Create connections table for friend-like relationships
CREATE TABLE connections (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    requester_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    receiver_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    status TEXT CHECK (status IN ('pending', 'accepted', 'blocked')) DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Prevent duplicate connections
    UNIQUE(requester_id, receiver_id)
);

-- 3. Update circle_members table to support admin roles
-- (This might already exist, but ensure it has a role column)
ALTER TABLE circle_members 
ADD COLUMN IF NOT EXISTS role TEXT CHECK (role IN ('member', 'admin')) DEFAULT 'member';

-- 4. Create indexes for better performance
CREATE INDEX idx_connections_requester ON connections(requester_id);
CREATE INDEX idx_connections_receiver ON connections(receiver_id);
CREATE INDEX idx_connections_status ON connections(status);
CREATE INDEX idx_circles_public ON circles(is_public);
CREATE INDEX idx_circle_members_role ON circle_members(role);

-- 5. Create RLS (Row Level Security) policies

-- Connections policies
ALTER TABLE connections ENABLE ROW LEVEL SECURITY;

-- Users can see connections they're involved in
CREATE POLICY "Users can view their connections" ON connections
    FOR SELECT 
    USING (requester_id = auth.uid() OR receiver_id = auth.uid());

-- Users can create connection requests to others
CREATE POLICY "Users can send connection requests" ON connections
    FOR INSERT 
    WITH CHECK (requester_id = auth.uid() AND requester_id != receiver_id);

-- Users can update status of connections they receive
CREATE POLICY "Users can respond to connection requests" ON connections
    FOR UPDATE 
    USING (receiver_id = auth.uid())
    WITH CHECK (receiver_id = auth.uid());

-- Users can delete their own sent requests or accepted connections
CREATE POLICY "Users can delete their connections" ON connections
    FOR DELETE 
    USING (requester_id = auth.uid() OR receiver_id = auth.uid());

-- Update circles policies for public/private visibility
-- (Replace existing policies if they conflict)

DROP POLICY IF EXISTS "Users can view circles they're members of" ON circles;

-- Users can view public circles or circles they're members of
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

-- Circle creators and admins can update circles
CREATE POLICY "Admins can update circles" ON circles
    FOR UPDATE 
    USING (
        created_by = auth.uid() 
        OR id IN (
            SELECT circle_id 
            FROM circle_members 
            WHERE member_id = auth.uid() 
            AND role = 'admin'
        )
    );

-- 6. Create function to automatically make circle creator an admin
CREATE OR REPLACE FUNCTION make_creator_admin()
RETURNS TRIGGER AS $$
BEGIN
    -- Insert the creator as an admin member
    INSERT INTO circle_members (circle_id, member_id, role)
    VALUES (NEW.id, NEW.created_by, 'admin');
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-add creator as admin
CREATE TRIGGER auto_add_circle_admin
    AFTER INSERT ON circles
    FOR EACH ROW
    EXECUTE FUNCTION make_creator_admin();

-- 7. Create function to get connection status between users
CREATE OR REPLACE FUNCTION get_connection_status(user1_id UUID, user2_id UUID)
RETURNS TEXT AS $$
DECLARE
    connection_status TEXT;
BEGIN
    SELECT status INTO connection_status
    FROM connections 
    WHERE (requester_id = user1_id AND receiver_id = user2_id)
       OR (requester_id = user2_id AND receiver_id = user1_id);
    
    RETURN COALESCE(connection_status, 'none');
END;
$$ LANGUAGE plpgsql;

-- 8. Create view for easy connection querying
CREATE VIEW user_connections AS
SELECT 
    c.id,
    c.requester_id,
    c.receiver_id,
    c.status,
    c.created_at,
    c.updated_at,
    CASE 
        WHEN c.requester_id = auth.uid() THEN c.receiver_id
        ELSE c.requester_id
    END as other_user_id,
    CASE 
        WHEN c.requester_id = auth.uid() THEN 'sent'
        ELSE 'received'
    END as request_direction
FROM connections c
WHERE c.requester_id = auth.uid() OR c.receiver_id = auth.uid();

-- 9. Create notification system for connection requests (optional)
CREATE TABLE IF NOT EXISTS notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL, -- 'connection_request', 'connection_accepted', etc.
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    data JSONB, -- Store related IDs, etc.
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_unread ON notifications(user_id, read_at) 
WHERE read_at IS NULL;

-- RLS for notifications
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their notifications" ON notifications
    FOR SELECT 
    USING (user_id = auth.uid());

CREATE POLICY "System can create notifications" ON notifications
    FOR INSERT 
    WITH CHECK (true); -- Allow system to create notifications

CREATE POLICY "Users can update their notifications" ON notifications
    FOR UPDATE 
    USING (user_id = auth.uid());

-- 10. Function to create connection request notification
CREATE OR REPLACE FUNCTION notify_connection_request()
RETURNS TRIGGER AS $$
BEGIN
    -- Only notify for new pending requests
    IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
        INSERT INTO notifications (user_id, type, title, message, data)
        SELECT 
            NEW.receiver_id,
            'connection_request',
            'New Connection Request',
            CONCAT((SELECT family_name FROM profiles WHERE id = NEW.requester_id), ' wants to connect with you'),
            jsonb_build_object('connection_id', NEW.id, 'requester_id', NEW.requester_id)
        WHERE NEW.requester_id != NEW.receiver_id; -- Don't notify self
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for connection request notifications
CREATE TRIGGER connection_request_notification
    AFTER INSERT ON connections
    FOR EACH ROW
    EXECUTE FUNCTION notify_connection_request();

-- 11. Sample data (optional - for testing)
/*
-- Test public and private circles
INSERT INTO circles (name, description, emoji, color, is_public, created_by)
VALUES 
    ('Beach Day Crew', 'Regular beach outings and water activities', '🏖️', 'teal', true, (SELECT id FROM profiles LIMIT 1)),
    ('Private Study Group', 'Intimate group for homeschool planning', '📚', 'purple', false, (SELECT id FROM profiles LIMIT 1));
*/