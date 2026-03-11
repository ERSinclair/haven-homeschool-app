'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { toast } from '@/lib/toast';

// Block Mapbox telemetry — guard against double-patching on re-renders
if (typeof window !== 'undefined' && !(window as any).__mapboxFetchPatched) {
  (window as any).__mapboxFetchPatched = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = function(input: RequestInfo | URL, init?: RequestInit) {
    const url = typeof input === 'string' ? input : input.toString();
    if (
      url.includes('events.mapbox.com') ||
      url.includes('/events/v2') ||
      url.includes('api.mapbox.com/events') ||
      url.includes('mapbox-turnstile')
    ) {
      return Promise.resolve(new Response('{}', { status: 200 }));
    }
    return originalFetch(input, init);
  };
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

type Family = {
  id: string;
  family_name: string;
  display_name?: string;
  location_name: string;
  kids_ages: number[];
  status: string;
  bio?: string;
  interests?: string[];
  is_verified: boolean;
  created_at: string;
  admin_level?: 'gold' | 'silver' | 'bronze' | null;
  location_lat?: number;
  location_lng?: number;
  avatar_url?: string;
};

type AgeFilter = 'all' | '0-2' | '3-5' | '6-10' | '11+';

interface FamilyMapProps {
  families: Family[];
  onFamilyClick?: (family: Family) => void;
  className?: string;
  userLocation?: { lat: number; lng: number } | null;
  searchRadius?: number;
  showRadius?: boolean;
  userProfileLocation?: string;
}

// In-memory geocoding cache — persists for the session
const geocodeCache = new Map<string, [number, number]>();

// Known locations (fallbacks before hitting the API)
const KNOWN_COORDS: { [key: string]: [number, number] } = {
  'Torquay':             [144.3256, -38.3305],
  'Geelong':             [144.3580, -38.1499],
  'Surf Coast':          [144.2500, -38.3000],
  'Bellarine Peninsula': [144.5000, -38.2500],
  'Ocean Grove':         [144.5208, -38.2575],
  'Barwon Heads':        [144.4958, -38.2683],
  'Anglesea':            [144.1856, -38.4089],
  'Lorne':               [143.9781, -38.5433],
  'Winchelsea':          [143.9856, -38.2475],
  'Colac':               [143.5856, -38.3422],
  'Portarlington':       [144.6550, -38.0833],
  'Queenscliff':         [144.6658, -38.2650],
  'Point Lonsdale':      [144.6161, -38.2917],
  'Drysdale':            [144.5775, -38.1689],
  'Leopold':             [144.4489, -38.1856],
  'Melbourne':           [144.9631, -37.8136],
  'Ballarat':            [143.8503, -37.5622],
  'Bendigo':             [144.2822, -36.7570],
  'Warrnambool':         [142.4806, -38.3835],
  'Hamilton':            [142.0217, -37.7395],
  'Shepparton':          [145.3989, -36.3807],
  'Wodonga':             [146.8880, -36.1219],
  'Wangaratta':          [146.3120, -36.3582],
  'Mildura':             [142.1520, -34.2358],
  'Swan Hill':           [143.5544, -35.3380],
  'Echuca':              [144.7570, -36.1326],
  'Sale':                [147.0659, -38.1042],
  'Bairnsdale':          [147.6082, -37.8333],
  'Traralgon':           [146.5400, -38.1953],
  'Moe':                 [146.2680, -38.1725],
  'Morwell':             [146.3950, -38.2328],
  'Frankston':           [145.1278, -38.1440],
  'Mornington':          [145.0370, -38.2187],
  'Rosebud':             [144.9097, -38.3620],
  'Sorrento':            [144.7410, -38.3455],
  'Portsea':             [144.7107, -38.3161],
  'Rye':                 [144.8333, -38.3667],
  'Dromana':             [144.9697, -38.3357],
  'Flinders':            [144.9896, -38.4739],
  'Hastings':            [145.1919, -38.2994],
  'Cranbourne':          [145.2830, -38.1028],
  'Pakenham':            [145.4873, -38.0718],
  'Drouin':              [145.8569, -38.1367],
  'Warragul':            [145.9309, -38.1586],
};

const DEFAULT_COORDS: [number, number] = [144.3256, -38.3305]; // Torquay

async function geocodeLocation(locationName: string): Promise<[number, number]> {
  if (!locationName?.trim()) return DEFAULT_COORDS;

  const key = locationName.toLowerCase().trim();

  // 1. Check session cache
  if (geocodeCache.has(key)) return geocodeCache.get(key)!;

  // 2. Check known list (partial match)
  const knownKey = Object.keys(KNOWN_COORDS).find(
    k => key.includes(k.toLowerCase()) || k.toLowerCase().includes(key)
  );
  if (knownKey) {
    geocodeCache.set(key, KNOWN_COORDS[knownKey]);
    return KNOWN_COORDS[knownKey];
  }

  // 3. Hit Mapbox Geocoding API
  if (MAPBOX_TOKEN) {
    try {
      const encoded = encodeURIComponent(`${locationName}, Australia`);
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?country=AU&types=locality,place,neighborhood,region&limit=1&access_token=${MAPBOX_TOKEN}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.features?.length > 0) {
        const [lng, lat] = data.features[0].center;
        const coords: [number, number] = [lng, lat];
        geocodeCache.set(key, coords);
        return coords;
      }
    } catch {
      // Fall through to default
    }
  }

  return DEFAULT_COORDS;
}

