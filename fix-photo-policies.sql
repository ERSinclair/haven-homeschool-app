-- Fix photo upload RLS policy issues

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own photos" ON profile_photos;
DROP POLICY IF EXISTS "Users can insert their own photos" ON profile_photos;
DROP POLICY IF EXISTS "Users can update their own photos" ON profile_photos;
DROP POLICY IF EXISTS "Users can delete their own photos" ON profile_photos;

-- Create new, more permissive policies for photo uploads
CREATE POLICY "Enable read access for users to own photos" ON profile_photos
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Enable insert for users to own photos" ON profile_photos
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid());

CREATE POLICY "Enable update for users to own photos" ON profile_photos
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Enable delete for users to own photos" ON profile_photos
  FOR DELETE USING (user_id = auth.uid());

-- Also ensure the profile-photos storage bucket has the right policies
-- Note: This should be run in the Storage policies section, not the SQL editor

-- Storage Policy for profile-photos bucket:
-- Policy Name: "Users can upload their own photos"
-- Allowed operation: INSERT  
-- Target roles: authenticated
-- Policy definition: ((bucket_id = 'profile-photos'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))

-- Policy Name: "Users can update their own photos"  
-- Allowed operation: UPDATE
-- Target roles: authenticated
-- Policy definition: ((bucket_id = 'profile-photos'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))

-- Policy Name: "Users can delete their own photos"
-- Allowed operation: DELETE  
-- Target roles: authenticated
-- Policy definition: ((bucket_id = 'profile-photos'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))

-- Policy Name: "Users can view their own photos"
-- Allowed operation: SELECT
-- Target roles: authenticated  
-- Policy definition: ((bucket_id = 'profile-photos'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))