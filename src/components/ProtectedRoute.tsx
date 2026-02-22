'use client';

import { useAuth } from '@/lib/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState, ReactNode } from 'react';
import { updateLastActive } from '@/lib/activity';
import { registerServiceWorker } from '@/lib/push';

interface ProtectedRouteProps {
  children: ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [hasChecked, setHasChecked] = useState(false);

  // Check both auth context and localStorage for session
  const checkAuth = () => {
    if (typeof window === 'undefined') return false;
    
    // Check auth context first
    if (user) return true;
    
    // Fallback: check localStorage for manual session
    const storageKey = `sb-ryvecaicjhzfsikfedkp-auth-token`;
    try {
      const storedSession = localStorage.getItem(storageKey);
      if (storedSession) {
        const session = JSON.parse(storedSession);
        // Check if session exists and isn't expired
        if (session.access_token && session.user && session.expires_at) {
          const expiresAt = session.expires_at * 1000; // Convert to milliseconds
          return Date.now() < expiresAt;
        }
      }
    } catch (err) {
      console.error('Error checking stored session:', err);
    }
    
    return false;
  };

  useEffect(() => {
    // Only check once, with a reasonable delay
    if (!hasChecked) {
      const timer = setTimeout(() => {
        const isAuthenticated = checkAuth();
        setHasChecked(true);
        
        if (!loading && !isAuthenticated) {
          router.push('/');
        } else if (isAuthenticated) {
          updateLastActive();
          registerServiceWorker(); // Silently register SW for push notifications
        }
      }, 1000); // 1 second delay to allow auth state to fully settle

      return () => clearTimeout(timer);
    }
  }, [hasChecked, loading, router, user]);

  // Show loading while checking
  if (loading || !hasChecked) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  // Final auth check before rendering
  const isAuthenticated = checkAuth();
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500">Redirecting...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}