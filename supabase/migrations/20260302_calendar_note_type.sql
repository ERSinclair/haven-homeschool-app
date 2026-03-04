-- Add note_type to calendar_notes to distinguish birthdays from regular notes
ALTER TABLE calendar_notes
  ADD COLUMN IF NOT EXISTS note_type TEXT NOT NULL DEFAULT 'note'
  CHECK (note_type IN ('note', 'birthday'));
