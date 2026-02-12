-- Haven App: Circles Extension 
-- Private groups, circle events, and group chats
-- Run this in Supabase SQL Editor after the main schema

-- ============================================
-- CIRCLES (Private Groups)
-- ============================================

CREATE TABLE public.circles (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  
  -- Circle info
  name text NOT NULL,
  description text,
  emoji text DEFAULT '👥', -- Fun circle icon
  color text DEFAULT 'teal', -- UI theme color
  
  -- Settings
  is_active boolean DEFAULT true,
  max_members integer DEFAULT 20,
  
  -- Stats (computed)
  member_count integer DEFAULT 1, -- Creator is always first member
  last_activity_at timestamptz DEFAULT now()
);

-- ============================================
-- CIRCLE MEMBERS (Who's in each circle)
-- ============================================

CREATE TYPE public.circle_role AS ENUM ('admin', 'member');

CREATE TABLE public.circle_members (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  circle_id uuid REFERENCES public.circles(id) ON DELETE CASCADE,
  member_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  
  -- Member info
  role public.circle_role DEFAULT 'member',
  joined_at timestamptz DEFAULT now(),
  invited_by uuid REFERENCES public.profiles(id),
  
  -- Unique constraint: each person can only be in a circle once
  UNIQUE(circle_id, member_id)
);

-- ============================================
-- CIRCLE MESSAGES (Group Chat)
-- ============================================

CREATE TABLE public.circle_messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  circle_id uuid REFERENCES public.circles(id) ON DELETE CASCADE,
  sender_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  
  -- Message content
  content text NOT NULL,
  message_type text DEFAULT 'text', -- 'text', 'event', 'system'
  
  -- Read tracking (simplified - could be expanded)
  is_edited boolean DEFAULT false,
  edited_at timestamptz
);

-- ============================================
-- EXTEND EVENTS for Circle Privacy
-- ============================================

-- Add privacy types
CREATE TYPE public.event_privacy AS ENUM ('public', 'circle');

-- Extend events table
ALTER TABLE public.events 
  ADD COLUMN privacy public.event_privacy DEFAULT 'public',
  ADD COLUMN circle_id uuid REFERENCES public.circles(id) ON DELETE CASCADE;

-- ============================================
-- INDEXES for Performance
-- ============================================

-- Circle indexes
CREATE INDEX idx_circles_active ON public.circles(is_active) WHERE is_active = true;
CREATE INDEX idx_circles_creator ON public.circles(created_by, created_at DESC);

-- Circle members indexes  
CREATE INDEX idx_circle_members_circle ON public.circle_members(circle_id, joined_at);
CREATE INDEX idx_circle_members_member ON public.circle_members(member_id, joined_at);

-- Circle messages indexes
CREATE INDEX idx_circle_messages_circle ON public.circle_messages(circle_id, created_at DESC);
CREATE INDEX idx_circle_messages_sender ON public.circle_messages(sender_id, created_at DESC);

-- Events privacy index
CREATE INDEX idx_events_privacy ON public.events(privacy, circle_id) WHERE privacy = 'circle';

-- ============================================
-- ROW LEVEL SECURITY for Circles
-- ============================================

-- Enable RLS
ALTER TABLE public.circles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.circle_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.circle_messages ENABLE ROW LEVEL SECURITY;

-- Circles: Only members can see circles they belong to
CREATE POLICY "Members see own circles" ON public.circles FOR SELECT USING (
  id IN (
    SELECT circle_id FROM public.circle_members 
    WHERE member_id = auth.uid()
  )
);

-- Circles: Only creators can update their circles
CREATE POLICY "Creators manage own circles" ON public.circles FOR ALL USING (
  created_by = auth.uid()
);

-- Circle members: Members can see other members in their circles
CREATE POLICY "Members see circle members" ON public.circle_members FOR SELECT USING (
  circle_id IN (
    SELECT circle_id FROM public.circle_members 
    WHERE member_id = auth.uid()
  )
);

-- Circle members: Admins can manage membership
CREATE POLICY "Admins manage circle members" ON public.circle_members FOR ALL USING (
  circle_id IN (
    SELECT circle_id FROM public.circle_members 
    WHERE member_id = auth.uid() AND role = 'admin'
  )
  OR member_id = auth.uid() -- Users can leave themselves
);

-- Circle messages: Only members can see/send messages in their circles
CREATE POLICY "Members see circle messages" ON public.circle_messages FOR SELECT USING (
  circle_id IN (
    SELECT circle_id FROM public.circle_members 
    WHERE member_id = auth.uid()
  )
);

CREATE POLICY "Members send circle messages" ON public.circle_messages FOR INSERT WITH CHECK (
  circle_id IN (
    SELECT circle_id FROM public.circle_members 
    WHERE member_id = auth.uid()
  )
  AND sender_id = auth.uid()
);

-- Update events policy for circle events
CREATE POLICY "Circle members see circle events" ON public.events FOR SELECT USING (
  privacy = 'public' 
  OR (
    privacy = 'circle' 
    AND circle_id IN (
      SELECT circle_id FROM public.circle_members 
      WHERE member_id = auth.uid()
    )
  )
);

-- ============================================
-- TRIGGERS for Automatic Updates
-- ============================================

-- Auto-add creator as admin member when circle is created
CREATE OR REPLACE FUNCTION public.add_creator_to_circle()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.circle_members (circle_id, member_id, role, invited_by)
  VALUES (NEW.id, NEW.created_by, 'admin', NEW.created_by);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER add_creator_to_circle_trigger
  AFTER INSERT ON public.circles
  FOR EACH ROW EXECUTE FUNCTION public.add_creator_to_circle();

-- Update circle member count when members are added/removed
CREATE OR REPLACE FUNCTION public.update_circle_member_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.circles 
    SET member_count = (
      SELECT COUNT(*) FROM public.circle_members 
      WHERE circle_id = NEW.circle_id
    ),
    last_activity_at = now()
    WHERE id = NEW.circle_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.circles 
    SET member_count = (
      SELECT COUNT(*) FROM public.circle_members 
      WHERE circle_id = OLD.circle_id
    ),
    last_activity_at = now()
    WHERE id = OLD.circle_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER update_circle_member_count_trigger
  AFTER INSERT OR DELETE ON public.circle_members
  FOR EACH ROW EXECUTE FUNCTION public.update_circle_member_count();

-- Update last activity when messages are sent
CREATE OR REPLACE FUNCTION public.update_circle_activity()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.circles 
  SET last_activity_at = now()
  WHERE id = NEW.circle_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER update_circle_activity_trigger
  AFTER INSERT ON public.circle_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_circle_activity();

-- ============================================
-- SUCCESS MESSAGE
-- ============================================

SELECT '🔥 Circles extension created successfully! Users can now create private groups.' as result;