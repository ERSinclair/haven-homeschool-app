import { getStoredSession } from './session';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Debounce: only ping once per 5 minutes per session
let lastPing = 0;
const PING_INTERVAL_MS = 5 * 60 * 1000;

export async function updateLastActive(): Promise<void> {
  const now = Date.now();
  if (now - lastPing < PING_INTERVAL_MS) return;
  lastPing = now;

  try {
    const session = getStoredSession();
    if (!session?.user?.id) return;

    await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${session.user.id}`,
      {
        method: 'PATCH',
        headers: {
          'apikey': supabaseKey!,
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({ last_active_at: new Date().toISOString() }),
      }
    );
  } catch {
    // Silent — non-critical
  }
}

export function isOnline(lastActiveAt?: string): boolean {
  if (!lastActiveAt) return false;
  return Date.now() - new Date(lastActiveAt).getTime() < 15 * 60 * 1000; // 15 min
}

export function formatLastActive(lastActiveAt?: string): string {
  if (!lastActiveAt) return '';
  const diffMs = Date.now() - new Date(lastActiveAt).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMin < 15) return 'Active now';
  if (diffMin < 60) return `Active ${diffMin}m ago`;
  if (diffHours < 24) return `Active ${diffHours}h ago`;
  if (diffDays === 1) return 'Active yesterday';
  if (diffDays < 7) return `Active ${diffDays}d ago`;
  return 'Active this month';
}
