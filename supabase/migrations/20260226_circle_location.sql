-- Add location fields to circles
ALTER TABLE circles
  ADD COLUMN IF NOT EXISTS location_name TEXT,
  ADD COLUMN IF NOT EXISTS location_lat FLOAT8,
  ADD COLUMN IF NOT EXISTS location_lng FLOAT8;
