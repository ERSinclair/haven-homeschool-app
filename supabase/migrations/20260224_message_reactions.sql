-- Message reactions across all chat types (DMs, circle chat, event chat)
CREATE TABLE IF NOT EXISTS message_reactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id TEXT NOT NULL,
  message_type TEXT NOT NULL CHECK (message_type IN ('dm', 'circle', 'event')),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(message_id, message_type, user_id, emoji)
);

ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can view reactions
CREATE POLICY "Authenticated users can view reactions"
  ON message_reactions FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Users can only add their own reactions
CREATE POLICY "Users can add own reactions"
  ON message_reactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can only remove their own reactions
CREATE POLICY "Users can remove own reactions"
  ON message_reactions FOR DELETE
  USING (auth.uid() = user_id);
