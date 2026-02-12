-- Haven App: Storage Setup for Profile Photos
-- Copy and paste this into Supabase SQL Editor

-- 1. Create the storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) 
VALUES (
  'profile-photos', 
  'profile-photos', 
  true, 
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
);

-- 2. Policy: Users can upload to their own folder only
CREATE POLICY "Users upload own avatars" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'profile-photos' 
  AND auth.role() = 'authenticated' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 3. Policy: Users can update their own avatars
CREATE POLICY "Users update own avatars" ON storage.objects FOR UPDATE USING (
  bucket_id = 'profile-photos' 
  AND auth.role() = 'authenticated' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 4. Policy: Users can delete their own avatars
CREATE POLICY "Users delete own avatars" ON storage.objects FOR DELETE USING (
  bucket_id = 'profile-photos' 
  AND auth.role() = 'authenticated' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 5. Policy: Public read access for all profile photos
CREATE POLICY "Public read profile photos" ON storage.objects FOR SELECT USING (
  bucket_id = 'profile-photos'
);

-- 6. Verify the setup
SELECT 'Storage bucket created!' as status;
SELECT id, name, public FROM storage.buckets WHERE id = 'profile-photos';