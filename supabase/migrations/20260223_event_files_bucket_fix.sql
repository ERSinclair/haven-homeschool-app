-- Event files storage bucket (safe re-run)
INSERT INTO storage.buckets (id, name, public)
VALUES ('event-files', 'event-files', true)
ON CONFLICT (id) DO NOTHING;

-- Drop existing policies first to avoid conflicts
DROP POLICY IF EXISTS "event_files_read" ON storage.objects;
DROP POLICY IF EXISTS "event_files_insert" ON storage.objects;
DROP POLICY IF EXISTS "event_files_update" ON storage.objects;
DROP POLICY IF EXISTS "event_files_delete" ON storage.objects;

-- Recreate with correct types (owner is uuid, no cast needed)
CREATE POLICY "event_files_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'event-files');

CREATE POLICY "event_files_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'event-files'
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "event_files_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'event-files'
    AND owner = auth.uid()
  );

CREATE POLICY "event_files_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'event-files'
    AND owner = auth.uid()
  );
