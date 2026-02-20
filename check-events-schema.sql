-- Check current events table schema
-- Run this in Supabase SQL Editor to verify the migration worked

SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'events' 
ORDER BY ordinal_position;