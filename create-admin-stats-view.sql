-- Create admin stats view for the admin dashboard
-- Run this in Supabase SQL Editor

-- First, let's check what tables we have and create any missing ones
-- (This assumes the basic schema is already in place)

-- Create notifications table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  content text NOT NULL,
  type text DEFAULT 'announcement',
  target_type text DEFAULT 'all',
  target_value text,
  sent_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sent_at timestamptz DEFAULT now(),
  is_sent boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Create user_notifications table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.user_notifications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_id uuid REFERENCES public.notifications(id) ON DELETE CASCADE,
  is_read boolean DEFAULT false,
  read_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, notification_id)
);

-- Create the admin_stats view
CREATE OR REPLACE VIEW public.admin_stats AS
SELECT 
  (
    SELECT COUNT(*) 
    FROM public.profiles 
    WHERE is_active = true AND is_banned = false
  ) AS total_active_users,
  
  (
    SELECT COUNT(*) 
    FROM public.profiles 
    WHERE created_at >= (now() - interval '7 days')
  ) AS new_users_this_week,
  
  (
    SELECT COUNT(*)
    FROM public.conversations 
    WHERE DATE(created_at) = CURRENT_DATE
  ) AS conversations_today,
  
  (
    SELECT COUNT(*)
    FROM public.messages 
    WHERE DATE(created_at) = CURRENT_DATE
  ) AS messages_today,
  
  (
    SELECT COUNT(*) 
    FROM public.profiles 
    WHERE is_banned = true
  ) AS banned_users,
  
  (
    SELECT COUNT(*)
    FROM public.notifications 
    WHERE type = 'announcement' 
    AND sent_at >= date_trunc('month', now())
  ) AS announcements_this_month;

-- Grant access to the view
GRANT SELECT ON public.admin_stats TO anon, authenticated;

-- Add missing columns to profiles table if needed
DO $$ 
BEGIN
  -- Add banned_at column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'profiles' AND column_name = 'banned_at') THEN
    ALTER TABLE public.profiles ADD COLUMN banned_at timestamptz;
  END IF;
  
  -- Add banned_by column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'profiles' AND column_name = 'banned_by') THEN
    ALTER TABLE public.profiles ADD COLUMN banned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  
  -- Add ban_reason column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'profiles' AND column_name = 'ban_reason') THEN
    ALTER TABLE public.profiles ADD COLUMN ban_reason text;
  END IF;
END $$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_profiles_banned ON public.profiles(is_banned);
CREATE INDEX IF NOT EXISTS idx_profiles_active_created ON public.profiles(is_active, created_at);
CREATE INDEX IF NOT EXISTS idx_conversations_created_date ON public.conversations(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_created_date ON public.messages(created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_type_sent ON public.notifications(type, sent_at);

-- Test the view
SELECT * FROM public.admin_stats;