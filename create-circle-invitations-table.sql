-- Create circle_invitations table
-- Run this in the Supabase SQL Editor

CREATE TABLE IF NOT EXISTS circle_invitations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  circle_id UUID NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  inviter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invitee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (circle_id, invitee_id)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS circle_invitations_invitee_idx ON circle_invitations(invitee_id);
CREATE INDEX IF NOT EXISTS circle_invitations_circle_idx ON circle_invitations(circle_id);

-- Enable RLS
ALTER TABLE circle_invitations ENABLE ROW LEVEL SECURITY;

-- Admins/members can send invitations
CREATE POLICY "Circle members can invite others" ON circle_invitations
  FOR INSERT WITH CHECK (
    inviter_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM circle_members
      WHERE circle_id = circle_invitations.circle_id
        AND member_id = auth.uid()
    )
  );

-- Invitee can see their own invitations; inviter can see ones they sent
CREATE POLICY "Users can view relevant invitations" ON circle_invitations
  FOR SELECT USING (
    invitee_id = auth.uid() OR inviter_id = auth.uid()
  );

-- Invitee can update (accept/decline); inviter can delete (cancel)
CREATE POLICY "Invitee can respond to invitation" ON circle_invitations
  FOR UPDATE USING (invitee_id = auth.uid());

CREATE POLICY "Inviter can cancel invitation" ON circle_invitations
  FOR DELETE USING (inviter_id = auth.uid());
