'use client';

import { useAuth } from '@/lib/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, ReactNode } from 'react';
import { updateLastActive } from '@/lib/activity';
import { registerServiceWorker } from '@/lib/push';

interface ProtectedRouteProps {
  children: ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const didSideEffect = useRef(false);

  useEffect(() => {
    if (user && !didSideEffect.current) {
      didSideEffect.current = true;
      updateLastActive();
      registerServiceWorker();
    }
  }, [user]);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/');
    }
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
      </div>
    );
  }

  if (!user) return null;

  return <>{children}</>;
}
