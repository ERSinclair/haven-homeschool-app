-- Add latitude and longitude columns to events table for exact location support
-- Run this in your Supabase SQL editor

ALTER TABLE events 
ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 8),
ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8),
ADD COLUMN IF NOT EXISTS exact_address TEXT;

-- Add comment for clarity
COMMENT ON COLUMN events.latitude IS 'Latitude for exact event location (optional)';
COMMENT ON COLUMN events.longitude IS 'Longitude for exact event location (optional)';
COMMENT ON COLUMN events.exact_address IS 'Full geocoded address when exact location is enabled';