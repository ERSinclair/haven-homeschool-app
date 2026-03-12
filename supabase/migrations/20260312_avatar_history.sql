-- Avatar history — store previous avatar URLs per user
CREATE TABLE IF NOT EXISTS avatar_history (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  avatar_url  text NOT NULL,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE avatar_history ENABLE ROW LEVEL SECURITY;

-- Users can only see their own history
CREATE POLICY "view_own_avatar_history" ON avatar_history
  FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own records
CREATE POLICY "insert_own_avatar_history" ON avatar_history
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_avatar_history_user ON avatar_history (user_id, created_at DESC);
