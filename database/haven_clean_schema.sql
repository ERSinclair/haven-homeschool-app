-- Haven: Clean Database Schema (Matches App Code Exactly)
-- Run this in Supabase SQL Editor

-- ============================================
-- PROFILES (matches signup form exactly)
-- ============================================

CREATE TABLE public.profiles (
  id uuid REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  
  -- Basic info (matches signup form)
  email text,
  family_name text NOT NULL,  -- Used by signup
  display_name text,          -- Used by signup
  username text UNIQUE,       -- Used by signup
  avatar_url text,
  bio text,
  
  -- Location (matches what app creates)
  location_name text,         -- "Torquay, VIC" - what signup sends
  location_lat numeric(10, 7),
  location_lng numeric(10, 7),
  
  -- Kids & preferences (matches signup)
  kids_ages integer[] DEFAULT '{}',
  status text DEFAULT 'connecting',        -- What signup sets
  contact_methods text[] DEFAULT '{"app"}', -- What signup sets
  interests text[] DEFAULT '{}',
  
  -- Admin & status
  is_admin boolean DEFAULT false,
  is_banned boolean DEFAULT false,
  is_verified boolean DEFAULT false,
  is_active boolean DEFAULT true,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  last_seen_at timestamptz DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_profiles_username ON public.profiles(username);
CREATE INDEX idx_profiles_location ON public.profiles(location_name);
CREATE INDEX idx_profiles_active ON public.profiles(is_active) WHERE is_active = true;

-- ============================================
-- CONVERSATIONS (matches app expectations)
-- ============================================

CREATE TABLE public.conversations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  participant_1 uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  participant_2 uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_message_text text,
  last_message_at timestamptz,
  last_message_by uuid REFERENCES public.profiles(id),
  
  UNIQUE(participant_1, participant_2)
);

-- ============================================
-- MESSAGES (matches app expectations)
-- ============================================

CREATE TABLE public.messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  content text NOT NULL,
  read_at timestamptz
);

-- Indexes for messages
CREATE INDEX idx_messages_conversation ON public.messages(conversation_id, created_at DESC);

-- ============================================
-- EVENTS (matches app expectations)
-- ============================================

CREATE TYPE public.event_category AS ENUM ('playdate', 'learning', 'co-op');
CREATE TYPE public.rsvp_status AS ENUM ('going', 'maybe', 'cancelled');

CREATE TABLE public.events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  host_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  category public.event_category NOT NULL,
  event_date date NOT NULL,
  event_time time NOT NULL,
  location_name text NOT NULL,
  location_details text,
  location_lat numeric(10, 7),
  location_lng numeric(10, 7),
  show_exact_location boolean DEFAULT false,
  age_range text,
  max_attendees integer,
  is_cancelled boolean DEFAULT false
);

-- ============================================
-- EVENT RSVPs (matches app expectations)  
-- ============================================

CREATE TABLE public.event_rsvps (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  event_id uuid REFERENCES public.events(id) ON DELETE CASCADE,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  status public.rsvp_status DEFAULT 'going',
  
  UNIQUE(event_id, profile_id)
);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_rsvps ENABLE ROW LEVEL SECURITY;

-- ============================================
-- SECURITY POLICIES
-- ============================================

-- Profiles: Users can see active profiles, edit their own
CREATE POLICY "Public profiles viewable" ON public.profiles
  FOR SELECT USING (is_active = true AND NOT is_banned);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR ALL USING (auth.uid() = id);

-- Conversations: Only participants can see
CREATE POLICY "Users see own conversations" ON public.conversations
  FOR ALL USING (auth.uid() = participant_1 OR auth.uid() = participant_2);

-- Messages: Only conversation participants can see
CREATE POLICY "Users see messages in their conversations" ON public.messages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.conversations 
      WHERE id = messages.conversation_id 
      AND (participant_1 = auth.uid() OR participant_2 = auth.uid())
    )
  );

-- Events: Public events viewable, hosts manage their own
CREATE POLICY "Public events viewable" ON public.events
  FOR SELECT USING (NOT is_cancelled);

CREATE POLICY "Hosts manage own events" ON public.events
  FOR ALL USING (auth.uid() = host_id);

-- RSVPs: Users manage their own RSVPs, hosts see all
CREATE POLICY "Users manage own RSVPs" ON public.event_rsvps
  FOR ALL USING (
    auth.uid() = profile_id 
    OR EXISTS (
      SELECT 1 FROM public.events 
      WHERE id = event_rsvps.event_id AND host_id = auth.uid()
    )
  );

-- ============================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_conversations_updated_at
  BEFORE UPDATE ON public.conversations  
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_events_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================
-- SUCCESS MESSAGE
-- ============================================

SELECT '✅ Haven clean database schema created successfully!' as result;