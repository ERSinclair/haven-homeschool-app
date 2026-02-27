-- Add status column to reports table for moderation tracking
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS status text DEFAULT NULL;

-- Add index for filtering by status
CREATE INDEX IF NOT EXISTS reports_status_idx ON public.reports(status);

-- Allow admins to update report status (RLS)
CREATE POLICY IF NOT EXISTS "Admins can update reports"
  ON public.reports FOR UPDATE USING (true);
