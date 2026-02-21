'use client';

import { useState, useRef, useEffect } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

interface EnhancedLocationPickerProps {
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

export default function EnhancedLocationPicker({ 
  onLocationSelect, 
  initialLocation = '', 
  placeholder = "Search for a location...",
  className = ""
}: EnhancedLocationPickerProps) {
  const [query, setQuery] = useState(initialLocation);
  const [suggestions, setSuggestions] = useState<GeocodingResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showMap, setShowMap] = useState(false);
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

  // Debounced geocoding search
  const searchLocations = async (searchQuery: string) => {
    if (!searchQuery.trim() || !MAPBOX_TOKEN) {
      setSuggestions([]);
      return;
    }

    setIsLoading(true);

    try {
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
    
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    
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
    onLocationSelect(location);
  };

  const handleManualEntry = () => {
    if (query.trim()) {
      const location = {
        name: query.trim(),
        address: query.trim(),
        lat: -38.3305, // Default to Torquay
        lng: 144.3256,
      };
      setSelectedLocation(location);
      onLocationSelect(location);
    }
  };

  const openMapView = () => {
    setShowMap(true);
    setTimeout(() => initializeMap(), 100); // Delay to ensure container is rendered
  };

  const initializeMap = () => {
    if (!mapContainer.current || !MAPBOX_TOKEN) {
      console.error('Map container or token not available');
      return;
    }

    try {
      mapboxgl.accessToken = MAPBOX_TOKEN;

      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: selectedLocation ? [selectedLocation.lng, selectedLocation.lat] : [144.3256, -38.3305],
        zoom: selectedLocation ? 15 : 11,
      });

      map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

    // Add existing location marker if we have one
    if (selectedLocation) {
      marker.current = new mapboxgl.Marker({ color: '#0d9488' })
        .setLngLat([selectedLocation.lng, selectedLocation.lat])
        .addTo(map.current);
    }

    // Handle map clicks
    map.current.on('click', async (e) => {
      const { lng, lat } = e.lngLat;
      
      try {
        const response = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${MAPBOX_TOKEN}`
        );
        const data = await response.json();
        
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
      } catch (error) {
        console.error('Reverse geocoding error:', error);
      }
    });
    
    } catch (error) {
      console.error('Map initialization failed:', error);
    }
  };

  const confirmMapLocation = () => {
    if (selectedLocation) {
      onLocationSelect(selectedLocation);
    }
    setShowMap(false);
    if (map.current) {
      map.current.remove();
      map.current = null;
    }
  };

  return (
    <>
      <div className={className}>
        <div className="space-y-3">
          {/* Main Search Input */}
          <div className="relative">
            <input
              type="text"
              value={query}
              onChange={(e) => handleInputChange(e.target.value)}
              onFocus={() => query && suggestions.length > 0 && setShowSuggestions(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && query.trim()) {
                  e.preventDefault();
                  handleManualEntry();
                }
              }}
              placeholder={placeholder}
              className="w-full p-3 border border-gray-200 rounded-xl bg-white text-gray-900 placeholder-gray-400"
            />
            
            {/* Loading indicator */}
            {isLoading && (
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                <div className="w-4 h-4 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            {query && (
              <button
                onClick={handleManualEntry}
                className="flex-1 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium transition-colors"
                type="button"
              >
                ✓ Use "{query.length > 20 ? query.substring(0, 20) + '...' : query}"
              </button>
            )}
            <button
              onClick={openMapView}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium transition-colors flex items-center gap-1"
              type="button"
            >
              🗺️ Map
            </button>
          </div>

          {/* Suggestions Dropdown */}
          {showSuggestions && suggestions.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
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

          {/* Selected Location Preview */}
          {selectedLocation && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
              <div className="font-medium text-emerald-900">{selectedLocation.name}</div>
              <div className="text-sm text-emerald-700">{selectedLocation.address}</div>
            </div>
          )}

          {/* Help Text */}
          <div className="text-xs text-gray-500">
            Search for places, click suggestions, use exact text, or open map view
          </div>
        </div>
      </div>

      {/* Map Modal */}
      {showMap && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Choose Location on Map</h3>
                <button
                  onClick={() => {
                    setShowMap(false);
                    if (map.current) {
                      map.current.remove();
                      map.current = null;
                    }
                  }}
                  className="text-gray-400 hover:text-gray-600"
                  type="button"
                >
                  ×
                </button>
              </div>
              <p className="text-sm text-gray-600 mt-1">
                🗺️ Click anywhere on the map to set the exact location
              </p>
            </div>
            
            <div className="h-96">
              <div ref={mapContainer} className="w-full h-full" />
            </div>
            
            <div className="p-4 border-t border-gray-200">
              {selectedLocation && (
                <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                  <div className="font-medium text-gray-900">{selectedLocation.name}</div>
                  <div className="text-sm text-gray-600">{selectedLocation.address}</div>
                </div>
              )}
              
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowMap(false);
                    if (map.current) {
                      map.current.remove();
                      map.current = null;
                    }
                  }}
                  className="flex-1 py-2 px-4 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors"
                  type="button"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmMapLocation}
                  disabled={!selectedLocation}
                  className="flex-1 py-2 px-4 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:bg-gray-300 transition-colors"
                  type="button"
                >
                  Use This Location
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}