// Randomise coords using family ID as a stable seed — spreads stacked pins, biased slightly
// north to avoid pushing coastal users into the ocean
function randomiseCoords(lng: number, lat: number, familyId: string): [number, number] {
  const seed = familyId.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
  const rng = (s: number) => { const x = Math.sin(s) * 10000; return x - Math.floor(x); };
  // Bias angle: 0–270 degrees (avoid due-south 270–360 range to reduce ocean placement)
  const angle = rng(seed) * 1.5 * Math.PI; // 0 to 270 degrees
  const distance = 0.3 + rng(seed + 1) * 1.5; // 300m–1.8km spread
  const kmPerLat = 110.574;
  const kmPerLng = 111.320 * Math.cos(lat * Math.PI / 180);
  return [lng + (distance * Math.sin(angle)) / kmPerLng, lat + (distance * Math.cos(angle)) / kmPerLat];
}

function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function buildRadiusCircle(center: { lat: number; lng: number }, radiusKm: number, points = 64) {
  const kmPerLat = 110.574;
  const kmPerLng = 111.320 * Math.cos(center.lat * Math.PI / 180);
  const coords: number[][] = [];
  for (let i = 0; i <= points; i++) {
    const angle = (i * 2 * Math.PI) / points;
    coords.push([
      center.lng + (radiusKm / kmPerLng) * Math.cos(angle),
      center.lat + (radiusKm / kmPerLat) * Math.sin(angle),
    ]);
  }
  return {
    type: 'Feature' as const,
    geometry: { type: 'Polygon' as const, coordinates: [coords] },
    properties: {},
  };
}

