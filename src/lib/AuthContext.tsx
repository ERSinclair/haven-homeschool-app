'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from './supabase';
import { User, Session } from '@supabase/supabase-js';

type Profile = {
  id: string;
  name: string;
  email?: string;
  location_name: string;
  location_lat?: number;
  location_lng?: number;
  kids_ages: number[];
  status: string;
  bio?: string;
  interests?: string[];
  contact_methods: string[];
  avatar_url?: string;
  is_verified: boolean;
};

type AuthContextType = {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isUnmounted, setIsUnmounted] = useState(false);

  const fetchProfile = async (userId: string, signal?: AbortSignal) => {
    if (isUnmounted || signal?.aborted) return;
    
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (signal?.aborted || isUnmounted) return;
      
      if (error) {
        console.error('Profile fetch error:', error);
        return;
      }
      
      if (data && !isUnmounted) {
        setProfile(data as Profile);
      }
    } catch (err) {
      // Suppress AbortError and other harmless errors during cleanup
      if (err instanceof Error && (err.name === 'AbortError' || isUnmounted)) {
        return;
      }
      console.error('Profile fetch exception:', err);
    }
  };

  const refreshProfile = async () => {
    if (user && !isUnmounted) {
      await fetchProfile(user.id);
    }
  };

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      if (!isUnmounted) {
        setUser(null);
        setProfile(null);
        setSession(null);
      }
    } catch (err) {
      // Suppress errors during cleanup
      if (err instanceof Error && (err.name === 'AbortError' || isUnmounted)) {
        return;
      }
      console.error('Sign out error:', err);
    }
  };

  useEffect(() => {
    let initialized = false;
    let isMounted = true;
    const abortController = new AbortController();
    
    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!isMounted || abortController.signal.aborted) return;
        
        try {
          if (!initialized) {
            initialized = true;
          }
          
          if (isMounted) {
            setSession(session);
            setUser(session?.user ?? null);
          }
          
          if (session?.user && isMounted) {
            await fetchProfile(session.user.id, abortController.signal);
          } else if (isMounted) {
            setProfile(null);
          }
          
          if (isMounted) {
            setLoading(false);
          }
        } catch (err) {
          // Suppress AbortError and cleanup-related errors
          if (err instanceof Error && (err.name === 'AbortError' || !isMounted)) {
            return;
          }
          console.error('Auth state change error:', err);
          if (isMounted) {
            setLoading(false);
          }
        }
      }
    );

    return () => {
      isMounted = false;
      setIsUnmounted(true);
      abortController.abort();
      subscription.unsubscribe();
    };
  }, [isUnmounted]);

  return (
    <AuthContext.Provider value={{ 
      user, 
      profile, 
      session, 
      loading, 
      signOut: handleSignOut,
      refreshProfile 
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
