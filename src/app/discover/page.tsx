'use client';
import { toast } from '@/lib/toast';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { getStoredSession } from '@/lib/session';
import { getAvatarColor, statusColors, statusLabels, statusIcons, getUserTypeBadge } from '@/lib/colors';
import { checkProfileCompletion, getResumeSignupUrl } from '@/lib/profileCompletion';
import FamilyMap from '@/components/FamilyMap';
import AvatarUpload from '@/components/AvatarUpload';
import AppHeader from '@/components/AppHeader';
import ProtectedRoute from '@/components/ProtectedRoute';
import AdminBadge from '@/components/AdminBadge';
import { createNotification } from '@/lib/notifications';
import BrowseLocation, { loadBrowseLocation, type BrowseLocationState } from '@/components/BrowseLocation';
import { loadSearchRadius } from '@/lib/preferences';
import ReportBlockModal from '@/components/ReportBlockModal';
import { DiscoverPageSkeleton } from '@/components/SkeletonLoader';

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
  last_active_at?: string;
  updated_at?: string;
  user_type?: 'family' | 'teacher' | 'business' | 'event' | 'facility' | 'other';
  homeschool_approaches?: string[];
  subjects?: string[];
  age_groups_taught?: string[];
  services?: string;
  contact_info?: string;
  location_lat?: number;
  location_lng?: number;
};

type Profile = {
  id: string;
  name: string;
  location_name: string;
  kids_ages: number[];
  status: string;
  bio?: string;
  user_type?: 'family' | 'teacher' | 'business' | 'event' | 'facility' | 'other';
};

type ViewMode = 'list' | 'map';
type Section = 'families';

type FilterOption = {
  value: string;
  label: string;
  isOther?: boolean;
  disabled?: boolean;
};

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

// Get coordinates for common locations — returns null if unknown (do not guess)
function getLocationCoords(locationName: string): { lat: number; lng: number } | null {
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
  
  // Unknown location — return null so radius filter can exclude them
  return null;
}

