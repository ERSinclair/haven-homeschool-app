// Global user preferences stored in localStorage

const RADIUS_KEY = 'haven-search-radius';

export const DEFAULT_RADIUS = 50;
export const MIN_RADIUS = 5;
export const MAX_RADIUS = 250;

export function loadSearchRadius(): number {
  if (typeof window === 'undefined') return DEFAULT_RADIUS;
  const stored = localStorage.getItem(RADIUS_KEY);
  return stored ? parseInt(stored, 10) : DEFAULT_RADIUS;
}

export function saveSearchRadius(km: number): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(RADIUS_KEY, String(km));
}
