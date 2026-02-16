'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { getStoredSession } from '@/lib/session';
import { getAvatarColor, statusColors, statusLabels, statusIcons } from '@/lib/colors';
import { checkProfileCompletion, getResumeSignupUrl } from '@/lib/profileCompletion';
import FamilyMap from '@/components/FamilyMap';
import AvatarUpload from '@/components/AvatarUpload';
import HavenHeader from '@/components/HavenHeader';
import ProtectedRoute from '@/components/ProtectedRoute';
import AdminBadge from '@/components/AdminBadge';

type Family = {
  id: string;
  family_name: string;
  display_name?: string;
  username?: string;
  location_name: string;
  kids_ages: number[];
  status: string;
  bio?: string;
  avatar_url?: string;
  interests?: string[];
  is_verified: boolean;
  created_at: string;
  admin_level?: 'gold' | 'silver' | 'bronze' | null;
  is_online?: boolean;
  last_active?: string;
  user_type?: 'family' | 'teacher' | 'event' | 'facility' | 'other';
};

type Profile = {
  id: string;
  name: string;
  location_name: string;
  kids_ages: number[];
  status: string;
  bio?: string;
};

type ViewMode = 'list' | 'map';
type Section = 'families';

// Calculate and format last active time
const formatLastActive = (lastActiveStr?: string): string => {
  if (!lastActiveStr) return 'offline';
  
  const lastActive = new Date(lastActiveStr);
  const now = new Date();
  const diffMs = now.getTime() - lastActive.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffWeeks = Math.floor(diffDays / 7);
  
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffWeeks === 1) return '1 week ago';
  if (diffWeeks === 2) return '2 weeks ago';
  if (diffWeeks === 3) return '3 weeks ago';
  if (diffDays < 30) return `${diffWeeks} weeks ago`;
  
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths === 1) return '1 month ago';
  return `${diffMonths} months ago`;
};

// Calculate distance between two coordinates in km
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radius of the Earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Get coordinates for common locations
function getLocationCoords(locationName: string): { lat: number; lng: number } {
  const locations: { [key: string]: { lat: number; lng: number } } = {
    'Torquay': { lat: -38.3305, lng: 144.3256 },
    'Geelong': { lat: -38.1479, lng: 144.3599 },
    'Anglesea': { lat: -38.4077, lng: 144.1928 },
    'Lorne': { lat: -38.5394, lng: 143.9781 },
    'Melbourne': { lat: -37.8136, lng: 144.9631 },
    'Ocean Grove': { lat: -38.2661, lng: 144.5236 },
    'Barwon Heads': { lat: -38.2873, lng: 144.4984 },
    'Point Lonsdale': { lat: -38.2891, lng: 144.6186 }
  };
  
  // Try exact match first
  const exactMatch = locations[locationName];
  if (exactMatch) return exactMatch;
  
  // Try partial match
  const partialMatch = Object.keys(locations).find(key => 
    key.toLowerCase().includes(locationName.toLowerCase()) ||
    locationName.toLowerCase().includes(key.toLowerCase())
  );
  if (partialMatch) return locations[partialMatch];
  
  // Default to Torquay
  return locations['Torquay'];
}

