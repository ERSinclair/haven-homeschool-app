CREATE TABLE IF NOT EXISTS calendar_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  note_date DATE NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS calendar_notes_profile_idx ON calendar_notes(profile_id, note_date);
ALTER TABLE calendar_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "calendar_notes_all" ON calendar_notes
  USING (auth.uid() = profile_id)
  WITH CHECK (auth.uid() = profile_id);
