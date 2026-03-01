// Bypass Supabase SDK for auth - read directly from localStorage

const STORAGE_KEY = 'sb-ryvecaicjhzfsikfedkp-auth-token';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ryvecaicjhzfsikfedkp.supabase.co';
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

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

// In-flight refresh promise — prevents multiple simultaneous refresh calls
let refreshPromise: Promise<StoredSession | null> | null = null;

async function refreshSession(refreshToken: string): Promise<StoredSession | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!res.ok) {
      // Refresh token is invalid/expired — clear session
      if (typeof window !== 'undefined') localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    const data = await res.json();
    const session: StoredSession = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at ?? Math.floor(Date.now() / 1000) + (data.expires_in ?? 3600),
      expires_in: data.expires_in ?? 3600,
      token_type: data.token_type ?? 'bearer',
      user: data.user,
    };

    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    }

    return session;
  } catch {
    return null;
  }
}

export function getStoredSession(): StoredSession | null {
  if (typeof window === 'undefined') return null;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;

    const session: StoredSession = JSON.parse(stored);
    const now = Math.floor(Date.now() / 1000);

    // Refresh proactively if expiring within 5 minutes
    if (session.expires_at && session.expires_at - now < 300) {
      if (session.refresh_token) {
        // Kick off background refresh — don't block the caller
        if (!refreshPromise) {
          refreshPromise = refreshSession(session.refresh_token).finally(() => {
            refreshPromise = null;
          });
        }
      } else {
        // No refresh token, session is done
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }

      // If already fully expired, return null
      if (session.expires_at < now) {
        return null;
      }
    }

    return session;
  } catch {
    return null;
  }
}

export async function getStoredSessionAsync(): Promise<StoredSession | null> {
  if (typeof window === 'undefined') return null;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;

    const session: StoredSession = JSON.parse(stored);
    const now = Math.floor(Date.now() / 1000);

    if (session.expires_at && session.expires_at < now) {
      if (!session.refresh_token) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      // Await the refresh so caller gets a valid token
      if (!refreshPromise) {
        refreshPromise = refreshSession(session.refresh_token).finally(() => {
          refreshPromise = null;
        });
      }
      return await refreshPromise;
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
