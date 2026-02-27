-- Add cover image support to events
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS cover_image_url TEXT;
