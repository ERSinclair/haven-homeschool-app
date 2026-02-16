-- Haven App: Message Files Storage Setup
-- Run this in Supabase SQL Editor to enable file sharing in messages

-- 1. Create the message-files storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) 
VALUES (
  'message-files', 
  'message-files', 
  true, 
  5242880, -- 5MB limit
  ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml',
    'application/pdf', 'application/msword', 
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain', 'text/csv', 'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
);

-- 2. Policy: Users can upload files for messages they can access
CREATE POLICY "Users upload message files" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'message-files' 
  AND auth.role() = 'authenticated' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 3. Policy: Users can update files they uploaded
CREATE POLICY "Users update own message files" ON storage.objects FOR UPDATE USING (
  bucket_id = 'message-files' 
  AND auth.role() = 'authenticated' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 4. Policy: Users can delete files they uploaded
CREATE POLICY "Users delete own message files" ON storage.objects FOR DELETE USING (
  bucket_id = 'message-files' 
  AND auth.role() = 'authenticated' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 5. Policy: Public read access for message files (since conversations are private)
CREATE POLICY "Public read message files" ON storage.objects FOR SELECT USING (
  bucket_id = 'message-files'
);

-- 6. Update messages table to support file attachments (if columns don't exist)
DO $$ 
BEGIN
  -- Add file_url column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'file_url') THEN
    ALTER TABLE messages ADD COLUMN file_url TEXT;
  END IF;
  
  -- Add file_type column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'file_type') THEN
    ALTER TABLE messages ADD COLUMN file_type TEXT;
  END IF;
  
  RAISE NOTICE 'Message file columns ready!';
END $$;

-- 7. Verify the setup
SELECT 'Message files storage bucket created!' as status;
SELECT id, name, public, file_size_limit FROM storage.buckets WHERE id = 'message-files';

-- Show the messages table structure
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'messages' 
ORDER BY ordinal_position;