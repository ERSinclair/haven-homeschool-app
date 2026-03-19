'use client';

import { useAuth } from '@/lib/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, ReactNode } from 'react';
import { updateLastActive } from '@/lib/activity';
import { registerServiceWorker } from '@/lib/push';

interface ProtectedRouteProps {
  children: ReactNode;
}

// Always render a spinner on the server (static HTML).
// On the client, suppress rendering until after first paint so the
// initial client tree matches the server HTML (no hydration mismatch).
function Spinner() {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
    </div>
  );
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const didSideEffect = useRef(false);
  // Start as false — matches what the server renders (spinner).
  // Flip to true after mount so we only show content on the client.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  useEffect(() => {
    if (user && !didSideEffect.current) {
      didSideEffect.current = true;
      updateLastActive();
      registerServiceWorker();
    }
  }, [user]);

  useEffect(() => {
    if (ready && !loading && !user) {
      router.push('/');
    }
  }, [ready, loading, user, router]);

  // Before mount: always spinner (matches server HTML)
  if (!ready) return <Spinner />;

  // After mount: show spinner while auth resolves
  if (loading) return <Spinner />;

  // Auth resolved but no user — redirect in progress
  if (!user) return null;

  return <>{children}</>;
}
