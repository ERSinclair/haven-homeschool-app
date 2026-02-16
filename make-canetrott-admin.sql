-- Make canetrott@gmail.com an admin user
-- Run this in Supabase SQL Editor

UPDATE public.profiles 
SET is_admin = true, 
    updated_at = now()
WHERE email = 'canetrott@gmail.com';

-- Verify the change
SELECT id, email, family_name, is_admin, updated_at 
FROM public.profiles 
WHERE email = 'canetrott@gmail.com';