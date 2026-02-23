-- Event group chat
CREATE TABLE IF NOT EXISTS event_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT,
  file_url TEXT,
  file_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS event_messages_event_id_idx ON event_messages(event_id);
CREATE INDEX IF NOT EXISTS event_messages_created_at_idx ON event_messages(created_at);

-- RLS
ALTER TABLE event_messages ENABLE ROW LEVEL SECURITY;

-- Read: host + anyone who has RSVPed
CREATE POLICY "event_messages_read" ON event_messages
  FOR SELECT USING (
    auth.uid() = (SELECT host_id FROM events WHERE id = event_id)
    OR auth.uid() IN (
      SELECT profile_id FROM event_rsvps WHERE event_id = event_messages.event_id AND status = 'going'
    )
  );

-- Insert: host + RSVPed users only
CREATE POLICY "event_messages_insert" ON event_messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id
    AND (
      auth.uid() = (SELECT host_id FROM events WHERE id = event_id)
      OR auth.uid() IN (
        SELECT profile_id FROM event_rsvps WHERE event_id = event_messages.event_id AND status = 'going'
      )
    )
  );

-- Delete: own messages only
CREATE POLICY "event_messages_delete" ON event_messages
  FOR DELETE USING (auth.uid() = sender_id);

-- Storage bucket for event files (run manually if bucket doesn't exist)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('event-files', 'event-files', true) ON CONFLICT DO NOTHING;