export default function FamilyMap({
  families,
  onFamilyClick,
  className = '',
  userLocation,
  searchRadius = 10,
  showRadius = false,
  userProfileLocation,
}: FamilyMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [ageFilter, setAgeFilter] = useState<AgeFilter>('all');
  const hasAutoFlown = useRef(false);
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const familiesRef = useRef<Family[]>(families);

  // Keep ref in sync so click handlers always have latest families list
  useEffect(() => { familiesRef.current = families; }, [families]);

  // Auto-fly to user's location once map is loaded
  useEffect(() => {
    if (!isLoaded || !userProfileLocation || hasAutoFlown.current) return;
    hasAutoFlown.current = true;
    geocodeLocation(userProfileLocation).then(coords => {
      map.current?.flyTo({ center: coords, zoom: 12, duration: 1500 });
    });
  }, [isLoaded, userProfileLocation]);

  const matchesAgeFilter = (kidsAges: number[]) => {
    if (ageFilter === 'all') return true;
    if (!kidsAges?.length) return false;
    if (ageFilter === '0-2') return kidsAges.some(a => a <= 2);
    if (ageFilter === '3-5') return kidsAges.some(a => a >= 3 && a <= 5);
    if (ageFilter === '6-10') return kidsAges.some(a => a >= 6 && a <= 10);
    if (ageFilter === '11+') return kidsAges.some(a => a >= 11);
    return true;
  };

  const locateUser = async () => {
    setIsLocating(true);
    try {
      if (!userProfileLocation) {
        toast('No location set on your profile. Update your profile first.', 'error');
        return;
      }
      const coords = await geocodeLocation(userProfileLocation);
      map.current?.flyTo({ center: coords, zoom: 13, duration: 2000 });
    } catch {
      toast('Could not find your location. Check your profile suburb.', 'error');
    } finally {
      setIsLocating(false);
    }
  };

  // Initialise map once
  useEffect(() => {
    if (!mapContainer.current || !MAPBOX_TOKEN) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [144.3256, -38.3305],
      zoom: 10,
      collectResourceTiming: false,
      attributionControl: false,
      transformRequest: (url: string) => {
        if (
          url.includes('events.mapbox.com') ||
          url.includes('api.mapbox.com/events') ||
          url.includes('/events/v2') ||
          url.includes('mapbox-turnstile')
        ) {
          return { url: '', headers: {} };
        }
        return { url };
      },
    });

    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

    map.current.on('load', () => {
      if (!map.current) return;

      // --- Radius circle ---
      map.current.addSource('radius-circle', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.current.addLayer({
        id: 'radius-circle-fill',
        type: 'fill',
        source: 'radius-circle',
        paint: { 'fill-color': '#059669', 'fill-opacity': 0.08 },
      });
      map.current.addLayer({
        id: 'radius-circle-stroke',
        type: 'line',
        source: 'radius-circle',
        paint: { 'line-color': '#047857', 'line-width': 2, 'line-opacity': 0.7 },
      });

      // --- Clustered family source ---
      map.current.addSource('families', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        cluster: true,
        clusterMaxZoom: 13,
        clusterRadius: 45,
      });

      // Cluster bubble
      map.current.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'families',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#059669',
          'circle-radius': ['step', ['get', 'point_count'], 20, 5, 28, 15, 36],
          'circle-opacity': 0.9,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#fff',
        },
      });

      // Cluster count label
      map.current.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'families',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
          'text-size': 13,
        },
        paint: { 'text-color': '#fff' },
      });

      // Individual pin
      map.current.addLayer({
        id: 'unclustered-point',
        type: 'circle',
        source: 'families',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': '#059669',
          'circle-radius': 12,
          'circle-opacity': 0.9,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#fff',
        },
      });

      // Click cluster → zoom in
      map.current.on('click', 'clusters', (e) => {
        if (!map.current) return;
        const features = map.current.queryRenderedFeatures(e.point, { layers: ['clusters'] });
        if (!features.length) return;
        const clusterId = features[0].properties?.cluster_id;
        (map.current.getSource('families') as mapboxgl.GeoJSONSource)
          .getClusterExpansionZoom(clusterId, (err, zoom) => {
            if (err || !map.current) return;
            map.current.easeTo({
              center: (features[0].geometry as GeoJSON.Point).coordinates as [number, number],
              zoom: zoom ?? 14,
            });
          });
      });

      // Click individual pin → popup (works on mobile tap too)
      map.current.on('click', 'unclustered-point', (e) => {
        if (!map.current || !e.features?.length) return;
        const props = e.features[0].properties!;
        const coords = (e.features[0].geometry as GeoJSON.Point).coordinates as [number, number];
        const family = familiesRef.current.find(f => f.id === props.id);
        const displayName = props.display_name || (props.family_name as string)?.split(' ')[0] || 'Family';

        const kidsAges: number[] = (() => { try { return JSON.parse(props.kids_ages || '[]'); } catch { return []; } })();

        const popupEl = document.createElement('div');
        popupEl.className = 'p-3 min-w-[170px]';

        // Avatar + name row
        const headerEl = document.createElement('div');
        headerEl.className = 'flex items-center gap-2 mb-2';
        const avatarEl = document.createElement('div');
        avatarEl.className = 'w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 overflow-hidden';
        if (props.avatar_url) {
          const img = document.createElement('img');
          img.src = props.avatar_url;
          img.className = 'w-full h-full object-cover';
          img.alt = displayName;
          avatarEl.appendChild(img);
        } else {
          const initEl = document.createElement('span');
          initEl.className = 'text-emerald-700 font-bold text-sm';
          initEl.textContent = displayName.charAt(0).toUpperCase();
          avatarEl.appendChild(initEl);
        }
        const nameBlockEl = document.createElement('div');
        const nameEl = document.createElement('div');
        nameEl.className = 'font-semibold text-gray-900 text-sm leading-tight';
        nameEl.textContent = displayName;
        const locEl = document.createElement('div');
        locEl.className = 'text-xs text-gray-400 leading-tight';
        locEl.textContent = props.location_name;
        nameBlockEl.appendChild(nameEl);
        nameBlockEl.appendChild(locEl);
        headerEl.appendChild(avatarEl);
        headerEl.appendChild(nameBlockEl);
        popupEl.appendChild(headerEl);

        // Kids ages
        if (kidsAges.length > 0) {
          const agesRow = document.createElement('div');
          agesRow.className = 'flex gap-1 flex-wrap mb-2';
          kidsAges.forEach(age => {
            const chip = document.createElement('div');
            chip.className = 'w-6 h-6 bg-emerald-100 rounded-full flex items-center justify-center';
            const ageSpan = document.createElement('span');
            ageSpan.className = 'text-xs font-semibold text-emerald-700';
            ageSpan.textContent = String(age);
            chip.appendChild(ageSpan);
            agesRow.appendChild(chip);
          });
          popupEl.appendChild(agesRow);
        }

        if (family && onFamilyClick) {
          const btn = document.createElement('button');
          btn.className = 'mt-1 px-3 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 transition-colors w-full';
          btn.textContent = 'View Profile';
          btn.onclick = () => onFamilyClick(family);
          popupEl.appendChild(btn);
        }

        new mapboxgl.Popup({ offset: 15, closeButton: true, closeOnClick: true })
          .setLngLat(coords)
          .setDOMContent(popupEl)
          .addTo(map.current);
      });

      // Cursor changes
      ['clusters', 'unclustered-point'].forEach(layer => {
        map.current!.on('mouseenter', layer, () => { map.current!.getCanvas().style.cursor = 'pointer'; });
        map.current!.on('mouseleave', layer, () => { map.current!.getCanvas().style.cursor = ''; });
      });

      setIsLoaded(true);
    });

    return () => { map.current?.remove(); };
  }, []);

  // Update family pins whenever families list or age filter changes
  useEffect(() => {
    if (!map.current || !isLoaded) return;

    const update = async () => {
      const filtered = families.filter(f => matchesAgeFilter(f.kids_ages));
      const geocoded = await Promise.all(
        filtered.map(async (family) => {
          let coords: [number, number];
          if (family.location_lat && family.location_lng) {
            // Apply jitter so users in the same suburb don't all stack on the same pin
            coords = randomiseCoords(family.location_lng, family.location_lat, family.id);
          } else if (family.location_name) {
            const base = await geocodeLocation(family.location_name);
            coords = randomiseCoords(base[0], base[1], family.id);
          } else {
            // No location data — exclude from map
            return null;
          }
          return { family, coords };
        })
      );
      // Remove entries with no location
      const allGeocoded = geocoded.filter((g): g is { family: Family; coords: [number, number] } => g !== null);

      // Apply radius filter if active
      const validGeocoded = allGeocoded.filter(({ coords }) => {
        if (showRadius && userLocation && searchRadius) {
          return calculateDistance(userLocation.lat, userLocation.lng, coords[1], coords[0]) <= searchRadius;
        }
        return true;
      });

      const geojson: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: validGeocoded.map(({ family, coords }) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: coords },
          properties: {
            id: family.id,
            family_name: family.family_name,
            display_name: family.display_name ?? null,
            location_name: family.location_name,
            is_verified: family.is_verified,
            admin_level: family.admin_level ?? null,
            avatar_url: family.avatar_url ?? null,
            kids_ages: JSON.stringify(family.kids_ages ?? []),
          },
        })),
      };

      (map.current?.getSource('families') as mapboxgl.GeoJSONSource)?.setData(geojson);

      // Fit map to visible families (only on first load, not on filter change)
      if (validGeocoded.length > 0 && !hasAutoFlown.current) {
        const bounds = new mapboxgl.LngLatBounds();
        validGeocoded.forEach(({ coords }) => bounds.extend(coords));
        map.current?.fitBounds(bounds, { padding: 60, maxZoom: 13, duration: 800 });
      }
    };

    update();
  }, [families, isLoaded, showRadius, userLocation, searchRadius, ageFilter]);

  // Update radius circle
  useEffect(() => {
    if (!map.current || !isLoaded) return;
    const source = map.current.getSource('radius-circle') as mapboxgl.GeoJSONSource;
    if (!source) return;

    if (showRadius && userLocation) {
      source.setData({
        type: 'FeatureCollection',
        features: [buildRadiusCircle(userLocation, searchRadius)],
      });

      if (userMarkerRef.current) userMarkerRef.current.remove();
      const el = document.createElement('div');
      el.className = 'w-3.5 h-3.5 bg-emerald-600 rounded-full border-2 border-white shadow-md';
      el.title = 'Your location';
      userMarkerRef.current = new mapboxgl.Marker(el)
        .setLngLat([userLocation.lng, userLocation.lat])
        .addTo(map.current);
    } else {
      source.setData({ type: 'FeatureCollection', features: [] });
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
    }
  }, [userLocation, searchRadius, showRadius, isLoaded]);

  if (!MAPBOX_TOKEN) {
    return (
      <div className={`relative ${className}`}>
        <div className="w-full h-[600px] rounded-xl bg-emerald-50 border-2 border-dashed border-emerald-200 flex items-center justify-center">
          <p className="text-gray-500 text-sm">Map token missing</p>
        </div>
      </div>
    );
  }

  const AGE_FILTERS: { label: string; value: AgeFilter }[] = [
    { label: 'All ages', value: 'all' },
    { label: '0–2', value: '0-2' },
    { label: '3–5', value: '3-5' },
    { label: '6–10', value: '6-10' },
    { label: '11+', value: '11+' },
  ];

  return (
    <div className={`relative ${className}`}>
      {/* Age filter chips */}
      <div className="flex gap-2 mb-3 flex-wrap">
        {AGE_FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setAgeFilter(f.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              ageFilter === f.value
                ? 'bg-emerald-600 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-emerald-400'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="relative">
        <div ref={mapContainer} className="w-full h-[560px] rounded-xl overflow-hidden shadow-lg" />

        {/* Locate Me button */}
        <button
          onClick={locateUser}
          disabled={isLocating}
          className="absolute top-4 left-4 bg-white rounded-lg shadow-lg p-3 hover:bg-gray-50 transition-colors disabled:opacity-50 z-10"
          title={`Centre on my location${userProfileLocation ? ` (${userProfileLocation})` : ''}`}
        >
          {isLocating ? (
            <div className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg className="w-5 h-5 text-emerald-600" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0 0 13 3.06V1h-2v2.06A8.994 8.994 0 0 0 3.06 11H1v2h2.06A8.994 8.994 0 0 0 11 20.94V23h2v-2.06A8.994 8.994 0 0 0 20.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z" />
            </svg>
          )}
        </button>

        {!isLoaded && (
          <div className="absolute inset-0 bg-gray-100 rounded-xl flex items-center justify-center">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-gray-600 text-sm">Loading map...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
