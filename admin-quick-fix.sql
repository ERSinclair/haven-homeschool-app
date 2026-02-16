-- Quick fix for admin stats - minimal version
-- Run this in Supabase SQL Editor if you need immediate access

-- Simple admin_stats view with default values
CREATE OR REPLACE VIEW public.admin_stats AS
SELECT 
  COALESCE((SELECT COUNT(*) FROM public.profiles WHERE is_active = true), 0) AS total_active_users,
  0 AS new_users_this_week,
  0 AS conversations_today, 
  0 AS messages_today,
  COALESCE((SELECT COUNT(*) FROM public.profiles WHERE is_banned = true), 0) AS banned_users,
  0 AS announcements_this_month;

-- Grant access
GRANT SELECT ON public.admin_stats TO anon, authenticated;

-- Test the view
SELECT * FROM public.admin_stats;