export default function EnhancedDiscoverPage() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [families, setFamilies] = useState<Family[]>([]);
  const [filteredFamilies, setFilteredFamilies] = useState<Family[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedFamily, setSelectedFamily] = useState<Family | null>(null);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  
  // Selection and hiding system
  const [selectedFamilies, setSelectedFamilies] = useState<string[]>([]);
  const [hiddenFamilies, setHiddenFamilies] = useState<string[]>([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [longPressTimer, setLongPressTimer] = useState<NodeJS.Timeout | null>(null);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [successMessageText, setSuccessMessageText] = useState('Success!');
  const [showHiddenModal, setShowHiddenModal] = useState(false);
  
  // Circles functionality
  const [showCircleModal, setShowCircleModal] = useState(false);
  const [userCircles, setUserCircles] = useState<any[]>([]);
  const [invitingToCircle, setInvitingToCircle] = useState(false);
  
  // View and filtering
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [activeSection, setActiveSection] = useState<Section>('families');
  const [showFilters, setShowFilters] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [maxDistance, setMaxDistance] = useState(15);
  const [ageRange, setAgeRange] = useState({ min: 1, max: 10 });
  const [filterTypes, setFilterTypes] = useState<string[]>(['all']);
  const [locationFilter, setLocationFilter] = useState('');
  
  // Radius search - with localStorage persistence for testing
  const [radiusSearch, setRadiusSearch] = useState(() => {
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      return localStorage.getItem('haven-radius-search') === 'true';
    }
    return false;
  });
  const [searchRadius, setSearchRadius] = useState(() => {
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      return parseInt(localStorage.getItem('haven-search-radius') || '10');
    }
    return 10;
  });
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(() => {
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      const stored = localStorage.getItem('haven-user-location');
      return stored ? JSON.parse(stored) : null;
    }
    return null;
  });
  const [locationError, setLocationError] = useState<string | null>(null);
  
  const router = useRouter();

  // Handle filter type selection (multiple selection)
  const toggleFilterType = (type: string) => {
    if (type === 'all') {
      setFilterTypes(['all']);
    } else {
      setFilterTypes(prev => {
        let newTypes = prev.filter(t => t !== 'all'); // Remove 'all' when selecting specific types
        if (newTypes.includes(type)) {
          // Remove the type
          const filtered = newTypes.filter(t => t !== type);
          return filtered.length === 0 ? ['all'] : filtered;
        } else {
          // Add the type
          return [...newTypes, type];
        }
      });
    }
  };

  // Simplified location and radius management - no more complex localStorage persistence

  // Use profile location with random offset within 3km
  const getUserLocation = async () => {
    setLocationError(null);
    
    if (!profile?.location_name) {
      setLocationError('No location set in profile');
      return;
    }

    // Simple coordinate mapping for common locations
    const locationCoords: { [key: string]: [number, number] } = {
      'Torquay': [-38.3305, 144.3256],
      'Geelong': [-38.1499, 144.3580],
      'Ocean Grove': [-38.2575, 144.5208],
      'Surf Coast': [-38.3000, 144.2500],
      'Anglesea': [-38.4089, 144.1856],
      'Lorne': [-38.5433, 143.9781],
    };
    
    const location = profile.location_name;
    const coords = locationCoords[location] || locationCoords['Torquay']; // Default to Torquay
    
    // Add random offset within 3km for privacy
    const randomOffset = () => {
      const angle = Math.random() * 2 * Math.PI;
      const radius = Math.random() * 3000; // 3km in meters
      const latOffset = (radius * Math.cos(angle)) / 111320; // meters to degrees lat
      const lngOffset = (radius * Math.sin(angle)) / (111320 * Math.cos(coords[0] * Math.PI / 180)); // meters to degrees lng
      return { latOffset, lngOffset };
    };
    
    const offset = randomOffset();
    setUserLocation({ 
      lat: coords[0] + offset.latOffset, 
      lng: coords[1] + offset.lngOffset 
    });
  };

  // Load families and data
  useEffect(() => {
    const loadData = async () => {
      // Only run on client side
      if (typeof window === 'undefined') return;
      
      // Load user session and data
      try {
        // Get session from localStorage (bypass SDK)
        const session = getStoredSession();
        // Check if user is authenticated
        
        if (!session?.user) {
          // No user session, redirect to login
          router.push('/login');
          return;
        }
        
        setUser(session.user);
        // User found, fetch profile data
        
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        
        // Get user's profile via direct fetch
        const profileRes = await fetch(
          `${supabaseUrl}/rest/v1/profiles?id=eq.${session.user.id}&select=*`,
          {
            headers: {
              'apikey': supabaseKey!,
              'Authorization': `Bearer ${session.access_token}`,
            },
          }
        );
        
        if (!profileRes.ok) {
          console.error('Enhanced Discover: Profile fetch failed:', profileRes.status);
          setIsLoading(false);
          return;
        }
        
        const profileArr = await profileRes.json();
        const profileData = profileArr[0] || null;
        
        console.log('Enhanced Discover: Profile result:', profileData);
        
        if (profileData) {
          // Check if this is a newly completed signup (bypass profile check)
          const signupComplete = typeof window !== 'undefined' ? localStorage.getItem('haven-signup-complete') : null;
          const signupTime = signupComplete ? parseInt(signupComplete) : 0;
          const fiveMinutesAgo = Date.now() - (5 * 60 * 1000); // 5 minutes
          
          if (signupComplete && signupTime > fiveMinutesAgo) {
            // Clear the flag after using it
            localStorage.removeItem('haven-signup-complete');
            console.log('Enhanced Discover: Bypassing profile check for newly created profile');
          } else {
            // Check if profile is complete
            const completionStep = checkProfileCompletion(profileData);
            
            if (completionStep !== 'complete') {
              console.log('Enhanced Discover: Profile incomplete, redirecting to signup');
              router.push(getResumeSignupUrl(completionStep, profileData.user_type));
              return;
            }
          }
          
          setProfile(profileData);
          // Set age range based on kids
          if (profileData.kids_ages?.length > 0) {
            const minAge = Math.max(0, Math.min(...profileData.kids_ages) - 2);
            const maxAge = Math.min(18, Math.max(...profileData.kids_ages) + 2);
            setAgeRange({ min: minAge, max: maxAge });
          }
          
          // Auto-load user location from profile for radius search
          if (profileData.location_name && !userLocation) {
            const locationCoords: { [key: string]: [number, number] } = {
              'Torquay': [-38.3305, 144.3256],
              'Geelong': [-38.1499, 144.3580],
              'Ocean Grove': [-38.2575, 144.5208],
              'Surf Coast': [-38.3000, 144.2500],
              'Anglesea': [-38.4089, 144.1856],
              'Lorne': [-38.5433, 143.9781],
            };
            
            const coords = locationCoords[profileData.location_name] || locationCoords['Torquay'];
            const randomOffset = () => {
              const angle = Math.random() * 2 * Math.PI;
              const radius = Math.random() * 3000; // 3km in meters
              const latOffset = (radius * Math.cos(angle)) / 111320;
              const lngOffset = (radius * Math.sin(angle)) / (111320 * Math.cos(coords[0] * Math.PI / 180));
              return { latOffset, lngOffset };
            };
            
            const offset = randomOffset();
            setUserLocation({ 
              lat: coords[0] + offset.latOffset, 
              lng: coords[1] + offset.lngOffset 
            });
          }
        } else {
          // No profile found, redirect to complete signup
          console.log('Enhanced Discover: No profile found, redirecting to resume signup');
          router.push('/signup/resume?step=2');
          return;
        }

        // Skip welcome flow - go directly to discover page
        
        console.log('Enhanced Discover: Fetching families...');
        
        // Get other families via direct fetch
        const familiesRes = await fetch(
          `${supabaseUrl}/rest/v1/profiles?id=neq.${session.user.id}&select=*&order=created_at.desc`,
          {
            headers: {
              'apikey': supabaseKey!,
              'Authorization': `Bearer ${session.access_token}`,
            },
          }
        );
        
        if (!familiesRes.ok) {
          console.error('Enhanced Discover: Families fetch failed:', familiesRes.status);
          const errorData = await familiesRes.json();
          console.error('Enhanced Discover: Families error:', errorData);
          setIsLoading(false);
          return;
        }
        
        const familiesData = await familiesRes.json();
        console.log('Enhanced Discover: Families result:', familiesData);
        
        // Add mock online status and user types for demo
        const familiesWithStatus = familiesData.map((family: Family) => ({
          ...family,
          is_online: Math.random() > 0.7, // 30% chance of being online
          last_active: Math.random() > 0.3 ? new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString() : undefined, // Random last active within 30 days
          user_type: Math.random() > 0.8 ? 
            (Math.random() > 0.6 ? 'teacher' : Math.random() > 0.5 ? 'facility' : 'event') : 'family' // Most are families, some teachers/facilities/events
        }));
        
        setFamilies(familiesWithStatus);
        
        console.log('Enhanced Discover: Done loading');
        
        // Load user's circles for invitations
        await loadUserCircles();
        
        // Load existing connection requests
        await loadConnectionRequests();
      } catch (err) {
        console.error('Enhanced Discover: Error:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();

    // Cleanup long press timer on unmount
    return () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
      }
    };
  }, [router, longPressTimer]);

  // Filter families based on current filters
  useEffect(() => {
    let filtered = families.filter(family => !hiddenFamilies.includes(family.id));

    // Search term
    if (searchTerm) {
      filtered = filtered.filter(family =>
        (family.family_name || family.display_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        family.location_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        family.bio?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Radius search (always enabled when user location is available)
    if (userLocation) {
      filtered = filtered.filter(family => {
        const familyCoords = getLocationCoords(family.location_name);
        const distance = calculateDistance(
          userLocation.lat, 
          userLocation.lng,
          familyCoords.lat, 
          familyCoords.lng
        );
        return distance <= searchRadius;
      });
    } else if (locationFilter) {
      // Location filter (only if not using radius search)
      filtered = filtered.filter(family =>
        family.location_name.toLowerCase().includes(locationFilter.toLowerCase())
      );
    }

    // Age range filter
    if (profile?.kids_ages && Array.isArray(profile.kids_ages) && profile.kids_ages.length > 0) {
      filtered = filtered.filter(family =>
        family.kids_ages?.some(age => age >= ageRange.min && age <= ageRange.max)
      );
    }

    // User type filter
    if (!filterTypes.includes('all')) {
      filtered = filtered.filter(family => {
        const userType = family.user_type || 'family';
        return filterTypes.includes(userType);
      });
    }

    // Sort families alphabetically by last name
    const getLastName = (family: Family) => {
      const fullName = family.family_name || family.display_name || '';
      const nameParts = fullName.trim().split(' ');
      return nameParts.length > 1 ? nameParts[nameParts.length - 1] : fullName;
    };

    const sortedFamilies = [...filtered].sort((a, b) => {
      const lastNameA = getLastName(a).toLowerCase();
      const lastNameB = getLastName(b).toLowerCase();
      return lastNameA.localeCompare(lastNameB);
    });

    setFilteredFamilies(sortedFamilies);
  }, [families, searchTerm, locationFilter, ageRange, filterTypes, hiddenFamilies, profile, userLocation, searchRadius]);

  // Family selection handlers
  const toggleFamilySelection = (familyId: string) => {
    setSelectedFamilies(prev =>
      prev.includes(familyId)
        ? prev.filter(id => id !== familyId)
        : [...prev, familyId]
    );
  };

  // Long hold handlers for selection
  const handleLongPressStart = (familyId: string, event: React.MouseEvent | React.TouchEvent) => {
    // Note: No preventDefault needed for long press functionality
    
    const timer = setTimeout(() => {
      // Haptic feedback on mobile
      if ('vibrate' in navigator) {
        navigator.vibrate(50);
      }
      
      // Enter selection mode if not already active
      if (!selectionMode) {
        setSelectionMode(true);
      }
      
      // Select the family
      toggleFamilySelection(familyId);
    }, 1000); // 1000ms for long press
    
    setLongPressTimer(timer);
  };

  const handleLongPressEnd = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
  };

  const handleFamilyClick = (familyId: string) => {
    if (selectionMode) {
      // In selection mode, clicking toggles selection
      toggleFamilySelection(familyId);
    } else {
      // Normal mode - could open family details (future feature)
      console.log('Open family details:', familyId);
    }
  };

  const hideSelectedFamilies = () => {
    setHiddenFamilies(prev => [...prev, ...selectedFamilies]);
    setSelectedFamilies([]);
    setSelectionMode(false);
    
    // Save to localStorage
    const newHidden = [...hiddenFamilies, ...selectedFamilies];
    localStorage.setItem('haven-hidden-families', JSON.stringify(newHidden));
  };

  const clearHiddenFamilies = () => {
    setHiddenFamilies([]);
    localStorage.removeItem('haven-hidden-families');
  };

  const unhideFamily = (familyId: string) => {
    const newHidden = hiddenFamilies.filter(id => id !== familyId);
    setHiddenFamilies(newHidden);
    if (newHidden.length > 0) {
      localStorage.setItem('haven-hidden-families', JSON.stringify(newHidden));
    } else {
      localStorage.removeItem('haven-hidden-families');
    }
  };

  const getHiddenFamiliesDetails = () => {
    return families.filter(family => hiddenFamilies.includes(family.id));
  };

  const [connectionRequests, setConnectionRequests] = useState<Map<string, {status: string, isRequester: boolean}>>(new Map());
  const [selectedFamilyDetails, setSelectedFamilyDetails] = useState<Family | null>(null);

  // Helper function to get connection button state
  const getConnectionButtonState = (familyId: string) => {
    const connection = connectionRequests.get(familyId);
    
    if (!connection) {
      return { text: 'Connect', disabled: false, style: 'bg-teal-600 text-white hover:bg-teal-700' };
    }
    
    switch (connection.status) {
      case 'accepted':
        return { text: 'Connected', disabled: true, style: 'bg-green-100 text-green-700 border border-green-200' };
      case 'pending':
        if (connection.isRequester) {
          return { text: 'Requested', disabled: false, style: 'bg-gray-100 text-gray-600 border border-gray-300' };
        } else {
          return { text: 'Accept Request', disabled: false, style: 'bg-blue-600 text-white hover:bg-blue-700' };
        }
      default:
        return { text: 'Connect', disabled: false, style: 'bg-teal-600 text-white hover:bg-teal-700' };
    }
  };

  const sendConnectionRequest = async (familyId: string) => {
    try {
      const session = getStoredSession();
      if (!session?.user) {
        alert('Please log in to send connection requests');
        return;
      }

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      const existingConnection = connectionRequests.get(familyId);

      // If already connected, do nothing
      if (existingConnection?.status === 'accepted') {
        alert('You are already connected with this family.');
        return;
      }

      // If pending request exists and user is the requester, allow unsending
      if (existingConnection?.status === 'pending' && existingConnection.isRequester) {
        // Remove/unsend the connection request
        const response = await fetch(
          `${supabaseUrl}/rest/v1/connections?requester_id=eq.${session.user.id}&receiver_id=eq.${familyId}`,
          {
            method: 'DELETE',
            headers: {
              'apikey': supabaseKey!,
              'Authorization': `Bearer ${session.access_token}`,
            },
          }
        );

        if (!response.ok) {
          throw new Error('Failed to remove connection request');
        }

        // Update UI state - remove from map
        setConnectionRequests(prev => {
          const newMap = new Map(prev);
          newMap.delete(familyId);
          return newMap;
        });
        
        console.log('Connection request removed for family:', familyId);
        return;
      }

      // If there's a pending request where current user is receiver, don't allow sending back
      if (existingConnection?.status === 'pending' && !existingConnection.isRequester) {
        alert('This family has already sent you a connection request. Please check your connections page to accept it.');
        return;
      }

      // Create new connection request (only if no connection exists)
      if (!existingConnection) {
        const response = await fetch(
          `${supabaseUrl}/rest/v1/connections`,
          {
            method: 'POST',
            headers: {
              'apikey': supabaseKey!,
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=minimal',
            },
            body: JSON.stringify({
              requester_id: session.user.id,
              receiver_id: familyId,
              status: 'pending'
            }),
          }
        );

        if (!response.ok) {
          const error = await response.text();
          throw new Error(error);
        }

        // Update UI state - add to map
        setConnectionRequests(prev => {
          const newMap = new Map(prev);
          newMap.set(familyId, { status: 'pending', isRequester: true });
          return newMap;
        });
        
        console.log('Connection request sent to family:', familyId);
      }
      
    } catch (error) {
      console.error('Error with connection request:', error);
      if (error instanceof Error && error.message.includes('duplicate key value')) {
        alert('Connection request already sent to this family.');
      } else {
        alert('Failed to process connection request. Please try again.');
      }
    }
  };

  // Load existing connections and requests
  const loadConnectionRequests = async () => {
    try {
      const session = getStoredSession();
      if (!session?.user) return;

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      // Get ALL connections involving current user (sent, received, accepted, pending)
      const response = await fetch(
        `${supabaseUrl}/rest/v1/connections?or=(requester_id.eq.${session.user.id},receiver_id.eq.${session.user.id})&select=requester_id,receiver_id,status`,
        {
          headers: {
            'apikey': supabaseKey!,
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (response.ok) {
        const connections = await response.json();
        const connectionMap = new Map<string, {status: string, isRequester: boolean}>();
        
        connections.forEach((conn: any) => {
          // Map the other person's ID to connection status and role
          if (conn.requester_id === session.user.id) {
            connectionMap.set(conn.receiver_id, {
              status: conn.status,
              isRequester: true
            });
          } else {
            connectionMap.set(conn.requester_id, {
              status: conn.status,
              isRequester: false
            });
          }
        });
        
        setConnectionRequests(connectionMap);
      }
    } catch (error) {
      console.error('Error loading connection requests:', error);
    }
  };

  // Load hidden families from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('haven-hidden-families');
    if (saved) {
      try {
        setHiddenFamilies(JSON.parse(saved));
      } catch {
        localStorage.removeItem('haven-hidden-families');
      }
    }
  }, []);

  // Load user's circles for invitations
  const loadUserCircles = async () => {
    try {
      const session = getStoredSession();
      if (!session?.user) return;

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      const response = await fetch(
        `${supabaseUrl}/rest/v1/circles?select=*,circle_members!inner(role)&circle_members.member_id=eq.${session.user.id}&circle_members.role=eq.admin&is_active=eq.true&order=name.asc`,
        {
          headers: {
            'apikey': supabaseKey!,
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (response.ok) {
        const circles = await response.json();
        setUserCircles(circles);
      }
    } catch (error) {
      console.error('Error loading user circles:', error);
    }
  };

  const inviteToCircle = async (circleId: string, memberId: string) => {
    try {
      setInvitingToCircle(true);
      const session = getStoredSession();
      if (!session?.user) throw new Error('Not authenticated');

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      // Send invitation that requires confirmation
      const response = await fetch(
        `${supabaseUrl}/rest/v1/circle_members`,
        {
          method: 'POST',
          headers: {
            'apikey': supabaseKey!,
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            circle_id: circleId,
            member_id: memberId,
            status: 'pending',
            invited_by: session.user.id,
            role: 'member'
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to invite to circle');
      }

      return true;
    } catch (error) {
      console.error('Error inviting to circle:', error);
      return false;
    } finally {
      setInvitingToCircle(false);
    }
  };

  const sendMessage = async (recipientId: string, message: string) => {
    if (!user?.id || !message.trim()) return false;

    setIsSendingMessage(true);
    try {
      const session = getStoredSession();
      if (!session) {
        console.error('No session found');
        return false;
      }

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ryvecaicjhzfsikfedkp.supabase.co';
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_HqXqQ5cjrg1CJIFIyL2QnA_WlwZ4AjB';

      console.log('Attempting to send message from', user.id, 'to', recipientId);

      // Create conversation
      const conversationData = {
        participant_1: user.id,
        participant_2: recipientId,
        last_message_text: message,
        last_message_at: new Date().toISOString(),
        last_message_by: user.id,
      };

      const conversationRes = await fetch(`${supabaseUrl}/rest/v1/conversations`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey!,
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        body: JSON.stringify(conversationData),
      });

      if (!conversationRes.ok) {
        const errorText = await conversationRes.text();
        console.error('Failed to create conversation:', conversationRes.status, errorText);
        return false;
      }

      const [conversation] = await conversationRes.json();

      // Send message
      const messageData = {
        conversation_id: conversation.id,
        sender_id: user.id,
        content: message,
      };

      const messageRes = await fetch(`${supabaseUrl}/rest/v1/messages`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey!,
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messageData),
      });

      if (!messageRes.ok) {
        const errorText = await messageRes.text();
        console.error('Failed to send message:', messageRes.status, errorText);
        return false;
      }

      console.log('Message sent successfully');
      return true;
    } catch (err) {
      console.error('Error sending message:', err);
      return false;
    } finally {
      setIsSendingMessage(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <ProtectedRoute>
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white">
      <div className="max-w-md mx-auto px-4 py-8">
        <HavenHeader />
        
        {/* Section Navigation */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-2 scrollbar-hide justify-center">
          <button
            onClick={() => window.location.href = '/events?type=public'}
            className="px-6 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all shadow-sm min-w-fit flex items-center justify-center bg-white text-gray-700 hover:bg-teal-50 hover:text-teal-700 border border-gray-200 hover:border-teal-200 hover:shadow-md hover:scale-105"
          >
            Events
          </button>
        </div>
        </div>

        {/* Search & Filter Controls */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-2 scrollbar-hide justify-center">
          <button
            onClick={() => setShowSearch(!showSearch)}
            className={`px-6 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all shadow-sm min-w-fit flex items-center justify-center ${
              showSearch || searchTerm
                ? 'bg-teal-600 text-white shadow-md scale-105'
                : 'bg-white text-gray-700 hover:bg-teal-50 hover:text-teal-700 border border-gray-200 hover:border-teal-200 hover:shadow-md hover:scale-105'
            }`}
          >
            Search
          </button>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-6 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all shadow-sm min-w-fit flex items-center justify-center ${
              showFilters
                ? 'bg-teal-600 text-white shadow-md scale-105'
                : 'bg-white text-gray-700 hover:bg-teal-50 hover:text-teal-700 border border-gray-200 hover:border-teal-200 hover:shadow-md hover:scale-105'
            }`}
          >
            Filters
          </button>
          {viewMode !== 'list' && (
            <button
              onClick={() => setViewMode('list')}
              className="px-6 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all shadow-sm min-w-fit flex items-center justify-center bg-white text-gray-700 hover:bg-teal-50 hover:text-teal-700 border border-gray-200 hover:border-teal-200 hover:shadow-md hover:scale-105"
            >
              List
            </button>
          )}
          {viewMode !== 'map' && (
            <button
              onClick={() => setViewMode('map')}
              className="px-6 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all shadow-sm min-w-fit flex items-center justify-center bg-white text-gray-700 hover:bg-teal-50 hover:text-teal-700 border border-gray-200 hover:border-teal-200 hover:shadow-md hover:scale-105"
            >
              Map
            </button>
          )}
        </div>

        {/* Expandable Search Bar */}
        {showSearch && (
          <div className="mb-6 px-6">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                placeholder="Search families by name, location, or interests..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                autoFocus
              />
            </div>
          </div>
        )}

        {/* Filters Panel */}
        {showFilters && (
          <div className="bg-gray-50 rounded-xl p-4 mb-6">
            <div className="space-y-4">
                {/* Radius Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Search Radius (km)</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={searchRadius}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === '') {
                        setSearchRadius(15); // Set to default when empty
                        return;
                      }
                      const newRadius = parseInt(value);
                      if (!isNaN(newRadius)) {
                        setSearchRadius(Math.max(1, Math.min(100, newRadius)));
                        // Auto-load user location if not set
                        if (!userLocation) {
                          getUserLocation();
                        }
                      }
                    }}
                    onFocus={(e) => e.target.select()}
                    className="w-20 px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 text-center"
                  />
                  {locationError && (
                    <p className="text-xs text-red-600 mt-1">{locationError}</p>
                  )}
                </div>

                {/* Kids Age Range */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Kids Age Range</label>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Min Age</label>
                      <input
                        type="number"
                        min="0"
                        max="17"
                        value={ageRange.min}
                        onChange={(e) => {
                          const min = parseInt(e.target.value) || 0;
                          setAgeRange(prev => ({ 
                            ...prev, 
                            min: Math.max(0, Math.min(min, prev.max - 1))
                          }));
                        }}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 text-center"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Max Age</label>
                      <input
                        type="number"
                        min="1"
                        max="18"
                        value={ageRange.max}
                        onChange={(e) => {
                          const max = parseInt(e.target.value) || 18;
                          setAgeRange(prev => ({ 
                            ...prev, 
                            max: Math.max(prev.min + 1, Math.min(max, 18))
                          }));
                        }}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 text-center"
                        placeholder="18"
                      />
                    </div>
                  </div>
                </div>

                {/* User Type Filter */}
                <div>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { value: 'all', label: 'All' },
                      { value: 'family', label: 'Families' },
                      { value: 'teacher', label: 'Teachers' },
                      { value: 'event', label: 'Events' },
                      { value: 'facility', label: 'Facilities' },
                      { value: 'other', label: 'Other' },
                    ].map((type) => (
                      <button
                        key={type.value}
                        onClick={() => toggleFilterType(type.value)}
                        className={`px-3 py-2 text-sm font-medium rounded-xl border-2 transition-colors ${
                          filterTypes.includes(type.value)
                            ? 'border-teal-600 bg-teal-50 text-teal-700'
                            : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                        }`}
                      >
                        {type.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Hidden Families */}
                {hiddenFamilies.length > 0 && (
                  <div>
                    <button
                      onClick={() => setShowHiddenModal(true)}
                      className="px-3 py-2 bg-teal-50 text-teal-700 rounded-xl text-sm font-medium hover:bg-teal-100 border border-teal-200"
                    >
                      Show Hidden ({hiddenFamilies.length})
                    </button>
                  </div>
                )}
            </div>
          </div>
        )}

        {/* Content */}
        <div>
        {/* Selection Summary */}
        {selectionMode && (
          <div className="mb-6 flex items-center justify-end">
            <p className="text-teal-600 font-medium">
              {selectedFamilies.length} selected
            </p>
          </div>
        )}

        {/* Map View */}
        {viewMode === 'map' && (
          <div className="space-y-4 pb-6">
            <FamilyMap 
              families={filteredFamilies}
              onFamilyClick={(family) => setSelectedFamily(family)}
              className="w-full"
              userLocation={userLocation}
              searchRadius={searchRadius}
              showRadius={!!userLocation}
              userProfileLocation={profile?.location_name}
            />
          </div>
        )}

        {/* List View */}
        {viewMode === 'list' && (
          <div className="space-y-2 px-6">
            {filteredFamilies.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-gray-100 rounded-full mx-auto mb-4 flex items-center justify-center">
                  <span className="text-2xl">👥</span>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No families found</h3>
                <p className="text-gray-600">
                  Try adjusting your search filters or check back later for new families!
                </p>
              </div>
            ) : (
              <>
                {filteredFamilies.map((family) => (
                <div 
                  key={family.id} 
                  className={`w-full bg-white rounded-xl p-4 transition-all cursor-pointer select-none ${
                    selectionMode 
                      ? selectedFamilies.includes(family.id) 
                        ? 'ring-2 ring-teal-500 bg-teal-50' 
                        : 'hover:bg-gray-50' 
                      : 'hover:bg-gray-50'
                  }`}
                  onClick={() => handleFamilyClick(family.id)}
                  onMouseDown={(e) => handleLongPressStart(family.id, e)}
                  onMouseUp={handleLongPressEnd}
                  onMouseLeave={handleLongPressEnd}
                  onTouchStart={(e) => handleLongPressStart(family.id, e)}
                  onTouchEnd={handleLongPressEnd}
                  onTouchCancel={handleLongPressEnd}
                >
                  <div className="flex items-start justify-between">
                    {/* Selection Indicator */}
                    {selectionMode && (
                      <div className="mr-4 mt-1">
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                          selectedFamilies.includes(family.id)
                            ? 'bg-teal-600 border-teal-600 text-white'
                            : 'border-gray-300 bg-white'
                        }`}>
                          {selectedFamilies.includes(family.id) && (
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Family Info */}
                    <div 
                      className="flex-1 cursor-pointer"
                      onClick={() => setSelectedFamilyDetails(family)}
                    >
                      <div className="flex items-start gap-4">
                        <AvatarUpload
                          userId={family.id}
                          currentAvatarUrl={family.avatar_url}
                          name={family.family_name || family.display_name || 'Family'}
                          size="md"
                          editable={false}
                        />
                        <div className="flex-1">
                          {/* Name and Username */}
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-emerald-600">
                              {family.display_name || family.family_name.split(' ')[0] || family.family_name}{family.username && ` (${family.username})`}
                            </h3>
                            <AdminBadge adminLevel={family.admin_level || null} />
                            {family.is_verified && <span className="text-green-500">✓</span>}
                          </div>
                          
                          {/* Location with Online Status */}
                          <div className="flex items-center gap-2 mb-2">
                            <p className="text-sm text-gray-600">{family.location_name}</p>
                            {/* Online status indicator */}
                            {family.is_online && (
                              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                            )}
                            {/* Last active status */}
                            {!family.is_online && family.last_active && (
                              <span className="text-xs text-gray-500">• {formatLastActive(family.last_active)}</span>
                            )}
                          </div>
                          
                          {/* Children dots with ages */}
                          {family.kids_ages && family.kids_ages.length > 0 && (
                            <div className="flex items-center gap-1">
                              {family.kids_ages.map((age, index) => (
                                <div key={index} className="flex items-center">
                                  <div className="w-6 h-6 bg-teal-100 rounded-full flex items-center justify-center">
                                    <span className="text-xs font-medium text-teal-700">{age}</span>
                                  </div>
                                  {index < family.kids_ages.length - 1 && <div className="w-1 h-1 bg-gray-300 rounded-full mx-1"></div>}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    {!selectionMode && (
                      <div className="flex flex-col gap-2">
                        <button
                          onClick={() => sendConnectionRequest(family.id)}
                          disabled={getConnectionButtonState(family.id).disabled}
                          className={`px-4 py-2 rounded-lg font-medium transition-colors text-sm min-w-[85px] ${getConnectionButtonState(family.id).style}`}
                        >
                          {getConnectionButtonState(family.id).text}
                        </button>
                        <button
                          onClick={() => setSelectedFamily(family)}
                          className="px-4 py-2 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700 transition-colors text-sm min-w-[85px]"
                        >
                          Message
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              </>
            )}
          </div>
        )}

        {/* Grid View - REMOVED for mobile compatibility */}
        </div>
      
      {/* Message Modal */}
      {selectedFamily && !showCircleModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <AvatarUpload
                userId={selectedFamily.id}
                currentAvatarUrl={selectedFamily.avatar_url}
                name={selectedFamily.family_name || selectedFamily.display_name || 'Family'}
                size="md"
                editable={false}
              />
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-emerald-600">{selectedFamily.display_name || selectedFamily.family_name.split(' ')[0] || selectedFamily.family_name}</h3>
                  <AdminBadge adminLevel={selectedFamily.admin_level || null} />
                </div>
                <p className="text-sm text-gray-600">{selectedFamily.location_name}</p>
              </div>
            </div>
            
            <div className="mb-4">
              <textarea
                placeholder="Hi! I'd love to connect with your family..."
                className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 resize-none"
                rows={4}
                id="messageInput"
              />
            </div>
            
            {userCircles.length > 0 && (
              <div className="mb-3">
                <button
                  onClick={() => setShowCircleModal(true)}
                  className="w-full px-4 py-2 bg-emerald-100 text-emerald-700 rounded-xl font-medium hover:bg-emerald-200"
                >
                  Invite to Circle
                </button>
              </div>
            )}
            
            {/* Connect Button (below message area) */}
            <div className="mb-3">
              <button
                onClick={() => sendConnectionRequest(selectedFamily.id)}
                disabled={getConnectionButtonState(selectedFamily.id).disabled}
                className={`w-full px-4 py-2 rounded-xl font-medium transition-colors h-10 ${getConnectionButtonState(selectedFamily.id).style}`}
              >
                {getConnectionButtonState(selectedFamily.id).text}
              </button>
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedFamily(null)}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const messageInput = document.getElementById('messageInput') as HTMLTextAreaElement;
                  const message = messageInput?.value || '';
                  if (message.trim()) {
                    const success = await sendMessage(selectedFamily.id, message);
                    if (success) {
                      setSelectedFamily(null);
                      setSuccessMessageText('Message sent!');
                      setShowSuccessMessage(true);
                      // Hide success message after 3 seconds
                      setTimeout(() => setShowSuccessMessage(false), 3000);
                    } else {
                      alert('Failed to send message. Please try again.');
                    }
                  }
                }}
                disabled={isSendingMessage}
                className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-xl font-medium hover:bg-teal-700 disabled:bg-gray-300"
              >
                {isSendingMessage ? 'Sending...' : 'Send Message'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Circle Invitation Modal */}
      {selectedFamily && showCircleModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-gray-900">Invite to Circle</h3>
              <button
                onClick={() => setShowCircleModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
            </div>

            <div className="flex items-center gap-3 mb-6">
              <AvatarUpload
                userId={selectedFamily.id}
                currentAvatarUrl={selectedFamily.avatar_url}
                name={selectedFamily.family_name || selectedFamily.display_name || 'Family'}
                size="md"
                editable={false}
              />
              <div>
                <h4 className="font-semibold text-emerald-600">{selectedFamily.display_name || selectedFamily.family_name.split(' ')[0] || selectedFamily.family_name}</h4>
                <p className="text-sm text-gray-600">Select a circle to send an invitation to</p>
              </div>
            </div>

            <div className="space-y-3 mb-6">
              {userCircles.map((circle) => (
                <button
                  key={circle.id}
                  onClick={async () => {
                    const success = await inviteToCircle(circle.id, selectedFamily.id);
                    if (success) {
                      setShowCircleModal(false);
                      setSelectedFamily(null);
                      setSuccessMessageText('Invitation sent! They will receive a request to join your circle.');
                      setShowSuccessMessage(true);
                      setTimeout(() => setShowSuccessMessage(false), 3000);
                    } else {
                      alert('Failed to send circle invitation. They may already be invited or be a member.');
                    }
                  }}
                  disabled={invitingToCircle}
                  className="w-full p-3 text-left bg-gray-50 rounded-xl hover:bg-gray-100 disabled:opacity-50"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{circle.emoji}</span>
                    <div>
                      <div className="font-medium text-gray-900">{circle.name}</div>
                      <div className="text-sm text-gray-500">{circle.member_count} members</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowCircleModal(false)}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200"
              >
                Cancel
              </button>
              <Link
                href="/circles"
                className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-xl font-medium hover:bg-teal-700 text-center"
                onClick={() => {
                  setShowCircleModal(false);
                  setSelectedFamily(null);
                }}
              >
                Create New Circle
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Floating Selection Actions */}
      {selectionMode && (
        <div className="fixed bottom-20 left-4 right-4 z-50 flex items-center justify-center">
          <div className="bg-gray-800 text-white rounded-full px-6 py-3 shadow-xl flex items-center gap-4">
            {selectedFamilies.length > 0 ? (
              <>
                <span className="text-sm font-medium">
                  {selectedFamilies.length} selected
                </span>
                <button
                  onClick={hideSelectedFamilies}
                  className="bg-red-600 text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-red-700 transition-colors"
                >
                  Hide
                </button>
              </>
            ) : (
              <span className="text-sm text-gray-300">Select families to hide them</span>
            )}
            <button
              onClick={() => {
                setSelectionMode(false);
                setSelectedFamilies([]);
              }}
              className="bg-gray-600 text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* User Details Modal */}
      {selectedFamilyDetails && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[80vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-white rounded-t-2xl p-6 pb-4 border-b border-gray-100">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-gray-900">Profile Details</h2>
                <button
                  onClick={() => setSelectedFamilyDetails(null)}
                  className="text-gray-400 hover:text-gray-600 text-2xl"
                >
                  ×
                </button>
              </div>
            </div>
            
            {/* Content */}
            <div className="p-6">
              {/* User Info */}
              <div className="flex items-start gap-4 mb-6">
                <AvatarUpload
                  userId={selectedFamilyDetails.id}
                  currentAvatarUrl={selectedFamilyDetails.avatar_url}
                  name={selectedFamilyDetails.family_name || selectedFamilyDetails.display_name || 'Family'}
                  size="lg"
                  editable={false}
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-xl font-semibold text-emerald-600">
                      {selectedFamilyDetails.display_name || selectedFamilyDetails.family_name.split(' ')[0] || selectedFamilyDetails.family_name}
                    </h3>
                    <AdminBadge adminLevel={selectedFamilyDetails.admin_level || null} size="md" />
                    {selectedFamilyDetails.is_verified && <span className="text-green-500 text-lg">✓</span>}
                  </div>
                  {selectedFamilyDetails.username && (
                    <p className="text-gray-600 mb-2">@{selectedFamilyDetails.username}</p>
                  )}
                  <p className="text-sm text-gray-500">
                    Joined {new Date(selectedFamilyDetails.created_at).toLocaleDateString('en-AU', { 
                      year: 'numeric', 
                      month: 'long', 
                      day: 'numeric' 
                    })}
                  </p>
                </div>
              </div>

              {/* Location */}
              <div className="mb-6">
                <h4 className="font-semibold text-gray-900 mb-2">Location</h4>
                <div className="flex items-center gap-2">
                  <p className="text-gray-700">{selectedFamilyDetails.location_name}</p>
                  {/* Online status indicator */}
                  {selectedFamilyDetails.is_online && (
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  )}
                  {/* Last active status */}
                  {!selectedFamilyDetails.is_online && selectedFamilyDetails.last_active && (
                    <span className="text-xs text-gray-500">• {formatLastActive(selectedFamilyDetails.last_active)}</span>
                  )}
                </div>
              </div>

              {/* Children */}
              {selectedFamilyDetails.kids_ages && selectedFamilyDetails.kids_ages.length > 0 && (
                <div className="mb-6">
                  <h4 className="font-semibold text-gray-900 mb-3">👨‍👩‍👧‍👦 Children</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedFamilyDetails.kids_ages.map((age, index) => (
                      <div key={index} className="bg-teal-50 border border-teal-200 rounded-full px-3 py-2">
                        <span className="text-teal-700 font-medium">{age} years old</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* About Us */}
              {selectedFamilyDetails.bio && (
                <div className="mb-6">
                  <h4 className="font-semibold text-gray-900 mb-2">💬 About Us</h4>
                  <p className="text-gray-700 leading-relaxed">{selectedFamilyDetails.bio}</p>
                </div>
              )}

              {/* Interests */}
              {selectedFamilyDetails.interests && selectedFamilyDetails.interests.length > 0 && (
                <div className="mb-6">
                  <h4 className="font-semibold text-gray-900 mb-3">Interests</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedFamilyDetails.interests.map((interest, index) => (
                      <span key={index} className="px-3 py-1 bg-purple-50 text-purple-700 rounded-full text-sm font-medium border border-purple-200">
                        {interest}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => sendConnectionRequest(selectedFamilyDetails.id)}
                  disabled={getConnectionButtonState(selectedFamilyDetails.id).disabled}
                  className={`flex-1 px-4 py-3 rounded-xl font-medium transition-colors min-w-0 ${getConnectionButtonState(selectedFamilyDetails.id).style}`}
                >
                  {getConnectionButtonState(selectedFamilyDetails.id).text}
                </button>
                <button
                  onClick={() => {
                    setSelectedFamily(selectedFamilyDetails);
                    setSelectedFamilyDetails(null);
                  }}
                  className="flex-1 px-4 py-3 bg-teal-600 text-white rounded-xl font-medium hover:bg-teal-700 transition-colors min-w-0"
                >
                  Message
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Success Message Notification */}
      {showSuccessMessage && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50">
          <div className="bg-green-600 text-white px-6 py-3 rounded-xl shadow-lg flex items-center gap-2">
            <span className="text-lg">✓</span>
            <span className="font-medium">{successMessageText}</span>
          </div>
        </div>
      )}

      {/* Hidden Families Modal */}
      {showHiddenModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[80vh] flex flex-col">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900">Hidden Families</h3>
                <button
                  onClick={() => setShowHiddenModal(false)}
                  className="text-gray-400 hover:text-gray-600 text-xl"
                >
                  ×
                </button>
              </div>
              <p className="text-sm text-gray-600 mt-2">
                {hiddenFamilies.length} families are currently hidden from your discover page
              </p>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4">
              {getHiddenFamiliesDetails().length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-4xl mb-2">👻</div>
                  <h4 className="font-semibold text-gray-900 mb-2">No Hidden Families</h4>
                  <p className="text-gray-600 text-sm">All families are currently visible on your discover page.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {getHiddenFamiliesDetails().map((family) => (
                    <div key={family.id} className="bg-gray-50 rounded-xl p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <AvatarUpload
                            userId={family.id}
                            currentAvatarUrl={family.avatar_url}
                            name={family.family_name || family.display_name || '?'}
                            size="sm"
                            editable={false}
                          />
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium text-emerald-600">
                                {family.display_name || family.family_name.split(' ')[0] || family.family_name}
                                {family.is_verified && <span className="ml-1 text-teal-600 text-sm">✓</span>}
                              </h4>
                              <AdminBadge adminLevel={family.admin_level || null} />
                            </div>
                            <p className="text-sm text-gray-500">{family.location_name}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => unhideFamily(family.id)}
                          className="px-3 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 text-sm"
                        >
                          Unhide
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-gray-200">
              <div className="flex gap-3">
                <button
                  onClick={() => setShowHiddenModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200"
                >
                  Close
                </button>
                {hiddenFamilies.length > 0 && (
                  <button
                    onClick={() => {
                      clearHiddenFamilies();
                      setShowHiddenModal(false);
                    }}
                    className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700"
                  >
                    Unhide All
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
    </ProtectedRoute>
  );
}