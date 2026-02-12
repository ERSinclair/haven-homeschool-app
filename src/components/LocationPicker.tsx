'use client';

import { useState, useRef, useEffect } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

interface LocationPickerProps {
  onLocationSelect: (location: {
    name: string;
    address: string;
    lat: number;
    lng: number;
  }) => void;
  initialLocation?: string;
  placeholder?: string;
  className?: string;
}

interface GeocodingResult {
  place_name: string;
  center: [number, number];
  text: string;
  place_type: string[];
}

export default function LocationPicker({ 
  onLocationSelect, 
  initialLocation = '', 
  placeholder = "Search for a location...",
  className = ""
}: LocationPickerProps) {
  const [query, setQuery] = useState(initialLocation);
  const [suggestions, setSuggestions] = useState<GeocodingResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [mapLoading, setMapLoading] = useState(true);
  const [mapError, setMapError] = useState<string | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<{
    name: string;
    address: string;
    lat: number;
    lng: number;
  } | null>(null);
  
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const marker = useRef<mapboxgl.Marker | null>(null);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  // Initialize map
  useEffect(() => {
    if (!showMap || !mapContainer.current) return;

    console.log('Map initialization starting...');
    console.log('Token available:', !!MAPBOX_TOKEN);
    console.log('Token preview:', MAPBOX_TOKEN ? MAPBOX_TOKEN.substring(0, 20) + '...' : 'NONE');

    if (!MAPBOX_TOKEN) {
      setMapError('Mapbox token not found');
      setMapLoading(false);
      return;
    }

    setMapLoading(true);
    setMapError(null);

    // Set a more aggressive timeout first
    const timeout = setTimeout(() => {
      console.log('Map loading timeout reached');
      setMapError('Map took too long to load');
      setMapLoading(false);
    }, 5000); // Reduced to 5 seconds

    mapboxgl.accessToken = MAPBOX_TOKEN;

    try {
      console.log('Creating map instance...');
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [144.3256, -38.3305], // Torquay center
        zoom: 13,
        attributionControl: false,
      });

      map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

      map.current.on('load', () => {
        console.log('Map loaded successfully');
        clearTimeout(timeout);
        setMapLoading(false);
      });

      map.current.on('error', (e) => {
        console.error('Map error:', e);
        clearTimeout(timeout);
        setMapError('Failed to load map: ' + (e.error?.message || 'Unknown error'));
        setMapLoading(false);
      });

      map.current.on('styledata', () => {
        console.log('Map style loaded');
      });

      map.current.on('sourcedata', () => {
        console.log('Map source data loaded');
      });

    } catch (error) {
      console.error('Map initialization error:', error);
      clearTimeout(timeout);
      setMapError('Map initialization failed: ' + (error as Error).message);
      setMapLoading(false);
    }

    return () => {
      clearTimeout(timeout);
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };

    // Add click handler for setting location
    map.current!.on('click', (e) => {
      const { lng, lat } = e.lngLat;
      
      // Reverse geocode to get address
      fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${MAPBOX_TOKEN}`)
        .then(res => res.json())
        .then(data => {
          if (data.features && data.features.length > 0) {
            const feature = data.features[0];
            const location = {
              name: feature.text || 'Custom Location',
              address: feature.place_name,
              lat,
              lng
            };
            
            setSelectedLocation(location);
            setQuery(feature.place_name);
            
            // Update marker
            if (marker.current) {
              marker.current.remove();
            }
            marker.current = new mapboxgl.Marker({ color: '#0d9488' })
              .setLngLat([lng, lat])
              .addTo(map.current!);
          }
        })
        .catch(err => console.error('Reverse geocoding error:', err));
    });

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [showMap]);

  // Reset states when map modal is closed
  useEffect(() => {
    if (!showMap) {
      setMapLoading(true);
      setMapError(null);
      setSelectedLocation(null);
    }
  }, [showMap]);

  // Debounced geocoding search
  const searchLocations = async (searchQuery: string) => {
    if (!searchQuery.trim() || !MAPBOX_TOKEN) {
      setSuggestions([]);
      return;
    }

    setIsLoading(true);

    try {
      // Bias search around Torquay/Surf Coast area
      const proximity = '144.3256,-38.3305';
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(searchQuery)}.json?` +
        `access_token=${MAPBOX_TOKEN}&` +
        `proximity=${proximity}&` +
        `country=AU&` +
        `types=address,poi,place&` +
        `limit=5`
      );
      
      const data = await response.json();
      
      if (data.features) {
        setSuggestions(data.features);
        setShowSuggestions(true);
      }
    } catch (error) {
      console.error('Geocoding error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (value: string) => {
    setQuery(value);
    
    // Clear existing timer
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    
    // Set new timer
    debounceTimer.current = setTimeout(() => {
      searchLocations(value);
    }, 300);
  };

  const handleSuggestionClick = (suggestion: GeocodingResult) => {
    const location = {
      name: suggestion.text,
      address: suggestion.place_name,
      lat: suggestion.center[1],
      lng: suggestion.center[0]
    };
    
    setSelectedLocation(location);
    setQuery(suggestion.place_name);
    setShowSuggestions(false);
    setSuggestions([]);

    // Update map if visible
    if (map.current) {
      map.current.flyTo({
        center: suggestion.center,
        zoom: 15
      });

      // Update marker
      if (marker.current) {
        marker.current.remove();
      }
      marker.current = new mapboxgl.Marker({ color: '#0d9488' })
        .setLngLat(suggestion.center)
        .addTo(map.current);
    }
  };

  const handleConfirmLocation = () => {
    if (selectedLocation) {
      onLocationSelect(selectedLocation);
      setShowMap(false);
    }
  };

  return (
    <div className={className}>
      <div className="relative">
        {/* Main Input */}
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            onFocus={() => query && suggestions.length > 0 && setShowSuggestions(true)}
            placeholder={placeholder}
            className="w-full p-3 border border-gray-200 rounded-xl bg-white text-gray-900 placeholder-gray-400 pr-12"
          />
          <button
            onClick={() => setShowMap(!showMap)}
            className="absolute right-2 top-1/2 transform -translate-y-1/2 p-2 text-teal-600 hover:text-teal-700"
            type="button"
          >
            🗺️
          </button>
        </div>

        {/* Loading Indicator */}
        {isLoading && (
          <div className="absolute right-12 top-1/2 transform -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}

        {/* Suggestions Dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
            {suggestions.map((suggestion, index) => (
              <button
                key={index}
                onClick={() => handleSuggestionClick(suggestion)}
                className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0 first:rounded-t-xl last:rounded-b-xl"
                type="button"
              >
                <div className="font-medium text-gray-900">{suggestion.text}</div>
                <div className="text-sm text-gray-600">{suggestion.place_name}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Map Modal */}
      {showMap && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden">
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Choose Location</h3>
                <button
                  onClick={() => setShowMap(false)}
                  className="text-gray-400 hover:text-gray-600"
                  type="button"
                >
                  ×
                </button>
              </div>
              <p className="text-sm text-gray-600 mt-1">
                Click on the map to set the exact location
              </p>
            </div>
            
            <div className="h-96 relative">
              <div ref={mapContainer} className="w-full h-full rounded-lg overflow-hidden" style={{ minHeight: '384px' }} />
              
              {/* Loading State */}
              {mapLoading && (
                <div className="absolute inset-0 bg-gray-100 flex items-center justify-center rounded-lg">
                  <div className="text-center">
                    <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                    <p className="text-gray-600 text-sm">Loading map...</p>
                  </div>
                </div>
              )}

              {/* Error State */}
              {mapError && (
                <div className="absolute inset-0 bg-gray-100 flex items-center justify-center rounded-lg">
                  <div className="text-center">
                    <div className="w-12 h-12 bg-red-100 rounded-full mx-auto mb-2 flex items-center justify-center">
                      <span className="text-red-600">⚠️</span>
                    </div>
                    <p className="text-gray-900 font-medium mb-1">Map Error</p>
                    <p className="text-gray-600 text-sm">{mapError}</p>
                    <button
                      onClick={() => {
                        setMapError(null);
                        setMapLoading(true);
                        // Retry map initialization
                        if (map.current) {
                          map.current.remove();
                          map.current = null;
                        }
                      }}
                      className="mt-3 px-3 py-1 bg-teal-600 text-white text-sm rounded hover:bg-teal-700"
                      type="button"
                    >
                      Retry
                    </button>
                  </div>
                </div>
              )}
            </div>
            
            <div className="p-4 border-t border-gray-200">
              {selectedLocation && (
                <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                  <div className="font-medium text-gray-900">{selectedLocation.name}</div>
                  <div className="text-sm text-gray-600">{selectedLocation.address}</div>
                </div>
              )}
              
              {/* Fallback manual entry when map fails */}
              {mapError && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Or enter address manually:
                  </label>
                  <input
                    type="text"
                    placeholder="Enter address..."
                    className="w-full p-2 border border-gray-200 rounded-lg"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const address = (e.target as HTMLInputElement).value;
                        if (address.trim()) {
                          setSelectedLocation({
                            name: address.trim(),
                            address: address.trim(),
                            lat: -38.3305, // Default to Torquay
                            lng: 144.3256,
                          });
                        }
                      }
                    }}
                  />
                  <p className="text-xs text-gray-500 mt-1">Press Enter to use this address</p>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setShowMap(false)}
                  className="flex-1 py-2 px-4 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200"
                  type="button"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmLocation}
                  disabled={!selectedLocation}
                  className="flex-1 py-2 px-4 bg-teal-600 text-white rounded-xl hover:bg-teal-700 disabled:bg-gray-300"
                  type="button"
                >
                  Use This Location
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}