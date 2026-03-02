-- Notification preferences per user
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS notification_prefs JSONB DEFAULT '{
    "push_messages": true,
    "push_connections": true,
    "push_events": true,
    "push_circles": true,
    "push_announcements": true,
    "email_digest": true
  }'::jsonb;

-- Track when we last sent a digest to this user
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS last_digest_sent_at TIMESTAMPTZ;

-- Track which notifications have been included in a digest
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS digested_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS notifications_digested_idx ON notifications(digested_at) WHERE digested_at IS NULL;
