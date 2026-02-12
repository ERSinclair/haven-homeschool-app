export type ProfileCompletionStep = 'complete' | 'about-you' | 'kids' | 'contact';

export interface ProfileData {
  id?: string;
  email?: string;
  family_name?: string;
  display_name?: string;
  username?: string;
  location_name?: string;
  status?: string[] | string;
  kids_ages?: number[];
  contact_methods?: string[];
  created_at?: string;
  updated_at?: string;
}

export const checkProfileCompletion = (profile: ProfileData | null): ProfileCompletionStep => {
  if (!profile) {
    return 'about-you'; // No profile at all
  }

  // Check Step 2: About you (family_name, username, location, status)
  const name = profile.family_name || profile.display_name;
  if (!name || !profile.username || !profile.location_name || !profile.status || 
      (Array.isArray(profile.status) && profile.status.length === 0)) {
    return 'about-you';
  }

  // Check Step 3: Kids (kids_ages)
  if (!profile.kids_ages || profile.kids_ages.length === 0) {
    return 'kids';
  }

  // Check Step 4: Contact methods
  if (!profile.contact_methods || profile.contact_methods.length === 0) {
    return 'contact';
  }

  return 'complete';
};

export const getResumeSignupUrl = (step: ProfileCompletionStep): string => {
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