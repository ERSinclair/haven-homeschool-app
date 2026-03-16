/**
 * Shared Supabase API constants and header helpers.
 * Import SUPA_URL / SUPA_KEY / apiHeaders instead of re-reading env vars per file.
 */

export const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const SUPA_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Standard read headers (no Content-Type — good for GET requests).
 */
export function readHeaders(token: string): HeadersInit {
  return {
    apikey: SUPA_KEY,
    Authorization: `Bearer ${token}`,
  };
}

/**
 * Write headers — includes Content-Type: application/json.
 */
export function writeHeaders(token: string, extra?: Record<string, string>): HeadersInit {
  return {
    apikey: SUPA_KEY,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

/**
 * Write headers with Prefer: return=minimal (no body returned — faster).
 */
export function writeHeadersMinimal(token: string): HeadersInit {
  return writeHeaders(token, { Prefer: 'return=minimal' });
}

/**
 * Write headers with Prefer: return=representation (returns inserted/updated row).
 */
export function writeHeadersRepresentation(token: string): HeadersInit {
  return writeHeaders(token, { Prefer: 'return=representation' });
}
