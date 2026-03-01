-- 1. Activity tracking on profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS profiles_last_active_idx ON profiles(last_active_at DESC);

-- 2. Read receipts on messages
ALTER TABLE messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

-- 3. Circle pinned announcement
ALTER TABLE circles ADD COLUMN IF NOT EXISTS pinned_announcement TEXT;
ALTER TABLE circles ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ;
ALTER TABLE circles ADD COLUMN IF NOT EXISTS pinned_by UUID REFERENCES profiles(id);