function EnhancedDiscoverPage() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [families, setFamilies] = useState<Family[]>([]);
  const [filteredFamilies, setFilteredFamilies] = useState<Family[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedFamily, setSelectedFamily] = useState<Family | null>(null);
  const [reportBlockTarget, setReportBlockTarget] = useState<{ id: string; name: string; mode: 'report' | 'block' } | null>(null);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  
  // Selection and hiding system
  const [hiddenFamilies, setHiddenFamilies] = useState<string[]>([]);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [successMessageText, setSuccessMessageText] = useState('Success!');
  const [showHiddenModal, setShowHiddenModal] = useState(false);
  
  // Circles functionality
  const [showCircleModal, setShowCircleModal] = useState(false);
  const [userCircles, setUserCircles] = useState<any[]>([]);
  const [invitingToCircle, setInvitingToCircle] = useState(false);
  
  // Connection requests state
  const [connectionRequests, setConnectionRequests] = useState<Map<string, {status: string, isRequester: boolean}>>(new Map());
  
  // View and filtering
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [activeSection, setActiveSection] = useState<Section>('families');
  const [maxDistance, setMaxDistance] = useState(15);
  const [ageRange, setAgeRange] = useState({ min: 1, max: 10 });
  const [activeTab, setActiveTab] = useState<'all' | 'family' | 'teacher' | 'business'>('all');
  const [familyStatusFilter, setFamilyStatusFilter] = useState<string>('all');
  const [familyCustomFilter, setFamilyCustomFilter] = useState<string>('');
  const [approachFilter, setApproachFilter] = useState<string>('all');
  const [teacherTypeFilter, setTeacherTypeFilter] = useState<'all' | 'extracurricular' | 'primary' | 'high' | 'other'>('all');
  const [teacherTypeCustom, setTeacherTypeCustom] = useState('');
  const [teacherSubFilter, setTeacherSubFilter] = useState<string>('all');
  const [teacherSubCustom, setTeacherSubCustom] = useState('');
  const [businessTypeFilter, setBusinessTypeFilter] = useState<string>('all');
  const [businessCustomFilter, setBusinessCustomFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [dismissedBanner, setDismissedBanner] = useState(() =>
    typeof window !== 'undefined' && sessionStorage.getItem('haven-nearby-banner-dismissed') === 'true'
  );
  const [locationMissing, setLocationMissing] = useState(false);

  // Radius search - with localStorage persistence for testing
  const [searchRadius] = useState(() => loadSearchRadius());
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(() => {
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      const stored = localStorage.getItem('haven-user-location');
      return stored ? JSON.parse(stored) : null;
    }
    return null;
  });
  const [locationError, setLocationError] = useState<string | null>(null);
  const [browseLocation, setBrowseLocation] = useState<BrowseLocationState>(() => loadBrowseLocation());
  
  const router = useRouter();
  const searchParams = useSearchParams();

  // Auto-open profile from ?profile= query param (e.g. from notification links)
  useEffect(() => {
    const profileId = searchParams.get('profile');
    if (!profileId) return;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const session = getStoredSession();
    if (!session || !supabaseUrl || !supabaseKey) return;
    fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${profileId}&select=*`, {
      headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${session.access_token}` }
    })
      .then(r => r.json())
      .then(data => {
        if (data && data[0]) setSelectedFamilyDetails(data[0] as Family);
      })
      .catch(() => {});
  }, [searchParams]);

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
        
        
        if (profileData) {
          // Check if this is a newly completed signup (bypass profile check)
          const signupComplete = typeof window !== 'undefined' ? localStorage.getItem('haven-signup-complete') : null;
          const signupTime = signupComplete ? parseInt(signupComplete) : 0;
          const fiveMinutesAgo = Date.now() - (5 * 60 * 1000); // 5 minutes
          
          if (signupComplete && signupTime > fiveMinutesAgo) {
            // Clear the flag after using it
            localStorage.removeItem('haven-signup-complete');
          } else {
            // Check if profile is complete
            const completionStep = checkProfileCompletion(profileData);
            
            if (completionStep !== 'complete') {
              // Allow access to discover regardless of completion status
              // This prevents redirect loops and lets users use the app
            }
          }
          
          setProfile(profileData);

          // Warn only if the location can't be resolved at all — neither stored coords nor the known-suburbs list
          if (profileData.location_name && !profileData.location_lat && !profileData.location_lng) {
            const resolvable = getLocationCoords(profileData.location_name);
            if (!resolvable) setLocationMissing(true);
          }

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
          router.push('/signup/resume?step=2');
          return;
        }

        // Skip welcome flow - go directly to discover page
        
        
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
        
        // Use real last_active_at for presence indicators
        const familiesWithStatus = familiesData.map((family: Family) => {
          const lastActive = family.last_active_at || family.updated_at;
          const diffMs = lastActive ? Date.now() - new Date(lastActive).getTime() : Infinity;
          return {
            ...family,
            is_online: diffMs < 15 * 60 * 1000, // Active within 15 min
            last_active: lastActive,
            user_type: family.user_type || 'family',
          };
        });
        
        setFamilies(familiesWithStatus);
        
        
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

  }, [router]);

  // Filter families based on current filters
  useEffect(() => {
    // Global search — bypasses radius and all other filters
    if (searchQuery.trim().length > 0) {
      const q = searchQuery.trim().toLowerCase();
      const results = families.filter(family => {
        if (hiddenFamilies.includes(family.id)) return false;
        return (
          family.family_name?.toLowerCase().includes(q) ||
          family.display_name?.toLowerCase().includes(q) ||
          family.username?.toLowerCase().includes(q) ||
          family.location_name?.toLowerCase().includes(q) ||
          family.bio?.toLowerCase().includes(q)
        );
      });
      setFilteredFamilies(results);
      return;
    }

    let filtered = families.filter(family => {
      // Filter out hidden families
      if (hiddenFamilies.includes(family.id)) return false;
      
      // Filter out already connected families (accepted connections)
      const connection = connectionRequests.get(family.id);
      if (connection && connection.status === 'accepted') return false;
      
      return true;
    });

    // Radius search — use browse override if set, otherwise profile location
    const activeLocation = browseLocation ?? userLocation;
    if (activeLocation) {
      filtered = filtered.filter(family => {
        // Prefer stored coords; fall back to hardcoded lookup
        const familyCoords = (family.location_lat && family.location_lng)
          ? { lat: family.location_lat, lng: family.location_lng }
          : getLocationCoords(family.location_name);
        // If coords are unknown, exclude from radius results
        if (!familyCoords) return false;
        const distance = calculateDistance(
          activeLocation.lat,
          activeLocation.lng,
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

    // Account type tab filter
    if (activeTab !== 'all') {
      filtered = filtered.filter(family => {
        const userType = family.user_type || 'family';
        const effectiveType = userType === 'facility' ? 'business' : userType;
        return effectiveType === activeTab;
      });
    }

    // Family status sub-filter (only when Families tab is active)
    if (activeTab === 'family' && familyStatusFilter !== 'all') {
      const knownStatuses = ['new', 'considering', 'experienced'];
      if (familyStatusFilter === 'other') {
        // Show families whose status doesn't match any known value
        filtered = filtered.filter(family => {
          const statuses = Array.isArray(family.status)
            ? family.status
            : typeof family.status === 'string'
              ? family.status.split(',').map((s: string) => s.trim())
              : [];
          return !statuses.some((s: string) => knownStatuses.includes(s));
        });
        // Further narrow by custom text if provided
        if (familyCustomFilter.trim()) {
          const q = familyCustomFilter.toLowerCase();
          filtered = filtered.filter(f =>
            (f.family_name || '').toLowerCase().includes(q) ||
            (f.bio || '').toLowerCase().includes(q)
          );
        }
      } else {
        filtered = filtered.filter(family => {
          const statuses = Array.isArray(family.status)
            ? family.status
            : typeof family.status === 'string'
              ? family.status.split(',').map((s: string) => s.trim())
              : [];
          return statuses.includes(familyStatusFilter);
        });
      }
    }

    // Homeschool approach filter (only when Families tab is active)
    if ((activeTab === 'all' || activeTab === 'family') && approachFilter !== 'all') {
      filtered = filtered.filter(family => {
        const approaches = family.homeschool_approaches || [];
        return approaches.includes(approachFilter);
      });
    }

    // Teacher type sub-filter
    if (activeTab === 'teacher' && teacherTypeFilter !== 'all') {
      const primaryAges = ['5–7', '8–10', '11–13'];
      const highAges = ['14–16', '17–18'];

      filtered = filtered.filter(family => {
        const ages = family.age_groups_taught || [];
        const subjects = (family.subjects || []).map((s: string) => s.toLowerCase());

        if (teacherTypeFilter === 'primary') return ages.some((a: string) => primaryAges.includes(a));
        if (teacherTypeFilter === 'high') return ages.some((a: string) => highAges.includes(a));
        if (teacherTypeFilter === 'extracurricular') {
          // Extracurricular = teaches music/sport/arts OR doesn't fit primary/high pattern
          return true; // show all teachers, sub-filter handles specifics
        }
        if (teacherTypeFilter === 'other') {
          const notOther = !ages.some((a: string) => [...primaryAges, ...highAges].includes(a));
          if (!notOther) return false;
          // Custom text search for 'other' teacher type
          if (teacherTypeCustom.trim()) {
            const q = teacherTypeCustom.toLowerCase();
            return (family.bio || '').toLowerCase().includes(q) ||
              (family.subjects || []).some((s: string) => s.toLowerCase().includes(q));
          }
          return true;
        }
        return true;
      });

      // Teacher subject sub-filter
      if (teacherSubFilter !== 'all') {
        filtered = filtered.filter(family => {
          const subjects = (family.subjects || []).map((s: string) => s.toLowerCase());
          if (teacherSubFilter === 'Music') return subjects.some((s: string) => s.includes('music'));
          if (teacherSubFilter === 'Sport') return subjects.some((s: string) => s.includes('sport') || s.includes('pe') || s.includes('physical'));
          if (teacherSubFilter === 'Arts') return subjects.some((s: string) => s.includes('art') || s.includes('drama') || s.includes('creative'));
          if (teacherSubFilter === 'Math') return subjects.some((s: string) => s.includes('math'));
          if (teacherSubFilter === 'English') return subjects.some((s: string) => s.includes('english'));
          if (teacherSubFilter === 'Other') {
            const knownSubjects = ['music', 'sport', 'pe', 'physical', 'art', 'drama', 'creative', 'math', 'english'];
            const notKnown = !subjects.some((s: string) => knownSubjects.some(k => s.includes(k)));
            if (!notKnown) return false;
            if (teacherSubCustom.trim()) {
              const q = teacherSubCustom.toLowerCase();
              return subjects.some((s: string) => s.includes(q)) || (family.bio || '').toLowerCase().includes(q);
            }
            return true;
          }
          return true;
        });
      }
    }

    // Business type sub-filter
    if (activeTab === 'business' && businessTypeFilter !== 'all') {
      const typeMap: Record<string, string[]> = {
        'playspace':  ['play space', 'playspace', 'indoor play', 'playground', 'play centre'],
        'learning':   ['learning space', 'learning centre', 'tutoring', 'education centre'],
        'resources':  ['resource', 'curriculum', 'supply', 'books', 'materials'],
      };
      filtered = filtered.filter(family => {
        const text = ((family.services || '') + ' ' + (family.bio || '')).toLowerCase();
        if (businessTypeFilter === 'other') {
          const knownTerms = Object.values(typeMap).flat();
          const notKnown = !knownTerms.some(t => text.includes(t));
          if (!notKnown) return false;
          if (businessCustomFilter.trim()) {
            return text.includes(businessCustomFilter.toLowerCase());
          }
          return true;
        }
        const terms = typeMap[businessTypeFilter] || [];
        return terms.some(t => text.includes(t));
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
  }, [families, locationFilter, ageRange, activeTab, familyStatusFilter, familyCustomFilter, approachFilter, teacherTypeFilter, teacherTypeCustom, teacherSubFilter, teacherSubCustom, businessTypeFilter, businessCustomFilter, hiddenFamilies, profile, userLocation, browseLocation, searchRadius, connectionRequests, searchQuery]);

  // Log 'other' box entries to search_insights table (debounced 1.5s)
  useEffect(() => {
    const entries: [string, string][] = [
      ['family-other', familyCustomFilter],
      ['teacher-type-other', teacherTypeCustom],
      ['teacher-sub-other', teacherSubCustom],
      ['business-other', businessCustomFilter],
    ].filter(([, v]) => v.trim().length > 2) as [string, string][];

    if (entries.length === 0) return;

    const timer = setTimeout(async () => {
      try {
        const sUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const sKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        const session = JSON.parse(localStorage.getItem('sb-ryvecaicjhzfsikfedkp-auth-token') || '{}');
        if (!session.access_token) return;
        for (const [context, term] of entries) {
          await fetch(`${sUrl}/rest/v1/search_insights`, {
            method: 'POST',
            headers: {
              'apikey': sKey!, 'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates',
            },
            body: JSON.stringify({ context, term: term.trim().toLowerCase(), count: 1, last_seen_at: new Date().toISOString() }),
          });
        }
      } catch { /* table may not exist yet */ }
    }, 1500);

    return () => clearTimeout(timer);
  }, [familyCustomFilter, teacherTypeCustom, teacherSubCustom, businessCustomFilter]);

  // Getting started toast — fires once per session until all steps complete
  useEffect(() => {
    if (!profile) return;
    const acceptedCount = [...connectionRequests.values()].filter(c => c.status === 'accepted').length;
    if (acceptedCount > 0) return; // fully onboarded

    const shownKey = 'haven-setup-toast';
    if (sessionStorage.getItem(shownKey)) return;
    sessionStorage.setItem(shownKey, 'true');

    const profileDone = !!(profile?.bio?.trim());
    const done = profileDone ? 1 : 0;
    const total = 4;
    const msg = done === 0
      ? 'Welcome to Haven! Start by completing your profile.'
      : `Setup: ${done}/${total} done — connect with families nearby!`;

    const timer = setTimeout(() => toast(msg, 'info'), 1500);
    return () => clearTimeout(timer);
  }, [profile, connectionRequests]);

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

  const hideSingleFamily = (familyId: string) => {
    const newHidden = [...hiddenFamilies, familyId];
    setHiddenFamilies(newHidden);
    localStorage.setItem('haven-hidden-families', JSON.stringify(newHidden));
  };

  const getHiddenFamiliesDetails = () => {
    return families.filter(family => hiddenFamilies.includes(family.id));
  };

  const [selectedFamilyDetails, setSelectedFamilyDetails] = useState<Family | null>(null);


  // Helper function to get connection button state
  const getConnectionButtonState = (familyId: string) => {
    const connection = connectionRequests.get(familyId);
    
    if (!connection) {
      return { text: 'Connect', disabled: false, style: 'bg-white text-gray-700 border border-gray-200 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200' };
    }
    
    switch (connection.status) {
      case 'accepted':
        return { text: 'Connected', disabled: true, style: 'bg-emerald-50 text-emerald-700 border border-emerald-200' };
      case 'pending':
        if (connection.isRequester) {
          return { text: 'Requested', disabled: false, style: 'bg-gray-100 text-gray-500 border border-gray-200' };
        } else {
          return { text: 'Accept', disabled: false, style: 'bg-white text-gray-700 border border-gray-200 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200' };
        }
      default:
        return { text: 'Connect', disabled: false, style: 'bg-white text-gray-700 border border-gray-200 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200' };
    }
  };

  const sendConnectionRequest = async (familyId: string) => {
    try {
      const session = getStoredSession();
      if (!session?.user) {
        toast('Please log in to send connection requests', 'error');
        return;
      }

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      const existingConnection = connectionRequests.get(familyId);

      // If already connected, do nothing
      if (existingConnection?.status === 'accepted') {
        toast('You are already connected with this family.', 'info');
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
        
        return;
      }

      // If there's a pending request where current user is receiver, don't allow sending back
      if (existingConnection?.status === 'pending' && !existingConnection.isRequester) {
        toast('This family has already sent you a connection request. Please check your connections page to accept it.', 'info');
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

        // Notify the receiver
        const senderName = profile?.name || 'A family';
        createNotification({
          userId: familyId,
          actorId: session.user.id,
          type: 'connection_request',
          title: `${senderName} wants to connect`,
          body: 'Tap to accept or decline',
          link: '/connections',
          referenceId: session.user.id,
          accessToken: session.access_token,
        });

        // Email the receiver
        try {
          const emailRes = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${familyId}&select=email`, {
            headers: { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}` },
          });
          if (emailRes.ok) {
            const [rec] = await emailRes.json();
            if (rec?.email) {
              fetch('/api/email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'connection_request', to: rec.email, fromName: senderName }),
              }).catch(() => {});
            }
          }
        } catch { /* silent — email is best-effort */ }
      }
      
    } catch (error) {
      console.error('Error with connection request:', error);
      if (error instanceof Error && error.message.includes('duplicate key value')) {
        toast('Connection request already sent to this family.', 'info');
      } else {
        toast('Failed to process connection request. Please try again.', 'error');
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
      } else if (response.status === 400) {
        // Table might not exist - circles feature not set up
        setUserCircles([]);
      }
    } catch (error) {
      console.error('Error loading user circles:', error);
    }
  };

  const inviteToCircle = async (circleId: string, memberId: string) => {
    // Circles feature not implemented yet
    return false;
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

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      const headers = {
        'apikey': supabaseKey!,
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      };

      // Check if a conversation already exists (either direction)
      let conversationId: string | null = null;
      const existingRes = await fetch(
        `${supabaseUrl}/rest/v1/conversations?or=(and(participant_1.eq.${user.id},participant_2.eq.${recipientId}),and(participant_1.eq.${recipientId},participant_2.eq.${user.id}))&select=id&limit=1`,
        { headers: { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}` } }
      );
      if (existingRes.ok) {
        const existing = await existingRes.json();
        if (existing && existing.length > 0) {
          conversationId = existing[0].id;
        }
      }

      // Create conversation only if none exists
      if (!conversationId) {
        const conversationRes = await fetch(`${supabaseUrl}/rest/v1/conversations`, {
          method: 'POST',
          headers: { ...headers, 'Prefer': 'return=representation' },
          body: JSON.stringify({
            participant_1: user.id,
            participant_2: recipientId,
            last_message_text: message,
            last_message_at: new Date().toISOString(),
            last_message_by: user.id,
          }),
        });

        if (!conversationRes.ok) {
          const errorText = await conversationRes.text();
          console.error('Failed to create conversation:', conversationRes.status, errorText);
          return false;
        }

        const [conversation] = await conversationRes.json();
        conversationId = conversation.id;
      } else {
        // Update last_message on existing conversation
        await fetch(
          `${supabaseUrl}/rest/v1/conversations?id=eq.${conversationId}`,
          {
            method: 'PATCH',
            headers: { ...headers, 'Prefer': 'return=minimal' },
            body: JSON.stringify({
              last_message_text: message,
              last_message_at: new Date().toISOString(),
              last_message_by: user.id,
            }),
          }
        );
      }

      // Send the message
      const messageRes = await fetch(`${supabaseUrl}/rest/v1/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          conversation_id: conversationId,
          sender_id: user.id,
          content: message,
        }),
      });

      if (!messageRes.ok) {
        const errorText = await messageRes.text();
        console.error('Failed to send message:', messageRes.status, errorText);
        return false;
      }

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
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white">
        <div className="max-w-md mx-auto px-4 pt-2">
          <div className="h-16 flex items-center">
            <div className="w-16 h-4 bg-gray-200 rounded-lg animate-pulse" />
          </div>
          <DiscoverPageSkeleton />
        </div>
      </div>
    );
  }

  return (
    <ProtectedRoute>
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white">
      <div className="max-w-md mx-auto px-4 pb-8 pt-2">
        <AppHeader />

        {/* Discoverability warning */}
        {locationMissing && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4">
            <p className="text-sm font-semibold text-amber-800 mb-0.5">You may not be showing up in Discover</p>
            <p className="text-xs text-amber-700 mb-2">
              Your location couldn't be verified, so other Haven members near you won't see your profile in their results.
            </p>
            <Link href="/profile" className="text-xs font-semibold text-amber-800 underline">
              Go to your profile and re-save your location to fix this
            </Link>
          </div>
        )}

        <>

        {/* Account type tab bar — always visible */}
        <div className="flex gap-1 mb-3 bg-white rounded-xl p-1 border border-gray-200">
          {([
            { value: 'all',      label: 'All' },
            { value: 'family',   label: 'Families' },
            { value: 'teacher',  label: 'Teachers' },
            { value: 'business', label: 'Businesses' },
          ] as const).map(tab => (
            <button
              key={tab.value}
              onClick={() => {
                setActiveTab(tab.value);
                setFamilyStatusFilter('all');
                setFamilyCustomFilter('');
                setApproachFilter('all');
                setTeacherTypeFilter('all');
                setTeacherTypeCustom('');
                setTeacherSubFilter('all');
                setTeacherSubCustom('');
                setBusinessTypeFilter('all');
                setBusinessCustomFilter('');
              }}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === tab.value
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Family status chips — shown when Families tab active */}
        {activeTab === 'family' && (
          <>
            <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1 scrollbar-hide">
              {([
                { value: 'all',         label: 'All' },
                { value: 'new',         label: 'Home Ed' },
                { value: 'considering', label: 'Community' },
                { value: 'other',       label: 'Other' },
              ] as const).map(chip => (
                <button
                  key={chip.value}
                  onClick={() => {
                    setFamilyStatusFilter(chip.value);
                    setFamilyCustomFilter('');
                    if (chip.value !== 'new') setApproachFilter('all');
                  }}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    familyStatusFilter === chip.value
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-white text-gray-500 border border-gray-200 hover:text-gray-700'
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </div>
            {/* Custom description input — shown when Other is selected */}
            {familyStatusFilter === 'other' && (
              <div className="mb-3">
                <input
                  type="text"
                  value={familyCustomFilter}
                  onChange={e => setFamilyCustomFilter(e.target.value)}
                  placeholder="Describe what you're looking for..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>
            )}
          </>
        )}

        {/* Education approach chips — only shown when Home Ed filter is active */}
        {activeTab === 'family' && familyStatusFilter === 'new' && (
          <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1 scrollbar-hide">
            {(['all', 'Classical', 'Charlotte Mason', 'Unschooling', 'Eclectic', 'Montessori', 'Waldorf/Steiner', 'Relaxed', 'Faith-based', 'Online/Virtual', 'Unit Study'] as const).map(approach => (
              <button
                key={approach}
                onClick={() => setApproachFilter(approach)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  approachFilter === approach
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-white text-gray-500 border border-gray-200 hover:text-gray-700'
                }`}
              >
                {approach === 'all' ? 'Any approach' : approach}
              </button>
            ))}
          </div>
        )}

        {/* Teacher type chips — shown when Teachers tab is active */}
        {activeTab === 'teacher' && (
          <>
            <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1 scrollbar-hide">
              {([
                { value: 'all',             label: 'All' },
                { value: 'extracurricular', label: 'Extracurricular' },
                { value: 'primary',         label: 'Primary School' },
                { value: 'high',            label: 'High School' },
                { value: 'other',           label: 'Other' },
              ] as const).map(chip => (
                <button
                  key={chip.value}
                  onClick={() => { setTeacherTypeFilter(chip.value); setTeacherTypeCustom(''); setTeacherSubFilter('all'); setTeacherSubCustom(''); }}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    teacherTypeFilter === chip.value
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-white text-gray-500 border border-gray-200 hover:text-gray-700'
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </div>
            {teacherTypeFilter === 'other' && (
              <div className="mb-3">
                <input type="text" value={teacherTypeCustom} onChange={e => setTeacherTypeCustom(e.target.value)}
                  placeholder="Describe what you're looking for..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent" />
              </div>
            )}

            {/* Extracurricular sub-filter */}
            {teacherTypeFilter === 'extracurricular' && (
              <>
                <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1 scrollbar-hide">
                  {(['all', 'Music', 'Sport', 'Arts', 'Other'] as const).map(sub => (
                    <button
                      key={sub}
                      onClick={() => { setTeacherSubFilter(sub); setTeacherSubCustom(''); }}
                      className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        teacherSubFilter === sub
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'bg-white text-gray-500 border border-gray-200 hover:text-gray-700'
                      }`}
                    >
                      {sub === 'all' ? 'All' : sub}
                    </button>
                  ))}
                </div>
                {teacherSubFilter === 'Other' && (
                  <div className="mb-3">
                    <input type="text" value={teacherSubCustom} onChange={e => setTeacherSubCustom(e.target.value)}
                      placeholder="Describe what you're looking for..."
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent" />
                  </div>
                )}
              </>
            )}

            {/* High School sub-filter */}
            {teacherTypeFilter === 'high' && (
              <>
                <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1 scrollbar-hide">
                  {(['all', 'Math', 'English', 'Other'] as const).map(sub => (
                    <button
                      key={sub}
                      onClick={() => { setTeacherSubFilter(sub); setTeacherSubCustom(''); }}
                      className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        teacherSubFilter === sub
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'bg-white text-gray-500 border border-gray-200 hover:text-gray-700'
                      }`}
                    >
                      {sub === 'all' ? 'All' : sub}
                    </button>
                  ))}
                </div>
                {teacherSubFilter === 'Other' && (
                  <div className="mb-3">
                    <input type="text" value={teacherSubCustom} onChange={e => setTeacherSubCustom(e.target.value)}
                      placeholder="Describe what you're looking for..."
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent" />
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* Business type chips — shown when Business tab is active */}
        {activeTab === 'business' && (
          <>
            <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1 scrollbar-hide">
              {([
                { value: 'all',       label: 'All' },
                { value: 'playspace', label: 'Play' },
                { value: 'learning',  label: 'Learning' },
                { value: 'resources', label: 'Resources' },
                { value: 'other',     label: 'Other' },
              ] as const).map(chip => (
                <button
                  key={chip.value}
                  onClick={() => { setBusinessTypeFilter(chip.value); setBusinessCustomFilter(''); }}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    businessTypeFilter === chip.value
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-white text-gray-500 border border-gray-200 hover:text-gray-700'
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </div>
            {businessTypeFilter === 'other' && (
              <div className="mb-3">
                <input type="text" value={businessCustomFilter} onChange={e => setBusinessCustomFilter(e.target.value)}
                  placeholder="Describe what you're looking for..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent" />
              </div>
            )}
          </>
        )}

        {/* Hidden families hint — always visible when families are hidden */}
        {hiddenFamilies.length > 0 && (
          <div className="flex items-center justify-between mb-3 px-1">
            <span className="text-xs text-gray-400">
              {hiddenFamilies.length} {hiddenFamilies.length === 1 ? 'family' : 'families'} hidden
            </span>
            <button
              onClick={() => setShowHiddenModal(true)}
              className="text-xs text-emerald-600 font-medium hover:text-emerald-700"
            >
              Manage hidden
            </button>
          </div>
        )}

        </>

        {/* More options collapsible */}
        <div className="mb-2">
          <button
            onClick={() => setShowMoreOptions(v => !v)}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-1 mb-1"
          >
            More options
            <svg className={`w-3 h-3 transition-transform ${showMoreOptions ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showMoreOptions && (
            <div className="mt-2 space-y-3 pl-1">
              {/* Search all of Haven — first */}
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search families, events, circles..."
                  className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  onKeyDown={e => {
                    if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                      window.location.href = `/search?q=${encodeURIComponent(e.currentTarget.value.trim())}`;
                    }
                  }}
                />
              </div>

              {/* Kids age range + Map view on same row */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 font-medium whitespace-nowrap">Kids ages</span>
                <input
                  type="number" min="0" max="17" value={ageRange.min}
                  onChange={(e) => { const v = parseInt(e.target.value) || 0; setAgeRange(prev => ({ ...prev, min: Math.max(0, Math.min(v, prev.max - 1)) })); }}
                  className="w-12 px-1 py-1 text-xs text-center border border-gray-200 rounded-lg focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                />
                <span className="text-gray-400 text-xs">–</span>
                <input
                  type="number" min="1" max="18" value={ageRange.max}
                  onChange={(e) => { const v = parseInt(e.target.value) || 18; setAgeRange(prev => ({ ...prev, max: Math.max(prev.min + 1, Math.min(v, 18)) })); }}
                  className="w-12 px-1 py-1 text-xs text-center border border-gray-200 rounded-lg focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                />
                <button
                  onClick={() => setViewMode(v => v === 'list' ? 'map' : 'list')}
                  className="ml-auto text-xs text-gray-500 hover:text-emerald-600 transition-colors font-medium whitespace-nowrap flex-shrink-0"
                >
                  {viewMode === 'list' ? 'Map view' : 'List view'}
                </button>
              </div>

              {/* Browse another location */}
              <BrowseLocation current={browseLocation} onChange={loc => setBrowseLocation(loc)} />
            </div>
          )}
        </div>

        {/* Content */}
        <div>

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
          <div className="space-y-2">
            {filteredFamilies.length === 0 ? (
              activeTab === 'teacher' ? (
                <div className="text-center py-12 px-6">
                  <div className="text-4xl mb-3">📚</div>
                  <p className="font-semibold text-gray-800 mb-1">No teachers nearby yet</p>
                  <p className="text-sm text-gray-500">Know a tutor or educator? Share Haven with them.</p>
                </div>
              ) : activeTab === 'business' ? (
                <div className="text-center py-12 px-6">
                  <div className="text-4xl mb-3">🏪</div>
                  <p className="font-semibold text-gray-800 mb-1">No businesses nearby yet</p>
                  <p className="text-sm text-gray-500">Homeschool-friendly businesses will appear here as Haven grows in your area.</p>
                </div>
              ) : (
                <div className="text-center py-12 px-6">
                  <div className="text-4xl mb-3">🌱</div>
                  <p className="font-semibold text-gray-800 mb-1">You're one of the first!</p>
                  <p className="text-sm text-gray-500">Haven is just getting started in your area. Invite a family you know to join — every community starts with one connection.</p>
                </div>
              )
            ) : (
              <>
                {/* New families near you banner — above first card */}
                {!dismissedBanner && (() => {
                  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
                  const userSuburb = profile?.location_name?.split(',')[0]?.trim().toLowerCase() || '';
                  const newNearby = families.filter(f => {
                    if (!f.created_at || f.created_at < sevenDaysAgo) return false;
                    if (!userSuburb) return false;
                    return (f.location_name || '').split(',')[0].trim().toLowerCase() === userSuburb;
                  });
                  if (newNearby.length === 0) return null;
                  return (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mb-3 flex items-center justify-between gap-3">
                      <p className="text-sm text-emerald-800 font-medium">
                        {newNearby.length === 1
                          ? `1 new family joined near ${profile?.location_name?.split(',')[0] || 'you'} this week`
                          : `${newNearby.length} new families joined near ${profile?.location_name?.split(',')[0] || 'you'} this week`}
                      </p>
                      <button onClick={() => { setDismissedBanner(true); sessionStorage.setItem('haven-nearby-banner-dismissed', 'true'); }} className="text-emerald-600 hover:text-emerald-800 text-lg flex-shrink-0 font-bold">×</button>
                    </div>
                  );
                })()}
                {filteredFamilies.map((family) => (
                <div
                  key={family.id}
                  className="w-full bg-white rounded-xl p-3 shadow-sm border border-gray-100 hover:shadow-md hover:border-gray-200 transition-all"
                >
                  {/* Top row: avatar + info */}
                  <div
                    className="flex items-start gap-3 cursor-pointer mb-2.5"
                    onClick={() => setSelectedFamilyDetails(family)}
                  >
                    <AvatarUpload
                      userId={family.id}
                      currentAvatarUrl={family.avatar_url}
                      name={family.family_name || family.display_name || 'Family'}
                      size="lg"
                      editable={false}
                    />
                    <div className="flex-1 min-w-0">
                      {/* Name + badges */}
                      <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                        <h3 className="font-semibold text-gray-900 text-sm leading-tight">
                          {family.display_name || family.family_name.split(' ')[0] || family.family_name}
                        </h3>
                        <AdminBadge adminLevel={family.admin_level || null} />
                        {family.is_verified && <span className="text-green-500 text-xs">✓</span>}
                        {family.user_type === 'teacher' && (
                          <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs font-semibold rounded">Teacher</span>
                        )}
                        {(family.user_type === 'business' || family.user_type === 'facility') && (
                          <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-xs font-semibold rounded">Business</span>
                        )}
                      </div>
                      {/* Location + online */}
                      <div className="flex items-center gap-1.5 mb-1">
                        <p className="text-xs text-gray-500 truncate">{family.location_name}</p>
                        {family.is_online && <div className="w-1.5 h-1.5 bg-green-500 rounded-full flex-shrink-0" />}
                        {!family.is_online && family.last_active && (
                          <span className="text-xs text-gray-400 flex-shrink-0">· {formatLastActive(family.last_active)}</span>
                        )}
                      </div>
                      {/* Kids ages */}
                      {(!family.user_type || family.user_type === 'family') && family.kids_ages && family.kids_ages.length > 0 && (
                        <div className="flex items-center gap-1 mb-1">
                          {family.kids_ages.map((age, index) => (
                            <div key={index} className="w-5 h-5 bg-emerald-100 rounded-full flex items-center justify-center">
                              <span className="text-xs font-medium text-emerald-700" style={{ fontSize: '10px' }}>{age}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Approach chips */}
                      {(!family.user_type || family.user_type === 'family') && family.homeschool_approaches && family.homeschool_approaches.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {family.homeschool_approaches.slice(0, 2).map((a, i) => (
                            <span key={i} className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 text-xs rounded-full border border-emerald-100">{a}</span>
                          ))}
                          {family.homeschool_approaches.length > 2 && (
                            <span className="text-xs text-gray-400">+{family.homeschool_approaches.length - 2}</span>
                          )}
                        </div>
                      )}
                      {/* Teacher subjects */}
                      {family.user_type === 'teacher' && (
                        <div className="flex flex-wrap gap-1">
                          {family.subjects && family.subjects.length > 0
                            ? family.subjects.slice(0, 3).map((s, i) => (
                                <span key={i} className="px-1.5 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full border border-blue-100">{s}</span>
                              ))
                            : <span className="text-xs text-gray-400">No subjects listed</span>
                          }
                          {family.subjects && family.subjects.length > 3 && (
                            <span className="text-xs text-gray-400">+{family.subjects.length - 3}</span>
                          )}
                        </div>
                      )}
                      {/* Business services */}
                      {(family.user_type === 'business' || family.user_type === 'facility') && (
                        <p className="text-xs text-gray-500 line-clamp-1">{family.services || 'No services listed'}</p>
                      )}
                    </div>
                  </div>

                  {/* Bottom row: actions */}
                  <div className="flex items-center gap-1.5 pt-2 border-t border-gray-50">
                    <button
                      onClick={() => sendConnectionRequest(family.id)}
                      disabled={getConnectionButtonState(family.id).disabled}
                      className={`flex-1 py-1 rounded-lg font-semibold transition-colors text-xs ${getConnectionButtonState(family.id).style}`}
                    >
                      {getConnectionButtonState(family.id).text}
                    </button>
                    <button
                      onClick={() => setSelectedFamily(family)}
                      className="flex-1 py-1 bg-white text-gray-600 border border-gray-200 rounded-lg font-semibold hover:bg-gray-50 transition-colors text-xs"
                    >
                      Message
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); hideSingleFamily(family.id); }}
                      className="px-2 py-1 text-gray-300 hover:text-red-400 transition-colors text-xs"
                    >
                      Hide
                    </button>
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
                viewable={true}
              />
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-gray-900">{selectedFamily.display_name || selectedFamily.family_name.split(' ')[0] || selectedFamily.family_name}</h3>
                  <AdminBadge adminLevel={selectedFamily.admin_level || null} />
                </div>
                <p className="text-sm text-gray-600">{selectedFamily.location_name}</p>
              </div>
            </div>
            
            <div className="mb-4">
              <textarea
                placeholder="Hi! I'd love to connect with your family..."
                className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 resize-none"
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
                      toast('Failed to send message. Please try again.', 'error');
                    }
                  }
                }}
                disabled={isSendingMessage}
                className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 disabled:bg-gray-300"
              >
                {isSendingMessage ? 'Sending...' : 'Send Message'}
              </button>
            </div>

            {/* Safety actions — subtle, not prominent */}
            <div className="flex justify-center gap-4 pt-1">
              <button
                onClick={() => setReportBlockTarget({ id: selectedFamily.id, name: selectedFamily.display_name || selectedFamily.family_name || 'this family', mode: 'block' })}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Block
              </button>
              <span className="text-gray-200 text-xs">·</span>
              <button
                onClick={() => setReportBlockTarget({ id: selectedFamily.id, name: selectedFamily.display_name || selectedFamily.family_name || 'this family', mode: 'report' })}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Report/Block modal */}
      {reportBlockTarget && (
        <ReportBlockModal
          targetId={reportBlockTarget.id}
          targetName={reportBlockTarget.name}
          mode={reportBlockTarget.mode}
          onClose={() => setReportBlockTarget(null)}
          onBlocked={() => {
            setFamilies(prev => prev.filter(f => f.id !== reportBlockTarget!.id));
            setSelectedFamily(null);
          }}
        />
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
                      toast('Failed to send circle invitation. They may already be invited or be a member.', 'error');
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
                className="flex-1 px-4 py-2 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-800 text-center"
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
                  viewable={true}
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
                  {getUserTypeBadge(selectedFamilyDetails.user_type) && (
                    <span className={`inline-block px-3 py-0.5 text-xs font-semibold rounded-full mb-2 ${getUserTypeBadge(selectedFamilyDetails.user_type)!.style}`}>
                      {getUserTypeBadge(selectedFamilyDetails.user_type)!.label}
                    </span>
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
                  <h4 className="font-semibold text-gray-900 mb-3">Children</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedFamilyDetails.kids_ages.map((age, index) => (
                      <div key={index} className="bg-emerald-50 border border-emerald-200 rounded-full px-3 py-2">
                        <span className="text-emerald-700 font-medium">{age} years old</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Homeschool approach */}
              {(!selectedFamilyDetails.user_type || selectedFamilyDetails.user_type === 'family') && selectedFamilyDetails.homeschool_approaches && selectedFamilyDetails.homeschool_approaches.length > 0 && (
                <div className="mb-6">
                  <h4 className="font-semibold text-gray-900 mb-3">Approach</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedFamilyDetails.homeschool_approaches.map((a, i) => (
                      <span key={i} className="px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-sm font-medium border border-emerald-200">{a}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* About Us */}
              {selectedFamilyDetails.bio && (
                <div className="mb-6">
                  <h4 className="font-semibold text-gray-900 mb-2">About Us</h4>
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

              {/* Teacher: Subjects + Age Groups */}
              {selectedFamilyDetails.user_type === 'teacher' && (
                <>
                  {selectedFamilyDetails.subjects && selectedFamilyDetails.subjects.length > 0 && (
                    <div className="mb-4">
                      <h4 className="font-semibold text-gray-900 mb-2">Subjects</h4>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedFamilyDetails.subjects.map((s, i) => (
                          <span key={i} className="px-2.5 py-1 bg-blue-100 text-blue-700 text-sm rounded-full">{s}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {selectedFamilyDetails.age_groups_taught && selectedFamilyDetails.age_groups_taught.length > 0 && (
                    <div className="mb-6">
                      <h4 className="font-semibold text-gray-900 mb-2">Age Groups</h4>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedFamilyDetails.age_groups_taught.map((ag, i) => (
                          <span key={i} className="px-2.5 py-1 bg-blue-50 text-blue-600 text-sm rounded-full border border-blue-200">{ag}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Business/Facility: Services + Contact */}
              {(selectedFamilyDetails.user_type === 'business' || selectedFamilyDetails.user_type === 'facility') && (
                <>
                  {selectedFamilyDetails.services && (
                    <div className="mb-4">
                      <h4 className="font-semibold text-gray-900 mb-2">Services</h4>
                      <p className="text-gray-700 text-sm leading-relaxed">{selectedFamilyDetails.services}</p>
                    </div>
                  )}
                  {selectedFamilyDetails.contact_info && (
                    <div className="mb-6">
                      <h4 className="font-semibold text-gray-900 mb-2">Contact</h4>
                      <p className="text-gray-700 text-sm">{selectedFamilyDetails.contact_info}</p>
                    </div>
                  )}
                </>
              )}

              {/* Action Buttons */}
              <div className="flex gap-2">
                <button
                  onClick={() => sendConnectionRequest(selectedFamilyDetails.id)}
                  disabled={getConnectionButtonState(selectedFamilyDetails.id).disabled}
                  className={`flex-1 px-2 py-2 rounded-xl font-semibold transition-colors text-sm ${getConnectionButtonState(selectedFamilyDetails.id).style}`}
                >
                  {getConnectionButtonState(selectedFamilyDetails.id).text}
                </button>
                <button
                  onClick={() => {
                    setSelectedFamily(selectedFamilyDetails);
                    setSelectedFamilyDetails(null);
                  }}
                  className="flex-1 px-2 py-2 bg-white text-gray-700 border border-gray-200 rounded-xl font-semibold hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 active:scale-[0.98] transition-all text-sm"
                >
                  Message
                </button>
                <button
                  onClick={() => {
                    window.location.href = `/profile?user=${selectedFamilyDetails.id}`;
                  }}
                  className="flex-1 px-2 py-2 bg-white text-gray-700 border border-gray-200 rounded-xl font-semibold hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 active:scale-[0.98] transition-all text-sm"
                >
                  Profile
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
                                {family.is_verified && <span className="ml-1 text-emerald-600 text-sm">✓</span>}
                              </h4>
                              <AdminBadge adminLevel={family.admin_level || null} />
                            </div>
                            <p className="text-sm text-gray-500">{family.location_name}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => unhideFamily(family.id)}
                          className="px-3 py-2 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 text-sm"
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
                    className="flex-1 px-4 py-2 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800"
                  >
                    Unhide All
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal removed - now using inline text input */}
      
      {/* Bottom spacing for mobile nav */}
      <div className="h-20"></div>
    </div>
    </div>
    </ProtectedRoute>
  );
}

export default function DiscoverPage() {
  return (
    <Suspense>
      <EnhancedDiscoverPage />
    </Suspense>
  );
}