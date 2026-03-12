-- Backfill email from auth.users into profiles where it's missing
-- Run this once in Supabase SQL editor to fix existing accounts

UPDATE profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id
  AND (p.email IS NULL OR p.email = '');
