-- Add file attachment support to circle_messages
ALTER TABLE circle_messages
  ADD COLUMN IF NOT EXISTS file_url TEXT,
  ADD COLUMN IF NOT EXISTS file_type TEXT;

-- Add image support to community_posts
ALTER TABLE community_posts
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS image_type TEXT;
