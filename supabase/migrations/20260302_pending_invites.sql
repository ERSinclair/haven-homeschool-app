-- Pending email invites (for non-Haven users)
CREATE TABLE IF NOT EXISTS pending_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  invited_by UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  invitee_email TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('event', 'circle')),
  target_id UUID NOT NULL,
  target_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days',
  accepted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS pending_invites_email_idx ON pending_invites (invitee_email);
CREATE INDEX IF NOT EXISTS pending_invites_token_idx ON pending_invites (token);

ALTER TABLE pending_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create invites"
  ON pending_invites FOR INSERT
  WITH CHECK (auth.uid() = invited_by);

CREATE POLICY "Users can view own sent invites"
  ON pending_invites FOR SELECT
  USING (auth.uid() = invited_by);

CREATE POLICY "Service role full access"
  ON pending_invites FOR ALL
  USING (true)
  WITH CHECK (true);
