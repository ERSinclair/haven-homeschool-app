ALTER TABLE calendar_notes
  ADD COLUMN IF NOT EXISTS recurrence_rule TEXT CHECK (recurrence_rule IN ('weekly', 'monthly', 'yearly')),
  ADD COLUMN IF NOT EXISTS recurrence_end_date DATE;
