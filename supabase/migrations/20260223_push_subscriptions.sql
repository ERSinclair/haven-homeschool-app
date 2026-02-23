CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  subscription JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, endpoint)
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON push_subscriptions(user_id);
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
-- Any authenticated user can read subscriptions (needed to send notifications to others)
CREATE POLICY "push_subs_read" ON push_subscriptions
  FOR SELECT USING (auth.uid() IS NOT NULL);
-- Users can only insert/update/delete their own subscriptions
CREATE POLICY "push_subs_write" ON push_subscriptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "push_subs_update" ON push_subscriptions
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "push_subs_delete" ON push_subscriptions
  FOR DELETE USING (auth.uid() = user_id);
