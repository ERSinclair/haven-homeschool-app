CREATE TABLE IF NOT EXISTS reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('note', 'event')),
  target_id UUID NOT NULL,
  target_title TEXT NOT NULL,
  remind_at TIMESTAMPTZ NOT NULL,
  delivery TEXT[] NOT NULL DEFAULT '{push,notification}',
  fired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS reminders_remind_at_idx ON reminders(remind_at) WHERE fired_at IS NULL;
CREATE INDEX IF NOT EXISTS reminders_user_idx ON reminders(user_id);

ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own reminders"
  ON reminders FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role full access"
  ON reminders FOR ALL
  USING (true)
  WITH CHECK (true);
