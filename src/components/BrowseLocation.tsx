'use client';

/**
 * BrowseLocation — lets users temporarily search from a different suburb.
 * Stores lat/lng in localStorage under 'haven-browse-location'.
 * Clears on explicit user action; persists across page navigation in the same session.
 */

import { useState, useRef, useEffect } from 'react';

export type BrowseLocationState = {
  suburb: string;
  lat: number;
  lng: number;
} | null;

const STORAGE_KEY = 'haven-browse-location';

export function loadBrowseLocation(): BrowseLocationState {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearBrowseLocation() {
  if (typeof window !== 'undefined') localStorage.removeItem(STORAGE_KEY);
}

type Suggestion = { name: string; lat: number; lng: number };

type Props = {
  current: BrowseLocationState;
  onChange: (loc: BrowseLocationState) => void;
};

export default function BrowseLocation({ current, onChange }: Props) {
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setSuggestions([]);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fetchSuggestions = (value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const q = encodeURIComponent(`${value}, Australia`);
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=6&countrycodes=au&addressdetails=1`,
          { headers: { 'Accept-Language': 'en', 'User-Agent': 'HavenApp/1.0' } }
        );
        const data = await res.json();
        setSuggestions(
          data.map((r: { display_name: string; lat: string; lon: string }) => ({
            name: r.display_name
              .split(',')
              .slice(0, 3)
              .map((s: string) => s.trim())
              .filter(Boolean)
              .join(', '),
            lat: parseFloat(r.lat),
            lng: parseFloat(r.lon),
          }))
        );
      } catch {
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 350);
  };

  const handleInputChange = (value: string) => {
    setInput(value);
    setError('');
    fetchSuggestions(value);
  };

  const selectSuggestion = (s: Suggestion) => {
    const suburb = s.name.split(',')[0].trim();
    const loc: BrowseLocationState = { suburb, lat: s.lat, lng: s.lng };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(loc));
    onChange(loc);
    setInput('');
    setSuggestions([]);
    setOpen(false);
  };

  const handleClear = () => {
    clearBrowseLocation();
    onChange(null);
    setOpen(false);
  };

  return (
    <div className="mb-4" ref={wrapperRef}>
      {current ? (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-sm">
          <span className="text-amber-700 font-medium flex-1">
            Browsing: {current.suburb}
          </span>
          <button
            onClick={() => setOpen(o => !o)}
            className="text-amber-600 hover:text-amber-800 font-medium text-xs"
          >
            Change
          </button>
          <button
            onClick={handleClear}
            className="text-amber-400 hover:text-red-500 font-bold text-base leading-none"
          >
            ×
          </button>
        </div>
      ) : (
        <button
          onClick={() => setOpen(o => !o)}
          className="w-full text-sm text-gray-400 hover:text-emerald-600 text-left px-1 transition-colors"
        >
          + Browse another location
        </button>
      )}

      {open && (
        <div className="mt-2 relative">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={e => handleInputChange(e.target.value)}
              placeholder="Type a suburb e.g. Geelong"
              className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              autoFocus
            />
            {searching && (
              <div className="absolute right-3 top-2.5 w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
            )}
          </div>

          {suggestions.length > 0 && (
            <ul className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
              {suggestions.map((s, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => selectSuggestion(s)}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-emerald-50 hover:text-emerald-800 transition-colors border-b border-gray-100 last:border-0"
                  >
                    {s.name}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {error && <p className="text-xs text-red-500 mt-1 px-1">{error}</p>}
        </div>
      )}
    </div>
  );
}
