-- Fix missing columns in events table
-- Run this in Supabase SQL Editor

-- Add the missing location columns
ALTER TABLE public.events 
ADD COLUMN IF NOT EXISTS exact_address TEXT,
ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 8),
ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8),
ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS show_exact_location BOOLEAN DEFAULT false;

-- Add index for better performance on private events filtering
CREATE INDEX IF NOT EXISTS idx_events_is_private ON public.events(is_private);

-- Add index for location-based queries
CREATE INDEX IF NOT EXISTS idx_events_location ON public.events(latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Verify the columns were added
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'events' 
ORDER BY ordinal_position;