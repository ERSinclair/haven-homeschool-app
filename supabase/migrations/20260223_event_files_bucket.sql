-- Create event-files storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('event-files', 'event-files', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies
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
    AND auth.uid()::text = owner
  );

CREATE POLICY "event_files_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'event-files'
    AND auth.uid()::text = owner
  );
