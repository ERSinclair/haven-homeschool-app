'use client';

import { useState, useRef, useEffect } from 'react';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

interface SimpleLocationPickerProps {
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

export default function SimpleLocationPicker({ 
  onLocationSelect, 
  initialLocation = '', 
  placeholder = "Search for a location...",
  className = ""
}: SimpleLocationPickerProps) {
  const [query, setQuery] = useState(initialLocation);
  const [suggestions, setSuggestions] = useState<GeocodingResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  // Debounced geocoding search - focused on Surf Coast/Geelong region first
  const searchLocations = async (searchQuery: string) => {
    if (!searchQuery.trim() || !MAPBOX_TOKEN) {
      setSuggestions([]);
      return;
    }

    setIsLoading(true);

    try {
      // Bias search toward Surf Coast/Geelong area for local launch
      const proximity = '144.3256,-38.3305'; // Torquay coordinates 
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(searchQuery)}.json?` +
        `access_token=${MAPBOX_TOKEN}&` +
        `proximity=${proximity}&` +
        `country=AU&` +
        `types=place,locality,district,address,poi&` +
        `limit=8`;
      
      console.log('Geocoding request:', url);
      const response = await fetch(url);
      
      const data = await response.json();
      console.log('Geocoding response:', data);
      
      if (data.features && data.features.length > 0) {
        // Show all results (proximity already prioritizes local ones)
        setSuggestions(data.features.slice(0, 8));
        setShowSuggestions(true);
      } else {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    } catch (error) {
      console.error('Geocoding error:', error);
      setSuggestions([]);
      setShowSuggestions(false);
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
    
    // Set new timer - only search, don't auto-select manual entry
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
    
    console.log('Location selected:', location);
    
    setQuery(suggestion.place_name);
    setShowSuggestions(false);
    setSuggestions([]);
    onLocationSelect(location);
  };

  // Location must be selected from geocoded suggestions only (no manual entry)

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
            autoComplete="off"
          />
          {isLoading && (
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
              <div className="w-4 h-4 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
          )}
        </div>

        {/* Loading indicator moved to input */}

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

        {/* Help Text */}
        <div className="mt-2 text-xs text-gray-500">
          Start typing your suburb and select from the suggestions (Surf Coast & Geelong area prioritized)
        </div>
      </div>
    </div>
  );
}