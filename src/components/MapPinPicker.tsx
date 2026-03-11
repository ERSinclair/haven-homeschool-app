'use client';

/**
 * MapPinPicker — search for a location or tap/drag a pin on the map.
 * Returns { name, lat, lng } via onSelect.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

// Block Mapbox telemetry — guard against double-patching
if (typeof window !== 'undefined' && !(window as any).__mapboxFetchPatched) {
  (window as any).__mapboxFetchPatched = true;
  const _origFetch = window.fetch.bind(window);
  window.fetch = function(input: RequestInfo | URL, init?: RequestInit) {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('events.mapbox.com') || url.includes('/events/v2') || url.includes('mapbox-turnstile')) {
      return Promise.resolve(new Response('{}', { status: 200 }));
    }
    return _origFetch(input, init);
  };
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';
const DEFAULT_CENTER: [number, number] = [144.3256, -38.3305]; // Torquay
const DEFAULT_ZOOM = 12;

interface GeoResult {
  place_name: string;
  center: [number, number];
}

interface SelectedLocation {
  name: string;
  lat: number;
  lng: number;
}

interface MapPinPickerProps {
  onSelect: (location: SelectedLocation) => void;
  initialLocation?: SelectedLocation | null;
  placeholder?: string;
  height?: number; // px, default 220
}

export default function MapPinPicker({
  onSelect,
  initialLocation = null,
  placeholder = 'Search for a location...',
  height = 220,
}: MapPinPickerProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const marker = useRef<mapboxgl.Marker | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [query, setQuery] = useState(initialLocation?.name ?? '');
  const [suggestions, setSuggestions] = useState<GeoResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selected, setSelected] = useState<SelectedLocation | null>(initialLocation);
  const debounce = useRef<NodeJS.Timeout | null>(null);

  // Init map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;
    mapboxgl.accessToken = MAPBOX_TOKEN;

    const initialCenter: [number, number] = initialLocation
      ? [initialLocation.lng, initialLocation.lat]
      : DEFAULT_CENTER;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: initialCenter,
      zoom: DEFAULT_ZOOM,
      attributionControl: false,
    });

    map.current.on('load', () => setIsLoaded(true));

    // Tap anywhere on map to drop pin
    map.current.on('click', (e) => {
      const { lng, lat } = e.lngLat;
      placePinAt(lng, lat, null);
    });

    return () => {
      map.current?.remove();
      map.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Place/move pin and optionally reverse-geocode name
  const placePinAt = useCallback(async (lng: number, lat: number, name: string | null) => {
    if (!map.current) return;

    if (!marker.current) {
      marker.current = new mapboxgl.Marker({ color: '#059669', draggable: true })
        .setLngLat([lng, lat])
        .addTo(map.current);

      // Drag end → reverse geocode
      marker.current.on('dragend', async () => {
        const pos = marker.current!.getLngLat();
        const resolved = await reversegeocode(pos.lng, pos.lat);
        const loc: SelectedLocation = { name: resolved, lat: pos.lat, lng: pos.lng };
        setSelected(loc);
        setQuery(resolved);
        onSelect(loc);
      });
    } else {
      marker.current.setLngLat([lng, lat]);
    }

    map.current.flyTo({ center: [lng, lat], zoom: 15, duration: 600 });

    const resolvedName = name ?? await reversegeocode(lng, lat);
    const loc: SelectedLocation = { name: resolvedName, lat, lng };
    setSelected(loc);
    setQuery(resolvedName);
    onSelect(loc);
  }, [onSelect]);

  // Place initial pin if provided
  useEffect(() => {
    if (isLoaded && initialLocation && !marker.current) {
      placePinAt(initialLocation.lng, initialLocation.lat, initialLocation.name);
    }
  }, [isLoaded, initialLocation, placePinAt]);

  // Search suggestions
  const search = useCallback(async (q: string) => {
    if (!q.trim() || !MAPBOX_TOKEN) { setSuggestions([]); return; }
    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json` +
        `?access_token=${MAPBOX_TOKEN}&proximity=144.3256,-38.3305&country=AU` +
        `&types=place,locality,address,poi&limit=5`;
      const res = await fetch(url);
      const data = await res.json();
      setSuggestions(data.features ?? []);
      setShowSuggestions(true);
    } catch { setSuggestions([]); }
  }, []);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => search(val), 300);
    if (!val) { setSuggestions([]); setShowSuggestions(false); }
  };

  const pickSuggestion = (r: GeoResult) => {
    const [lng, lat] = r.center;
    setShowSuggestions(false);
    setSuggestions([]);
    placePinAt(lng, lat, r.place_name);
  };

  const clearPin = () => {
    marker.current?.remove();
    marker.current = null;
    setSelected(null);
    setQuery('');
    setSuggestions([]);
    setShowSuggestions(false);
  };

  return (
    <div className="space-y-2">
      {/* Search bar */}
      <div className="relative">
        <div className="flex items-center gap-2 px-3 py-2.5 border border-gray-200 rounded-xl bg-white focus-within:ring-2 focus-within:ring-emerald-500 focus-within:border-transparent">
          <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={handleInput}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            placeholder={placeholder}
            className="flex-1 text-sm bg-transparent outline-none text-gray-800 placeholder-gray-400"
          />
          {selected && (
            <button onClick={clearPin} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
          )}
        </div>

        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
            {suggestions.map((r, i) => (
              <button
                key={i}
                onMouseDown={() => pickSuggestion(r)}
                className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 border-b border-gray-50 last:border-0"
              >
                {r.place_name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Map */}
      <div
        ref={mapContainer}
        style={{ height }}
        className="w-full rounded-xl overflow-hidden border border-gray-200"
      />
      <p className="text-xs text-gray-400 text-center">Search above or tap the map to drop a pin. Drag pin to adjust.</p>
    </div>
  );
}

async function reversegeocode(lng: number, lat: number): Promise<string> {
  if (!MAPBOX_TOKEN) return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json` +
      `?access_token=${MAPBOX_TOKEN}&types=poi,address,locality,place&limit=1`;
    const res = await fetch(url);
    const data = await res.json();
    return data.features?.[0]?.place_name ?? `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  } catch {
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }
}
