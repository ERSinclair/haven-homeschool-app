'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

// Aggressive telemetry blocking - intercept fetch
if (typeof window !== 'undefined') {
  const originalFetch = window.fetch;
  window.fetch = function(input: RequestInfo | URL, init?: RequestInit) {
    const url = typeof input === 'string' ? input : input.toString();
    
    // Block all Mapbox telemetry endpoints
    if (url.includes('events.mapbox.com') || 
        url.includes('/events/v2') ||
        url.includes('api.mapbox.com/events') ||
        url.includes('mapbox-turnstile')) {
      // Return a fake successful response
      return Promise.resolve(new Response('{}', { status: 200 }));
    }
    
    return originalFetch.call(this, input, init);
  };
}

// Mapbox access token - configured via environment variable
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
};

interface FamilyMapProps {
  families: Family[];
  onFamilyClick?: (family: Family) => void;
  className?: string;
  userLocation?: { lat: number; lng: number } | null;
  searchRadius?: number;
  showRadius?: boolean;
  userProfileLocation?: string; // User's location from their profile
}

// Predefined coordinates for common locations around Torquay/Geelong area
const LOCATION_COORDS: { [key: string]: [number, number] } = {
  'Torquay': [144.3256, -38.3305],
  'Geelong': [144.3580, -38.1499],
  'Surf Coast': [144.2500, -38.3000],
  'Bellarine Peninsula': [144.5000, -38.2500],
  'Ocean Grove': [144.5208, -38.2575],
  'Barwon Heads': [144.4958, -38.2683],
  'Anglesea': [144.1856, -38.4089],
  'Lorne': [143.9781, -38.5433],
  'Winchelsea': [143.9856, -38.2475],
  'Colac': [143.5856, -38.3422],
  'Portarlington': [144.6550, -38.0833],
  'Queenscliff': [144.6658, -38.2650],
  'Point Lonsdale': [144.6161, -38.2917],
  'Drysdale': [144.5775, -38.1689],
  'Leopold': [144.4489, -38.1856],
  'Melbourne': [144.9631, -37.8136], // In case some families are from Melbourne
};

// Function to get coordinates for a location
const getLocationCoords = (locationName: string): [number, number] => {
  // Try exact match first
  if (LOCATION_COORDS[locationName]) {
    return LOCATION_COORDS[locationName];
  }
  
  // Try partial match
  const partialMatch = Object.keys(LOCATION_COORDS).find(key =>
    locationName.toLowerCase().includes(key.toLowerCase()) ||
    key.toLowerCase().includes(locationName.toLowerCase())
  );
  
  if (partialMatch) {
    return LOCATION_COORDS[partialMatch];
  }
  
  // Default to Torquay if no match
  return LOCATION_COORDS['Torquay'];
};

// Function to generate random coordinates within 3km radius for privacy
const getRandomizedCoords = (baseLng: number, baseLat: number, familyId: string): [number, number] => {
  // Use family ID as seed for consistent positioning (same family always appears in same spot)
  const seed = familyId.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
  
  // Simple seeded random number generator
  const random = (seed: number) => {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  };
  
  // Generate random angle and distance
  const angle = random(seed) * 2 * Math.PI;
  const distance = random(seed + 1) * 3; // Random distance up to 3km
  
  // Convert distance to degrees (approximate)
  const kmPerDegreeLat = 110.574;
  const kmPerDegreeLng = 111.320 * Math.cos(baseLat * Math.PI / 180);
  
  const deltaLat = (distance * Math.cos(angle)) / kmPerDegreeLat;
  const deltaLng = (distance * Math.sin(angle)) / kmPerDegreeLng;
  
  return [baseLng + deltaLng, baseLat + deltaLat];
};

// Function to calculate distance between two points in km
const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

