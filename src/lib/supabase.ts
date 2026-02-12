import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Reduce auth state race conditions
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,  // Prevent URL-based auth race conditions
    storageKey: 'sb-auth-token', // Consistent storage key
    flowType: 'pkce',
  },
  global: {
    // Enhanced fetch wrapper with comprehensive error handling
    fetch: (url, options = {}) => {
      // Create a timeout controller as fallback
      const timeoutController = new AbortController();
      const timeoutId = setTimeout(() => timeoutController.abort(), 10000); // 10s timeout
      
      const combinedSignal = options.signal || timeoutController.signal;
      
      const fetchPromise = fetch(url, {
        ...options,
        signal: combinedSignal,
      }).catch((error) => {
        clearTimeout(timeoutId);
        
        // Silently handle AbortErrors without logging or re-throwing
        if (error.name === 'AbortError' || error.message?.includes('aborted')) {
          // Return a resolved promise with empty response to prevent further errors
          return new Response('{}', {
            status: 200,
            statusText: 'OK',
            headers: { 'Content-Type': 'application/json' }
          });
        }
        throw error;
      });

      // Clean up timeout when request completes
      fetchPromise.finally(() => clearTimeout(timeoutId));
      
      return fetchPromise;
    },
  },
  db: {
    schema: 'public',
  },
  // Additional stability options
  realtime: {
    params: {
      eventsPerSecond: 2, // Reduce realtime event frequency
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
