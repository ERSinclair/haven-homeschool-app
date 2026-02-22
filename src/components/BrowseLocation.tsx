'use client';

/**
 * BrowseLocation — lets users temporarily search from a different suburb.
 * Stores lat/lng in localStorage under 'haven-browse-location'.
 * Clears on explicit user action; persists across page navigation in the same session.
 */

import { useState } from 'react';
import { geocodeSuburb } from '@/lib/geocode';

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

type Props = {
  current: BrowseLocationState;
  onChange: (loc: BrowseLocationState) => void;
};

export default function BrowseLocation({ current, onChange }: Props) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);

  const handleSet = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setError('');
    const coords = await geocodeSuburb(input.trim());
    setLoading(false);
    if (!coords) {
      setError('Suburb not found — try a different spelling');
      return;
    }
    const loc: BrowseLocationState = { suburb: input.trim(), lat: coords.lat, lng: coords.lng };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(loc));
    onChange(loc);
    setInput('');
    setOpen(false);
  };

  const handleClear = () => {
    clearBrowseLocation();
    onChange(null);
    setOpen(false);
  };

  return (
    <div className="mb-4">
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
        <div className="mt-2 flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSet()}
            placeholder="Enter suburb e.g. Melbourne"
            className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            autoFocus
          />
          <button
            onClick={handleSet}
            disabled={loading || !input.trim()}
            className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 disabled:bg-gray-300 transition-colors"
          >
            {loading ? '...' : 'Go'}
          </button>
        </div>
      )}
      {error && <p className="text-xs text-red-500 mt-1 px-1">{error}</p>}
    </div>
  );
}
