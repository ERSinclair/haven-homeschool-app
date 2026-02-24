-- Add file attachment support to circle_resources
ALTER TABLE circle_resources
  ADD COLUMN IF NOT EXISTS file_url  TEXT,
  ADD COLUMN IF NOT EXISTS file_name TEXT;
