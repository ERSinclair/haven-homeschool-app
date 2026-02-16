-- Add private event functionality
-- Run this in Supabase SQL Editor

-- Add is_private column to events table if it doesn't exist
DO $$ 
BEGIN
  -- Add is_private column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'events' AND column_name = 'is_private') THEN
    ALTER TABLE public.events ADD COLUMN is_private boolean DEFAULT false;
  END IF;
END $$;

-- Create index for better performance when filtering private events
CREATE INDEX IF NOT EXISTS idx_events_is_private ON public.events(is_private);

-- Update RLS policies for events to handle private events
-- (This assumes you have RLS enabled and want to restrict private events)

-- Create or update RLS policy for events
DROP POLICY IF EXISTS "Events are visible based on privacy settings" ON public.events;

CREATE POLICY "Events are visible based on privacy settings" ON public.events
FOR SELECT USING (
  -- Public events are visible to everyone
  is_private = false 
  OR 
  -- Private events are visible to the host
  host_id = auth.uid()
  OR
  -- Private events are visible to connections (if connections table exists)
  (is_private = true AND EXISTS (
    SELECT 1 FROM public.connections 
    WHERE (requester_id = auth.uid() AND accepter_id = host_id AND status = 'accepted')
    OR (requester_id = host_id AND accepter_id = auth.uid() AND status = 'accepted')
  ))
);

-- Test: Verify the column was added
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'events' AND column_name = 'is_private';