export type ProfileCompletionStep = 'complete' | 'about-you' | 'kids' | 'contact';

export interface ProfileData {
  id?: string;
  email?: string;
  user_type?: string;
  family_name?: string;
  display_name?: string;
  username?: string;
  location_name?: string;
  status?: string[] | string;
  bio?: string;
  kids_ages?: number[];
  contact_methods?: string[];
  created_at?: string;
  updated_at?: string;
}

export const checkProfileCompletion = (profile: ProfileData | null): ProfileCompletionStep => {
  if (!profile) {
    return 'about-you'; // No profile at all
  }

  // Check basic profile data (name, username, location, status)
  const name = profile.family_name || profile.display_name;
  if (!name || !profile.username || !profile.location_name || !profile.status || 
      (Array.isArray(profile.status) && profile.status.length === 0)) {
    return 'about-you';
  }

  const userType = profile.user_type || 'family';

  // Family-specific validation
  if (userType === 'family') {
    // Families need kids_ages
    if (!profile.kids_ages || profile.kids_ages.length === 0) {
      return 'about-you'; // Send to main signup flow
    }
    // Families need bio (from "Tell us about your family" step)
    if (!profile.bio || !profile.bio.trim()) {
      return 'about-you'; // Send to main signup flow
    }
  }

  // Teacher-specific validation
  if (userType === 'teacher') {
    // Teachers need bio (from "About Me" step)
    if (!profile.bio || !profile.bio.trim()) {
      return 'about-you'; // Send to main signup flow
    }
    // Teachers don't need kids_ages (can be empty for "I Don't Have Kids")
  }

  // Business-specific validation
  if (userType === 'business') {
    // Businesses need bio (from "Tell us about your business" step)
    if (!profile.bio || !profile.bio.trim()) {
      return 'about-you'; // Send to main signup flow
    }
  }

  return 'complete';
};

export const getResumeSignupUrl = (step: ProfileCompletionStep, userType?: string): string => {
  // All user types now use the main signup flow (4 steps each)
  if (userType === 'family' || userType === 'teacher' || userType === 'business') {
    return '/signup'; // Will start from appropriate step based on existing data
  }
  
  // Legacy family resume flow (fallback only)
  switch (step) {
    case 'about-you':
      return '/signup/resume?step=2';
    case 'kids':
      return '/signup/resume?step=3';
    case 'contact':
      return '/signup/resume?step=4';
    default:
      return '/discover';
  }
};

export const getProfileCompletionMessage = (step: ProfileCompletionStep): string => {
  switch (step) {
    case 'about-you':
      return 'Complete your profile - Tell us about you';
    case 'kids':
      return 'Complete your profile - Add your kids\' ages';
    case 'contact':
      return 'Complete your profile - Choose how to connect';
    default:
      return 'Profile complete';
  }
};