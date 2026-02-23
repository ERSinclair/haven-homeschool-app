-- Drop existing policies if they exist, then recreate cleanly
DROP POLICY IF EXISTS "event_messages_read" ON event_messages;
DROP POLICY IF EXISTS "event_messages_insert" ON event_messages;
DROP POLICY IF EXISTS "event_messages_delete" ON event_messages;

CREATE POLICY "event_messages_read" ON event_messages
  FOR SELECT USING (
    auth.uid() = (SELECT host_id FROM events WHERE id = event_id)
    OR auth.uid() IN (
      SELECT profile_id FROM event_rsvps WHERE event_id = event_messages.event_id AND status = 'going'
    )
  );

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

CREATE POLICY "event_messages_delete" ON event_messages
  FOR DELETE USING (auth.uid() = sender_id);
