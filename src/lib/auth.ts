import { supabase } from './supabase'

// Sign up with email and password
export async function signUp(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  })
  return { data, error }
}

// Sign in with email and password
export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })
  return { data, error }
}

// Sign out
export async function signOut() {
  const { error } = await supabase.auth.signOut()
  return { error }
}

// Get current user
export async function getUser() {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// Get current session
export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

// Create or update user profile
export async function saveProfile(userId: string, profile: {
  name: string
  location_name: string
  location_lat?: number
  location_lng?: number
  kids_ages: number[]
  status: string
  contact_methods: string[]
  email?: string
  phone?: string
}) {
  // First verify we have an active session (required for RLS)
  const { data: { session } } = await supabase.auth.getSession()
  
  if (!session) {
    return { 
      data: null, 
      error: { message: 'No active session. Please try signing up again.' } 
    }
  }
  
  // Make sure the session user matches the profile we're creating
  if (session.user.id !== userId) {
    return { 
      data: null, 
      error: { message: 'Session mismatch. Please try signing up again.' } 
    }
  }

  const { data, error } = await supabase
    .from('profiles')
    .upsert({
      id: userId,
      ...profile,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single()
  
  return { data, error }
}

// Get user profile
export async function getProfile(userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  
  return { data, error }
}

// Check if user has a profile
export async function hasProfile(userId: string) {
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .single()
  
  return !!data
}
