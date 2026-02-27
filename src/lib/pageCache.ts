/**
 * Simple sessionStorage cache for page data.
 * Shows stale data instantly, refreshes in background.
 * TTL default: 2 minutes.
 */

interface CacheEntry<T> {
  data: T;
  ts: number;
}

export function getCached<T>(key: string, maxAgeMs = 120_000): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(`hc:${key}`);
    if (!raw) return null;
    const entry: CacheEntry<T> = JSON.parse(raw);
    if (Date.now() - entry.ts > maxAgeMs) return null;
    return entry.data;
  } catch {
    return null;
  }
}

export function setCached<T>(key: string, data: T): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(`hc:${key}`, JSON.stringify({ data, ts: Date.now() }));
  } catch {
    // storage full — clear old entries and try once more
    try {
      const keys = Object.keys(sessionStorage).filter(k => k.startsWith('hc:'));
      keys.forEach(k => sessionStorage.removeItem(k));
      sessionStorage.setItem(`hc:${key}`, JSON.stringify({ data, ts: Date.now() }));
    } catch { /* give up */ }
  }
}

export function clearCached(key: string): void {
  if (typeof window === 'undefined') return;
  try { sessionStorage.removeItem(`hc:${key}`); } catch { /* ignore */ }
}
