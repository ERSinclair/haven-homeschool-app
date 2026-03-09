import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    storageKey: 'sb-auth-token',
  },
  db: {
    schema: 'public',
  },
  realtime: {
    params: {
      eventsPerSecond: 2,
    },
  },
})

// Type definitions - Clean Haven Schema (matches database exactly)
export type Profile = {
  id: string
  created_at: string
  updated_at: string
  email?: string
  family_name: string
  display_name?: string
  username?: string
  avatar_url?: string
  bio?: string
  location_name?: string
  location_lat?: number
  location_lng?: number
  kids_ages: number[]
  status: string
  contact_methods: string[]
  interests: string[]
  is_admin: boolean
  is_banned: boolean
  is_verified: boolean
  is_active: boolean
  is_supporter?: boolean
  supporter_since?: string
  supporter_tier?: string
  supporter_display_name?: string
  stripe_customer_id?: string
  stripe_subscription_id?: string
  last_seen_at: string
}

export type Conversation = {
  id: string
  created_at: string
  updated_at: string
  participant_1: string
  participant_2: string
  last_message_text?: string
  last_message_at?: string
  last_message_by?: string
}

export type Message = {
  id: string
  created_at: string
  conversation_id: string
  sender_id: string
  content: string
  read_at?: string
}

export type Event = {
  id: string
  created_at: string
  updated_at: string
  host_id: string
  title: string
  description?: string
  category: 'playdate' | 'learning' | 'co-op'
  event_date: string
  event_time: string
  location_name: string
  location_details?: string
  location_lat?: number
  location_lng?: number
  show_exact_location: boolean
  age_range?: string
  max_attendees?: number
  is_cancelled: boolean
}

export type EventRsvp = {
  id: string
  created_at: string
  event_id: string
  profile_id: string
  status: 'going' | 'maybe' | 'cancelled'
}
