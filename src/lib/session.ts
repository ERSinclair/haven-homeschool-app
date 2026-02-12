// Bypass Supabase SDK for auth - read directly from localStorage

const STORAGE_KEY = 'sb-ryvecaicjhzfsikfedkp-auth-token';

export type StoredSession = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  expires_in: number;
  token_type: string;
  user: {
    id: string;
    email: string;
    [key: string]: any;
  };
};

export function getStoredSession(): StoredSession | null {
  if (typeof window === 'undefined') return null;
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    
    const session = JSON.parse(stored);
    
    // Check if expired
    const now = Math.floor(Date.now() / 1000);
    if (session.expires_at && session.expires_at < now) {
      // Session expired
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    
    return session;
  } catch {
    return null;
  }
}

export function clearStoredSession(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}

export function getAccessToken(): string | null {
  const session = getStoredSession();
  return session?.access_token || null;
}

export function getUserId(): string | null {
  const session = getStoredSession();
  return session?.user?.id || null;
}
