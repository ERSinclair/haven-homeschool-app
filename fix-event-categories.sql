-- Fix event categories to support custom categories
-- Run this in Supabase SQL Editor

-- Change category column from enum to text to support custom categories
-- This allows the frontend to send any category name including custom ones

-- Step 1: Add new text column
ALTER TABLE public.events ADD COLUMN category_text TEXT;

-- Step 2: Copy existing data to new column with mapping
UPDATE public.events 
SET category_text = CASE 
  WHEN category = 'learning' THEN 'Educational'
  WHEN category = 'playdate' THEN 'Play' 
  WHEN category = 'co-op' THEN 'Other'
  ELSE category::text
END;

-- Step 3: Drop the old enum column
ALTER TABLE public.events DROP COLUMN category;

-- Step 4: Rename new column to original name
ALTER TABLE public.events RENAME COLUMN category_text TO category;

-- Step 5: Make it NOT NULL and add constraint for common categories
ALTER TABLE public.events ALTER COLUMN category SET NOT NULL;

-- Step 6: Add check constraint for basic validation (optional)
ALTER TABLE public.events ADD CONSTRAINT category_not_empty CHECK (length(trim(category)) > 0);

-- Step 7: Add index for better performance
CREATE INDEX idx_events_category ON public.events(category);

-- Step 8: We can drop the enum type if it's not used elsewhere
-- DROP TYPE IF EXISTS public.event_category;

-- Fix location_name to be optional (can be null when no specific location)
ALTER TABLE public.events ALTER COLUMN location_name DROP NOT NULL;

-- Test: Verify the changes worked
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'events' AND column_name IN ('category', 'location_name')
ORDER BY column_name;