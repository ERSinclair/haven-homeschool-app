// Onboarding funnel analytics
// Lightweight, Supabase-only — no third-party trackers

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function getSessionId(): string {
  if (typeof window === 'undefined') return 'ssr';
  let id = sessionStorage.getItem('haven-analytics-session');
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem('haven-analytics-session', id);
  }
  return id;
}

export async function trackOnboarding(
  event: string,
  properties: Record<string, unknown> = {}
) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/onboarding_events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        session_id: getSessionId(),
        event,
        properties,
      }),
    });
  } catch {
    // Never throw — analytics must not break the signup flow
  }
}
