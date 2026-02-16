-- Circle invitations system - run in Supabase SQL Editor
-- This adds proper invitation workflow for circles

-- Add status column to circle_members if it doesn't exist
ALTER TABLE circle_members 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' 
CHECK (status IN ('pending', 'active', 'declined'));

-- Add invited_by column to track who sent the invitation
ALTER TABLE circle_members 
ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Add invited_at timestamp
ALTER TABLE circle_members 
ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ DEFAULT NOW();

-- Update RLS policies for circle_members
-- Allow users to see invitations sent to them
CREATE POLICY "Users can view their own invitations" ON circle_members
    FOR SELECT USING (member_id = auth.uid() OR invited_by = auth.uid());

-- Allow users to update their own invitation status (accept/decline)
CREATE POLICY "Users can update their own invitations" ON circle_members
    FOR UPDATE USING (member_id = auth.uid() AND status = 'pending');

-- Create a view for pending circle invitations
CREATE OR REPLACE VIEW pending_circle_invitations AS
SELECT 
    cm.*,
    c.name as circle_name,
    c.description as circle_description,
    c.emoji as circle_emoji,
    c.color as circle_color,
    inviter.family_name as inviter_name,
    inviter.display_name as inviter_display_name,
    invited.family_name as invited_name,
    invited.display_name as invited_display_name
FROM circle_members cm
JOIN circles c ON cm.circle_id = c.id
LEFT JOIN profiles inviter ON cm.invited_by = inviter.id
LEFT JOIN profiles invited ON cm.member_id = invited.id
WHERE cm.status = 'pending';

-- Grant access to the view
GRANT SELECT ON pending_circle_invitations TO authenticated;

-- Function to accept circle invitation
CREATE OR REPLACE FUNCTION accept_circle_invitation(invitation_id UUID)
RETURNS JSON AS $$
DECLARE
    result JSON;
    member_record circle_members%ROWTYPE;
BEGIN
    -- Update invitation status to active
    UPDATE circle_members 
    SET status = 'active', joined_at = NOW()
    WHERE id = invitation_id 
    AND member_id = auth.uid() 
    AND status = 'pending'
    RETURNING * INTO member_record;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Invitation not found or already processed');
    END IF;

    -- Increment member count
    UPDATE circles 
    SET member_count = member_count + 1,
        last_activity_at = NOW()
    WHERE id = member_record.circle_id;

    RETURN json_build_object('success', true, 'message', 'Invitation accepted');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to decline circle invitation
CREATE OR REPLACE FUNCTION decline_circle_invitation(invitation_id UUID)
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    -- Update invitation status to declined
    UPDATE circle_members 
    SET status = 'declined'
    WHERE id = invitation_id 
    AND member_id = auth.uid() 
    AND status = 'pending';

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Invitation not found or already processed');
    END IF;

    RETURN json_build_object('success', true, 'message', 'Invitation declined');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;