// Create a circle polygon for the radius visualization
function createCircle(center: { lat: number; lng: number }, radiusKm: number, points: number = 64) {
  const coords: number[][] = [];
  // More accurate conversion for Australia (lat around -38)
  const kmPerDegreeLat = 110.574; // More accurate for latitude
  const kmPerDegreeLng = 111.320 * Math.cos(center.lat * Math.PI / 180);
  
  const deltaLat = radiusKm / kmPerDegreeLat;
  const deltaLng = radiusKm / kmPerDegreeLng;

  for (let i = 0; i <= points; i++) {
    const angle = (i * 2 * Math.PI) / points;
    const x = deltaLng * Math.cos(angle);
    const y = deltaLat * Math.sin(angle);
    coords.push([center.lng + x, center.lat + y]);
  }

  return {
    type: 'Feature' as const,
    geometry: {
      type: 'Polygon' as const,
      coordinates: [coords]
    },
    properties: {}
  };
};

export default function FamilyMap({ families, onFamilyClick, className = '', userLocation, searchRadius = 10, showRadius = false, userProfileLocation }: FamilyMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);

  // Function to center map on user's profile location
  const locateUser = async () => {
    setIsLocating(true);
    
    try {
      if (!userProfileLocation) {
        alert('No location found in your profile. Please update your profile with your location.');
        setIsLocating(false);
        return;
      }

      // Use profile location instead of GPS
      const coords = getLocationCoords(userProfileLocation);
      const userCoords: [number, number] = coords; // coords is already [lng, lat]
      
      if (map.current) {
        // Fly to user's profile location
        map.current.flyTo({
          center: userCoords,
          zoom: 13,
          duration: 2000
        });
      }
    } catch (error) {
      console.error('Error getting profile location:', error);
      alert('Unable to find your location. Please check your profile location.');
    } finally {
      setIsLocating(false);
    }
  };

  useEffect(() => {
    if (!mapContainer.current) return;

    // Set mapbox access token
    mapboxgl.accessToken = MAPBOX_TOKEN;

    // Disable telemetry completely
    if (typeof window !== 'undefined') {
      // Disable Mapbox telemetry globally
      (window as any).MapboxGLAccessToken = MAPBOX_TOKEN;
      // Nuclear option: disable all telemetry
      if (mapboxgl && (mapboxgl as any).disable) {
        try {
          (mapboxgl as any).disable = true;
        } catch (e) {}
      }
    }

    // Disable telemetry before map creation
    mapboxgl.accessToken = MAPBOX_TOKEN;
    
    // Initialize map with telemetry disabled
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [144.3256, -38.3305], // Torquay center
      zoom: 10,
      collectResourceTiming: false, // Disable telemetry
      // Block telemetry requests to prevent ad blocker errors
      transformRequest: (url: string, resourceType: string | undefined) => {
        // Block all telemetry/analytics/tracking requests
        if (url.includes('events.mapbox.com') || 
            url.includes('api.mapbox.com/events') ||
            url.includes('/events/v2') ||
            url.includes('mapbox-turnstile') ||
            url.includes('telemetry') ||
            url.includes('analytics')) {
          return { url: '', headers: {} }; // Return empty request to block
        }
        return { url };
      },
      attributionControl: false
    });

    // Add navigation controls
    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

    map.current.on('load', () => {
      // Add radius circle source and layer
      if (map.current) {
        map.current.addSource('radius-circle', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: []
          }
        });

        map.current.addLayer({
          id: 'radius-circle-fill',
          type: 'fill',
          source: 'radius-circle',
          paint: {
            'fill-color': '#14b8a6', // Teal to match app theme
            'fill-opacity': 0.2 // Visible but not overwhelming
          }
        });

        map.current.addLayer({
          id: 'radius-circle-stroke',
          type: 'line',
          source: 'radius-circle',
          paint: {
            'line-color': '#0d9488', // Darker teal border
            'line-width': 3, // Prominent but not too thick
            'line-opacity': 0.9 // Almost fully opaque
          }
        });
      }
      setIsLoaded(true);
    });

    return () => {
      if (map.current) {
        map.current.remove();
      }
    };
  }, []);

  // Update markers when families change
  useEffect(() => {
    if (!map.current || !isLoaded) return;

    // Clear existing markers
    const existingMarkers = document.querySelectorAll('.family-marker');
    existingMarkers.forEach(marker => marker.remove());

    // Add family markers with privacy protection and radius filtering
    const filteredFamilies = families.filter(family => {
      // If radius filter is active, only show families within radius
      if (showRadius && userLocation && searchRadius) {
        const familyCoords = getLocationCoords(family.location_name);
        const distance = calculateDistance(
          userLocation.lat, userLocation.lng,
          familyCoords[1], familyCoords[0]
        );
        return distance <= searchRadius;
      }
      return true; // Show all families if no radius filter
    });

    filteredFamilies.forEach(family => {
      const baseCoords = getLocationCoords(family.location_name);
      // Use randomized coordinates within 3km for privacy protection
      const coords = getRandomizedCoords(baseCoords[0], baseCoords[1], family.id);
      
      // Create marker element with smaller size for better visibility
      const markerElement = document.createElement('div');
      const displayName = family.display_name || family.family_name?.split(' ')[0] || 'Family';
      
      // Different colors for admin users
      let markerColor = 'bg-teal-600 hover:bg-teal-700';
      if (family.admin_level === 'gold') markerColor = 'bg-yellow-500 hover:bg-yellow-600';
      else if (family.admin_level === 'silver') markerColor = 'bg-gray-400 hover:bg-gray-500';
      else if (family.admin_level === 'bronze') markerColor = 'bg-amber-600 hover:bg-amber-700';
      
      markerElement.className = `family-marker w-8 h-8 ${markerColor} rounded-full border-2 border-white shadow-lg cursor-pointer flex items-center justify-center text-white font-semibold text-xs transition-colors`;
      markerElement.innerHTML = displayName.charAt(0).toUpperCase();
      
      // Add click handler
      markerElement.addEventListener('click', () => {
        if (onFamilyClick) {
          onFamilyClick(family);
        }
      });

      // Create popup with username display and view profile button
      const popupElement = document.createElement('div');
      popupElement.className = 'p-3 text-center';
      popupElement.innerHTML = `
        <div class="font-semibold text-gray-900">${displayName}</div>
        <div class="text-xs text-gray-500">${family.location_name} area</div>
        ${family.admin_level ? `<div class="text-xs text-amber-600 mt-1">${family.admin_level} admin</div>` : ''}
        ${family.is_verified ? '<div class="text-green-600 text-xs">✓ Verified</div>' : ''}
      `;
      
      // Add View Profile button
      const viewButton = document.createElement('button');
      viewButton.className = 'mt-2 px-3 py-1 bg-teal-600 text-white text-xs font-medium rounded-lg hover:bg-teal-700 transition-colors';
      viewButton.textContent = 'View Profile';
      viewButton.onclick = (e) => {
        e.stopPropagation();
        if (onFamilyClick) {
          onFamilyClick(family);
        }
      };
      popupElement.appendChild(viewButton);

      const popup = new mapboxgl.Popup({
        offset: 15,
        closeButton: false,
        closeOnClick: false
      }).setDOMContent(popupElement);

      // Create marker
      const marker = new mapboxgl.Marker(markerElement)
        .setLngLat(coords)
        .setPopup(popup)
        .addTo(map.current!);

      // Show popup on hover
      markerElement.addEventListener('mouseenter', () => {
        popup.addTo(map.current!);
      });
      
      markerElement.addEventListener('mouseleave', () => {
        popup.remove();
      });
    });

    // Fit map to show filtered families if there are any
    if (filteredFamilies.length > 0) {
      const coords = filteredFamilies.map(family => {
        const baseCoords = getLocationCoords(family.location_name);
        return getRandomizedCoords(baseCoords[0], baseCoords[1], family.id);
      });
      const bounds = new mapboxgl.LngLatBounds();
      coords.forEach(coord => bounds.extend(coord));
      
      map.current.fitBounds(bounds, {
        padding: 50,
        maxZoom: 12
      });
    }
  }, [families, isLoaded, onFamilyClick]);

  // Update radius circle when location or radius changes
  useEffect(() => {
    if (!map.current || !isLoaded) return;

    const source = map.current.getSource('radius-circle') as mapboxgl.GeoJSONSource;
    if (!source) {
      console.log('Radius circle source not found');
      return;
    }

    if (showRadius && userLocation) {
      // Show the radius circle
      const circle = createCircle(userLocation, searchRadius);
      
      source.setData({
        type: 'FeatureCollection',
        features: [circle]
      });
      
      // Ensure layers are visible
      if (map.current.getLayer('radius-circle-fill')) {
        map.current.setLayoutProperty('radius-circle-fill', 'visibility', 'visible');
      }
      if (map.current.getLayer('radius-circle-stroke')) {
        map.current.setLayoutProperty('radius-circle-stroke', 'visibility', 'visible');
      }

      // Ensure the map shows the circle area
      const radiusInDegrees = searchRadius / 111; // Rough conversion km to degrees
      const bounds = new mapboxgl.LngLatBounds()
        .extend([userLocation.lng - radiusInDegrees, userLocation.lat - radiusInDegrees])
        .extend([userLocation.lng + radiusInDegrees, userLocation.lat + radiusInDegrees]);
      
      map.current.fitBounds(bounds, {
        padding: 50,
        maxZoom: 12
      });
      console.log('🔵 Map centered on radius area');

      // Add a test marker at user location for debugging
      if (userMarkerRef.current) {
        userMarkerRef.current.remove();
      }
      
      // Show user location marker at center of radius
      const markerEl = document.createElement('div');
      markerEl.className = 'w-4 h-4 bg-teal-600 rounded-full border-2 border-white shadow-lg';
      markerEl.title = 'Your location (center of search radius)';
      userMarkerRef.current = new mapboxgl.Marker(markerEl)
        .setLngLat([userLocation.lng, userLocation.lat])
        .addTo(map.current!);
      
    } else {
      console.log('🔴 HIDING RADIUS CIRCLE (showRadius:', showRadius, ', userLocation:', userLocation, ')');
      
      // Remove debug marker
      if (userMarkerRef.current) {
        userMarkerRef.current.remove();
        userMarkerRef.current = null;
      }
      
      // Hide the radius circle
      source.setData({
        type: 'FeatureCollection',
        features: []
      });
    }
  }, [userLocation, searchRadius, showRadius, isLoaded]);

  // Early return after all hooks to satisfy Rules of Hooks
  if (!MAPBOX_TOKEN) {
    return (
      <div className={`relative ${className}`}>
        <div className="w-full h-[600px] rounded-xl bg-gradient-to-br from-teal-50 to-emerald-50 border-2 border-dashed border-teal-200 flex items-center justify-center">
          <div className="text-center max-w-md px-6">
            <div className="w-16 h-16 bg-teal-100 rounded-full mx-auto mb-4 flex items-center justify-center">
              <span className="text-3xl">🗺️</span>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Map Token Missing</h3>
            <p className="text-gray-600 text-sm mb-4">
              The Mapbox token seems to be missing. This shouldn't happen with the demo token!
            </p>
            <p className="text-xs text-gray-500">
              Showing {families.length} families that would appear on the map
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <div 
        ref={mapContainer} 
        className="w-full h-[600px] rounded-xl overflow-hidden shadow-lg"
      />
      
      {/* Locate Me Button */}
      <button
        onClick={locateUser}
        disabled={isLocating}
        className="absolute top-4 left-4 bg-white rounded-lg shadow-lg p-3 hover:bg-gray-50 transition-colors disabled:opacity-50 z-10"
        title={`Go to my location (${userProfileLocation || 'Not set'})`}
      >
        {isLocating ? (
          <div className="w-5 h-5 border-2 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
        ) : (
          <div className="w-5 h-5 text-teal-600">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0 0 13 3.06V1h-2v2.06A8.994 8.994 0 0 0 3.06 11H1v2h2.06A8.994 8.994 0 0 0 11 20.94V23h2v-2.06A8.994 8.994 0 0 0 20.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/>
            </svg>
          </div>
        )}
      </button>

      {/* Debug section removed */}

      {!isLoaded && (
        <div className="absolute inset-0 bg-gray-100 rounded-xl flex items-center justify-center">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
            <p className="text-gray-600 text-sm">Loading map...</p>
          </div>
        </div>
      )}
    </div>
  );
}