-- Create event_invitations table for private event invitations
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS event_invitations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  inviter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invitee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (event_id, invitee_id)
);

CREATE INDEX IF NOT EXISTS event_invitations_invitee_idx ON event_invitations(invitee_id);
CREATE INDEX IF NOT EXISTS event_invitations_event_idx ON event_invitations(event_id);

ALTER TABLE event_invitations ENABLE ROW LEVEL SECURITY;

-- Event hosts can send invitations
CREATE POLICY "Event hosts can invite" ON event_invitations
  FOR INSERT WITH CHECK (
    inviter_id = auth.uid() AND
    EXISTS (SELECT 1 FROM events WHERE id = event_invitations.event_id AND host_id = auth.uid())
  );

-- Invitee and inviter can view
CREATE POLICY "Users can view relevant invitations" ON event_invitations
  FOR SELECT USING (invitee_id = auth.uid() OR inviter_id = auth.uid());

-- Invitee can respond
CREATE POLICY "Invitee can respond" ON event_invitations
  FOR UPDATE USING (invitee_id = auth.uid());

-- Inviter can cancel
CREATE POLICY "Inviter can cancel" ON event_invitations
  FOR DELETE USING (inviter_id = auth.uid());
