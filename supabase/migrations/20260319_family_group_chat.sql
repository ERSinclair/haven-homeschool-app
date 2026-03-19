-- Add family_id to profiles (links family members together)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS family_id uuid;

-- Family group chats: one conversation per family_id
CREATE TABLE IF NOT EXISTS family_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS family_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES family_conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content text,
  file_url text,
  file_type text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS family_message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES family_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(message_id, user_id, emoji)
);

ALTER TABLE family_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_message_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Family members can view their conversation"
  ON family_conversations FOR SELECT
  USING (
    family_id IN (
      SELECT family_id FROM profiles WHERE id = auth.uid() AND family_id IS NOT NULL
    )
  );

CREATE POLICY "Family members can view messages"
  ON family_messages FOR SELECT
  USING (
    conversation_id IN (
      SELECT fc.id FROM family_conversations fc
      WHERE fc.family_id IN (
        SELECT family_id FROM profiles WHERE id = auth.uid() AND family_id IS NOT NULL
      )
    )
  );

CREATE POLICY "Family members can send messages"
  ON family_messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid() AND
    conversation_id IN (
      SELECT fc.id FROM family_conversations fc
      WHERE fc.family_id IN (
        SELECT family_id FROM profiles WHERE id = auth.uid() AND family_id IS NOT NULL
      )
    )
  );

CREATE POLICY "Family members can view reactions"
  ON family_message_reactions FOR SELECT
  USING (
    message_id IN (
      SELECT fm.id FROM family_messages fm
      JOIN family_conversations fc ON fc.id = fm.conversation_id
      WHERE fc.family_id IN (
        SELECT family_id FROM profiles WHERE id = auth.uid() AND family_id IS NOT NULL
      )
    )
  );

CREATE POLICY "Family members can react"
  ON family_message_reactions FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Family members can remove their reaction"
  ON family_message_reactions FOR DELETE
  USING (user_id = auth.uid());
