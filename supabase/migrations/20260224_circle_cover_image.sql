-- Add cover image to circles
ALTER TABLE circles
  ADD COLUMN IF NOT EXISTS cover_image_url TEXT;
