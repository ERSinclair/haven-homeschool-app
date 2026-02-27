'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
// SimpleLocationPicker removed - using simple town/state inputs

const STORAGE_KEY = 'sb-ryvecaicjhzfsikfedkp-auth-token';

export default function SignupPage() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  // Step 1: Account
  const [userType, setUserType] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  // Removed email checking state variables
  const [showEmailConflict, setShowEmailConflict] = useState(false);
  
  // Step 2: About you
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [location, setLocation] = useState(', VIC'); // Default to VIC state
  const [locationData, setLocationData] = useState<{
    name: string;
    address: string;
    lat: number;
    lng: number;
  } | null>(null);
  const [status, setStatus] = useState<string[]>(['considering']);
  const [customDescriptions, setCustomDescriptions] = useState<string[]>([]);
  
  // Step 3: Additional fields
  const [bio, setBio] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [businessName, setBusinessName] = useState('');
  const [showBusinessName, setShowBusinessName] = useState(false);
  
  // Step 3: Kids
  const [children, setChildren] = useState<{ id: number; age: string }[]>([{ id: 1, age: '' }]);
  const [relationship, setRelationship] = useState<string[]>(['parent']);
  const [relationshipCustomDescriptions, setRelationshipCustomDescriptions] = useState<string[]>([]);
  
  // Step 4: Contact
  const [contactMethods, setContactMethods] = useState<string[]>(['app']);

  // Teacher-specific
  const [teacherSubjects, setTeacherSubjects] = useState<string[]>([]);
  const [teacherSubjectInput, setTeacherSubjectInput] = useState('');
  const [teacherAgeGroups, setTeacherAgeGroups] = useState<string[]>([]);

  // Business-specific
  const [businessContact, setBusinessContact] = useState('');
  // Playgroup-specific
  const [playgroupAges, setPlaygroupAges] = useState<string[]>([]);

  const [userId, setUserId] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ryvecaicjhzfsikfedkp.supabase.co';
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_HqXqQ5cjrg1CJIFIyL2QnA_WlwZ4AjB';

  // Reset status when userType changes to provide appropriate defaults
  useEffect(() => {
    if (userType === 'family') {
      setStatus(['considering']);
    } else if (userType === 'playgroup') {
      setStatus([]);
    } else if (userType === 'teacher') {
      setStatus(['math']);
    } else if (userType === 'business') {
      setStatus(['supplies']);
    }
    setCustomDescriptions([]);
  }, [userType]);

  // Load saved email on component mount
  useEffect(() => {
    // Only run on client side
    if (typeof window !== 'undefined') {
      const savedEmail = localStorage.getItem('haven-saved-email');
      if (savedEmail && savedEmail.includes('@')) {
        setEmail(savedEmail);
      }
    }
  }, []);

  // Check username availability
  const checkUsernameAvailability = useCallback(async (usernameToCheck: string) => {
    if (!usernameToCheck || usernameToCheck.length < 3) {
      setUsernameAvailable(null);
      return;
    }

    setCheckingUsername(true);
    try {
      const response = await fetch(
        `${supabaseUrl}/rest/v1/profiles?username=eq.${encodeURIComponent(usernameToCheck)}&select=id`,
        {
          headers: {
            'apikey': supabaseKey,
            'Content-Type': 'application/json',
          },
        }
      );

      const data = await response.json();
      
      // If column doesn't exist, treat all usernames as available for now
      if (data.code === "42703") {
        setUsernameAvailable(true);
        return;
      }
      
      setUsernameAvailable(Array.isArray(data) && data.length === 0);
    } catch (error) {
      console.error('Error checking username:', error);
      // Default to available if check fails
      setUsernameAvailable(true);
    } finally {
      setCheckingUsername(false);
    }
  }, [supabaseUrl, supabaseKey]);

  // Debounced username check
  useEffect(() => {
    if (!username || username.length < 3) {
      setUsernameAvailable(null);
      return;
    }

    const timer = setTimeout(() => {
      checkUsernameAvailability(username);
    }, 500);

    return () => clearTimeout(timer);
  }, [username, checkUsernameAvailability]);

  // Save email when it changes
  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newEmail = e.target.value;
    setEmail(newEmail);
    setShowEmailConflict(false); // Clear email conflict when user changes email
    
    // Save to localStorage when it looks like a valid email
    if (typeof window !== 'undefined' && newEmail.includes('@') && newEmail.includes('.')) {
      localStorage.setItem('haven-saved-email', newEmail);
    }
  };

  // Step 1: Simple validation only (no email checking to avoid temp account issues)
  const handleValidateCredentials = () => {
    // Simple validation for step 1
    setError('');
    setLoading(true);

    // Validate password match
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    // Validate password strength
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      setLoading(false);
      return;
    }

    // Save email for future login
    if (typeof window !== 'undefined' && email.includes('@') && email.includes('.')) {
      localStorage.setItem('haven-saved-email', email);
    }

    // Move to next step
    navigateToStep(2);
    setLoading(false);
  };

  // Final: Create account and save profile
  const handleSaveProfile = async () => {
    if (loading) {
      return; // Prevent duplicate saves
    }
    
    setError('');
    setLoading(true);

    try {
      if (!supabaseUrl || !supabaseKey) {
        throw new Error('Configuration error. Please try again.');
      }

      // Step 1: Create the user account (with retry for reliability)
      // Create account with Supabase
      
      let authRes: Response | null = null;
      let authData: any = null;
      let retryCount = 0;
      const maxRetries = 2;
      
      while (retryCount <= maxRetries) {
        try {
          authRes = await fetch(`${supabaseUrl}/auth/v1/signup`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': supabaseKey,
            },
            body: JSON.stringify({ email, password }),
          });

          authData = await authRes.json();
          break; // Success, exit retry loop
        } catch (fetchError) {
          // Retry failed, will try again
          retryCount++;
          if (retryCount > maxRetries) {
            throw fetchError;
          }
          // Wait 500ms before retry
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      if (!authRes || !authData) {
        throw new Error('Failed to create account. Please try again.');
      }

      // Handle account creation errors  
      if (!authRes.ok) {
        // Get the actual error message from Supabase
        const supabaseError = authData.error_description || 
                             authData.error?.message || 
                             authData.msg || 
                             authData.message ||
                             authData.error ||
                             'Account creation failed. Please try again.';
        
        // Only show email conflict dialog for very specific "user already exists" cases
        if (supabaseError.toLowerCase().includes('user already registered') || 
            authData.error_code === 'user_already_exists' ||
            authRes.status === 422) {
          setShowEmailConflict(true);
          setError('');
        } else {
          // For all other errors (rate limits, etc.), show the actual Supabase message
          setError(supabaseError);
        }
        
        setLoading(false);
        return;
      }

      if (!authData.user) {
        setError('Account creation failed. Please try again.');
        setLoading(false);
        return;
      }

      // Store session
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        access_token: authData.access_token,
        refresh_token: authData.refresh_token,
        expires_at: authData.expires_at,
        expires_in: authData.expires_in,
        token_type: authData.token_type,
        user: authData.user,
      }));

      // Step 2: Create the profile (INSERT since no auto-trigger)
      const profileData = {
        id: authData.user.id,  // Add user ID for INSERT
        user_type: userType, // family, playgroup, teacher, or business
        family_name: userType === 'business' && businessName.trim()
          ? businessName.trim()
          : userType === 'playgroup'
            ? firstName.trim()
            : `${firstName} ${lastName}`.trim(),
        display_name: userType === 'business' && businessName.trim()
          ? businessName.trim()
          : userType === 'playgroup'
            ? firstName.trim()
            : firstName,
        email,
        username,
        location_name: location.trim(),
        location_lat: null,
        location_lng: null,
        kids_ages: userType === 'family'
          ? children.map(c => parseInt(c.age)).filter(age => !isNaN(age) && age >= 0 && age <= 18)
          : userType === 'playgroup'
            // Store min age of each selected bracket e.g. '0-1' → 0, '1-2' → 1
            ? playgroupAges.map(a => parseInt(a)).filter(n => !isNaN(n))
            : userType === 'teacher' && relationship.includes('no-kids')
              ? []
              : userType === 'teacher'
                ? children.map(c => parseInt(c.age)).filter(age => !isNaN(age) && age >= 0 && age <= 18)
                : [],
        bio: userType === 'family'
          ? bio
          : userType === 'playgroup'
            ? bio
            : userType === 'teacher'
              ? (bio || (relationship.includes('no-kids') ? 'Teacher (no children)' : 'Teacher'))
              : userType === 'business'
                ? bio
                : children.map(c => c.age.trim()).filter(item => item).join(', '),
        status: userType === 'family'
          ? (status.includes('other') && customDescriptions.some(desc => desc.trim())
            ? customDescriptions.filter(desc => desc.trim()).join(', ')
            : (status.filter(s => s !== 'other').length > 0 ? status.filter(s => s !== 'other')[0] : 'considering'))
          : userType === 'playgroup'
            ? 'playgroup'
          : userType === 'teacher'
            ? (customDescriptions.some(desc => desc.trim())
              ? customDescriptions.filter(desc => desc.trim()).join(', ')
              : 'teacher')
            : (status.includes('other') && customDescriptions.some(desc => desc.trim())
              ? customDescriptions.filter(desc => desc.trim()).join(', ')
              : (status.filter(s => s !== 'other').length > 0 ? status.filter(s => s !== 'other')[0] : 'considering')),
        contact_methods: contactMethods,
        // Type-specific fields
        subjects: teacherSubjects.length > 0 ? teacherSubjects : null,
        age_groups_taught: teacherAgeGroups.length > 0 ? teacherAgeGroups : null,
        services: null, // businesses use bio for services during signup
        contact_info: businessContact.trim() || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const profileRes = await fetch(
        `${supabaseUrl}/rest/v1/profiles`,
        {
          method: 'POST',  // Changed from PATCH to POST (INSERT)
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${authData.access_token}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify(profileData),
        }
      );

      if (!profileRes.ok) {
        let errorMessage = 'Failed to save profile. Please try again.';
        try {
          const err = await profileRes.json();
          console.error('Profile creation error details:', err);
          console.error('Profile data sent:', profileData);
          console.error('Response status:', profileRes.status);
          
          if (err.message && typeof err.message === 'string') {
            errorMessage = `Profile error: ${err.message}`;
          } else if (err.details) {
            errorMessage = `Profile error: ${err.details}`;
          } else if (err.hint) {
            errorMessage = `Profile error: ${err.hint}`;
          } else {
            errorMessage = `Profile error (${profileRes.status}): ${JSON.stringify(err)}`;
          }
        } catch (parseErr) {
          console.error('Could not parse profile error response:', parseErr);
          errorMessage = `Profile creation failed with status ${profileRes.status}`;
        }
        setError(errorMessage);
        setLoading(false);
        return;
      }

      // Success! Clear any cached state and redirect to welcome/celebration screen
      if (typeof window !== 'undefined') {
        // Clear any form state from localStorage
        localStorage.removeItem('haven-signup-step');
        localStorage.removeItem('haven-signup-data');
        // Set a temporary flag to bypass profile completion check
        localStorage.setItem('haven-signup-complete', Date.now().toString());
      }
      
      // Send welcome email (best-effort, don't block redirect)
      fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'welcome', to: email, name: firstName || 'there' }),
      }).catch(() => {});

      // Force navigation to welcome screen
      window.location.href = '/welcome?fromSignup=true';
    } catch (err) {
      console.error('Signup error:', err);
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  const addChild = () => {
    const newId = Math.max(...children.map(c => c.id)) + 1;
    setChildren([...children, { id: newId, age: '' }]);
  };

  const removeChild = (id: number) => {
    if (children.length > 1) {
      setChildren(children.filter(c => c.id !== id));
    }
  };

  const updateChildAge = (id: number, age: string) => {
    // Only allow numbers 0-18
    if (age === '' || (/^\d+$/.test(age) && parseInt(age) >= 0 && parseInt(age) <= 18)) {
      setChildren(children.map(c => c.id === id ? { ...c, age } : c));
    }
  };

  const updateServiceDescription = (id: number, description: string) => {
    // Allow any text for business service descriptions
    setChildren(children.map(c => c.id === id ? { ...c, age: description } : c));
  };

  // Step validation functions
  const isStep1Valid = () => {
    return userType && email && password.length >= 6 && confirmPassword && password === confirmPassword;
  };

  const isStep2Valid = () => {
    if (userType === 'playgroup') {
      return firstName.trim() && username.trim() && usernameAvailable === true && location.split(',')[0]?.trim() && !checkingUsername;
    }
    return firstName.trim() && lastName.trim() && username.trim() && 
           usernameAvailable === true && location.split(',')[0]?.trim() && 
           status.length > 0 && !checkingUsername;
  };

  const isStep3Valid = () => {
    if (userType === 'family') {
      return children.every(c => c.age !== '' && parseInt(c.age) >= 0 && parseInt(c.age) <= 18);
    }
    if (userType === 'playgroup') {
      return true; // ages served are optional
    }
    if (userType === 'teacher') {
      // Valid if either "no kids" is selected OR all children have valid ages
      return relationship.includes('no-kids') || 
             children.every(c => c.age !== '' && parseInt(c.age) >= 0 && parseInt(c.age) <= 18);
    }
    if (userType === 'business') {
      return children.every(c => c.age.trim() !== '');
    }
    return true;
  };

  const isStep4Valid = () => {
    if (userType === 'family') {
      return bio.trim() !== '';
    }
    if (userType === 'playgroup') {
      return bio.trim() !== '';
    }
    if (userType === 'teacher') {
      return bio.trim() !== '' && customDescriptions.some(desc => desc.trim());
    }
    if (userType === 'business') {
      return bio.trim() !== '';
    }
    return true;
  };

  // Navigation function with validation
  const navigateToStep = (targetStep: number) => {
    // Can always go back
    if (targetStep < step) {
      setStep(targetStep);
      return;
    }

    // Check if we can advance to the target step
    if (targetStep === 2 && !isStep1Valid()) {
      setError('Please complete Step 1 before continuing');
      return;
    }
    if (targetStep === 3 && (!isStep1Valid() || !isStep2Valid())) {
      setError('Please complete previous steps before continuing');
      return;
    }
    if (targetStep === 4 && (!isStep1Valid() || !isStep2Valid() || !isStep3Valid())) {
      setError('Please complete previous steps before continuing');
      return;
    }

    // Clear any errors and navigate
    setError('');
    setStep(targetStep);
  };

  // Contact methods now default to in-app messaging only

  const getStepLabel = (stepNum: number) => {
    if (stepNum === 1) return 'Account';
    if (stepNum === 2) return 'About you';
    if (stepNum === 3) {
      if (userType === 'family') return 'Kids';
      if (userType === 'playgroup') return 'Ages';
      if (userType === 'teacher') return 'Kids';
      if (userType === 'business') return 'Services';
      return 'Finish';
    }
    if (stepNum === 4) {
      if (userType === 'family') return 'About Us';
      if (userType === 'playgroup') return 'About Us';
      if (userType === 'teacher') return 'Details';
      if (userType === 'business') return 'Details';
      return 'Finish';
    }
    return '';
  };

  const steps = [
    { num: 1, label: getStepLabel(1) },
    { num: 2, label: getStepLabel(2) },
    { num: 3, label: getStepLabel(3) },
    { num: 4, label: getStepLabel(4) },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white">
      <div className="max-w-md mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          {step === 1 ? (
            <Link href="/" className="text-emerald-600 hover:text-emerald-700 font-medium">← Back</Link>
          ) : (
            <button 
              onClick={() => {
                // Navigate to previous step
                setStep(step - 1);
              }} 
              className="text-emerald-600 hover:text-emerald-700 font-medium"
            >
              ← Back
            </button>
          )}
          <div className="flex items-center gap-2 pointer-events-none justify-center my-4">
            <span className="font-bold text-emerald-600 text-4xl" style={{ fontFamily: 'var(--font-fredoka)' }}>Haven</span>
          </div>
          <div className="w-12"></div>
        </div>

        {/* Welcome Banner removed */}

        {/* Progress */}
        <div className="mb-20 mt-8">
          <div className="flex items-center justify-between relative">
            <div className="absolute left-0 right-0 top-4 h-0.5 bg-gray-200">
              <div 
                className="h-full bg-emerald-600 transition-all duration-300"
                style={{ width: `${((step - 1) / 3) * 100}%` }}
              />
            </div>
            {steps.map((s) => {
              const canAccess = s.num === 1 || 
                                (s.num === 2 && isStep1Valid()) || 
                                (s.num === 3 && isStep1Valid() && isStep2Valid()) ||
                                (s.num === 4 && isStep1Valid() && isStep2Valid() && isStep3Valid());
              const isCompleted = step > s.num;
              const isCurrent = step === s.num;
              
              return (
                <div key={s.num} className="relative flex flex-col items-center">
                  <button
                    onClick={() => navigateToStep(s.num)}
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold z-10 transition-all ${
                      isCompleted 
                        ? 'bg-emerald-600 text-white hover:bg-emerald-700' 
                        : isCurrent
                          ? 'bg-emerald-600 text-white'
                          : canAccess
                            ? 'bg-gray-200 text-gray-700 hover:bg-gray-300 cursor-pointer'
                            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    }`}
                    disabled={!canAccess}
                  >
                    {isCompleted ? '✓' : s.num}
                  </button>
                  <span className={`text-xs mt-2 ${
                    isCurrent || isCompleted 
                      ? 'text-emerald-600 font-medium' 
                      : canAccess
                        ? 'text-gray-600'
                        : 'text-gray-400'
                  }`}>
                    {s.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              {error}
            </div>
          )}

          {showEmailConflict && (
            <div className="mb-4 p-4 bg-gradient-to-r from-orange-50 to-yellow-50 border border-orange-200 rounded-xl">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-2xl">📧</span>
                <h3 className="font-bold text-orange-900">This Email is Already Registered!</h3>
              </div>
              <p className="text-orange-800 text-sm mb-4 leading-relaxed">
                An account with <strong>{email}</strong> already exists in Haven. 
                You can either sign in with this email or use a different one for a new account.
              </p>
              <div className="space-y-2">
                <button 
                  onClick={() => {
                    setShowEmailConflict(false);
                    setStep(1);
                  }}
                  className="w-full py-3 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 font-semibold transition-colors flex items-center justify-center gap-2"
                >
                  <span>←</span>
                  Go back and use a different email
                </button>
                <Link 
                  href="/login"
                  className="block w-full py-3 text-emerald-600 rounded-lg text-sm text-center hover:text-emerald-700 font-semibold transition-colors"
                >
                  Sign in with {email}
                </Link>
              </div>
              <p className="text-xs text-orange-600 mt-3 text-center">
                Choose the option that works best for you
              </p>
            </div>
          )}

          {/* Step 1: Account */}
          {step === 1 && (
            <div>
              <div className="space-y-4">
                {/* User Type Selection */}
                <div>
                  <p className="text-sm font-medium text-gray-700 text-center mb-3">
                    {userType ? 'Joining as' : 'I am joining as a...'}
                  </p>
                  <div className="flex gap-2 mb-4 justify-center flex-wrap">
                    {(['family', 'playgroup', 'teacher', 'business'] as const).map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setUserType(type)}
                        className={`px-6 py-3 rounded-full text-sm font-bold whitespace-nowrap transition-all min-w-fit flex items-center justify-center ${
                          userType === type
                            ? 'bg-emerald-600 text-white shadow-md scale-105'
                            : !userType
                              ? 'bg-white text-gray-600 border-2 border-gray-300 hover:border-emerald-400 hover:text-emerald-700 hover:bg-emerald-50 shadow-sm'
                              : 'bg-white text-gray-400 border border-gray-200 hover:border-emerald-300 hover:text-emerald-600 hover:bg-emerald-50'
                        }`}
                      >
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={handleEmailChange}
                    className="w-full p-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                    placeholder="you@email.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full p-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                    placeholder="At least 6 characters"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className={`w-full p-3.5 border rounded-xl focus:ring-2 ${
                      confirmPassword && password !== confirmPassword 
                        ? 'border-red-300 focus:ring-red-500' 
                        : 'border-gray-200 focus:ring-emerald-500'
                    }`}
                    placeholder="Confirm your password"
                  />
                  {confirmPassword && password !== confirmPassword && (
                    <p className="text-sm text-red-600 mt-1">Passwords do not match</p>
                  )}
                </div>
                <button
                  onClick={handleValidateCredentials}
                  disabled={!isStep1Valid() || loading}
                  className="w-full py-3.5 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 disabled:bg-gray-200 disabled:text-gray-400"
                >
                  {loading ? 'Validating...' : 'Continue'}
                </button>
              </div>
            </div>
          )}

          {/* Step 2: About you - Family */}
          {step === 2 && userType === 'family' && (
            <div>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value.charAt(0).toUpperCase() + e.target.value.slice(1).toLowerCase())}
                      className="w-full p-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                      placeholder="first name"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value.charAt(0).toUpperCase() + e.target.value.slice(1).toLowerCase())}
                      className="w-full p-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                      placeholder="last name"
                    />
                  </div>
                </div>
                <div>
                  <div className="relative">
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => {
                        const value = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '');
                        setUsername(value);
                      }}
                      className={`w-full p-3.5 border rounded-xl focus:ring-2 pr-10 ${
                        usernameAvailable === false
                          ? 'border-red-300 focus:ring-red-500' 
                          : username && username.length >= 3 && usernameAvailable === true
                          ? 'border-green-300 focus:ring-green-500' 
                          : 'border-gray-200 focus:ring-emerald-500'
                      }`}
                      placeholder="Username"
                      minLength={3}
                      maxLength={20}
                    />
                    {checkingUsername && (
                      <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                        <div className="w-5 h-5 border-2 border-gray-300 border-t-emerald-600 rounded-full animate-spin"></div>
                      </div>
                    )}
                    {!checkingUsername && usernameAvailable === true && (
                      <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-green-600">
                        ✓
                      </div>
                    )}
                    {!checkingUsername && usernameAvailable === false && (
                      <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-red-600">
                        ✗
                      </div>
                    )}
                  </div>
                  {username && username.length < 3 && (
                    <p className="text-sm text-gray-500 mt-1">Username must be at least 3 characters</p>
                  )}
                  {checkingUsername && (
                    <div className="mt-2 p-2 bg-emerald-50 border border-emerald-200 rounded-lg">
                      <div className="text-sm font-medium text-emerald-900">Checking username availability...</div>
                    </div>
                  )}
                </div>
                <div>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={location.split(',')[0]?.trim() || ''}
                      onChange={(e) => {
                        const town = e.target.value.charAt(0).toUpperCase() + e.target.value.slice(1).toLowerCase();
                        const state = location.split(',')[1]?.trim() || 'VIC';
                        const newLocation = `${town}, ${state}`;
                        setLocation(newLocation);
                        // Auto-set locationData for form compatibility (town change)
                        setLocationData({
                          name: town,
                          address: newLocation,
                          lat: -38.3305,
                          lng: 144.3256,
                        });
                      }}
                      placeholder="Town/Suburb"
                      className="w-full p-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                    />
                    <select
                      value={location.split(',')[1]?.trim() || 'VIC'}
                      onChange={(e) => {
                        const town = location.split(',')[0]?.trim() || '';
                        const state = e.target.value;
                        const newLocation = `${town}, ${state}`;
                        setLocation(newLocation);
                        // Auto-set locationData for form compatibility (state change)
                        setLocationData({
                          name: town,
                          address: newLocation,
                          lat: -38.3305,
                          lng: 144.3256,
                        });
                      }}
                      className="w-full p-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="VIC">VIC</option>
                      <option value="NSW">NSW</option>
                      <option value="QLD">QLD</option>
                      <option value="WA">WA</option>
                      <option value="SA">SA</option>
                      <option value="TAS">TAS</option>
                      <option value="ACT">ACT</option>
                      <option value="NT">NT</option>
                    </select>
                  </div>
                  {location && location.includes(',') && location.split(',')[0].trim() && (
                    <div className="mt-2 p-2 bg-emerald-50 border border-emerald-200 rounded-lg">
                      <div className="text-sm font-medium text-emerald-900">{location}</div>
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">Why I'm here</label>
                  <div className="space-y-2">
                    {[
                      { value: 'considering', label: 'Community', icon: '' },
                      { value: 'new', label: 'Home Ed', icon: '' },
                      { value: 'experienced', label: 'Extracurricular', icon: '' },
                      { value: 'connecting', label: 'Just Checking It Out', icon: '' },
                      { value: 'other', label: 'Other', icon: '' }
                    ].map((opt) => (
                      <label 
                        key={opt.value}
                        className={`flex items-center p-3.5 rounded-xl border-2 cursor-pointer ${
                          status.includes(opt.value) 
                            ? 'border-emerald-600 bg-emerald-50' 
                            : 'border-gray-100'
                        }`}
                      >
                        <input 
                          type="checkbox" 
                          className="sr-only" 
                          checked={status.includes(opt.value)} 
                          onChange={() => {
                            if (status.includes(opt.value)) {
                              setStatus(status.filter(s => s !== opt.value));
                              if (opt.value === 'other') {
                                setCustomDescriptions([]);
                              }
                            } else {
                              setStatus([...status, opt.value]);
                              if (opt.value === 'other' && customDescriptions.length === 0) {
                                setCustomDescriptions(['']);
                              }
                            }
                          }} 
                        />
                        <span className="text-xl mr-3">{opt.icon}</span>
                        <span className={
                          status.includes(opt.value) 
                            ? 'text-emerald-700 font-medium'
                            : 'text-gray-700'
                        }>{opt.label}</span>
                      </label>
                    ))}
                    
                    {/* Custom description inputs when "Other" is selected */}
                    {status.includes('other') && (
                      <div className="ml-8 mt-2 space-y-2">
                        {customDescriptions.map((description, index) => (
                          <div key={index} className="flex items-center gap-2">
                            <input
                              type="text"
                              placeholder="Please describe..."
                              value={description}
                              onChange={(e) => {
                                const newDescriptions = [...customDescriptions];
                                newDescriptions[index] = e.target.value;
                                setCustomDescriptions(newDescriptions);
                              }}
                              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                if (customDescriptions.length === 1) {
                                  setStatus(status.filter(s => s !== 'other'));
                                  setCustomDescriptions([]);
                                } else {
                                  setCustomDescriptions(customDescriptions.filter((_, i) => i !== index));
                                }
                              }}
                              className="px-2 py-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded"
                              title="Remove"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => setCustomDescriptions([...customDescriptions, ''])}
                          className="text-emerald-600 hover:text-emerald-700 text-sm font-medium"
                        >
                          + Add another
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Debug section removed for production */}
                
                <div>
                  <button
                    onClick={() => setStep(3)}
                    disabled={!firstName.trim() || !lastName.trim() || !username.trim() || usernameAvailable === false || !location.split(',')[0]?.trim() || status.length === 0 || checkingUsername || (status.includes('other') && !customDescriptions.some(desc => desc.trim()))}
                    className="w-full py-3.5 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 disabled:bg-gray-200 disabled:text-gray-400"
                  >
                    Continue
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: About you - Playgroup */}
          {step === 2 && userType === 'playgroup' && (
            <div>
              <div className="space-y-4">
                <div>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full p-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                    placeholder="Group name (e.g. Little Explorers Playgroup)"
                  />
                </div>
                <div>
                  <div className="relative">
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => {
                        const value = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '');
                        setUsername(value);
                      }}
                      className={`w-full p-3.5 border rounded-xl focus:ring-2 pr-10 ${
                        usernameAvailable === false
                          ? 'border-red-300 focus:ring-red-500'
                          : username && username.length >= 3 && usernameAvailable === true
                          ? 'border-green-300 focus:ring-green-500'
                          : 'border-gray-200 focus:ring-emerald-500'
                      }`}
                      placeholder="Handle (e.g. littleexplorers)"
                      minLength={3}
                      maxLength={20}
                    />
                    {checkingUsername && (
                      <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                        <div className="w-5 h-5 border-2 border-gray-300 border-t-emerald-600 rounded-full animate-spin"></div>
                      </div>
                    )}
                    {!checkingUsername && usernameAvailable === true && (
                      <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-green-600">✓</div>
                    )}
                    {!checkingUsername && usernameAvailable === false && (
                      <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-red-600">✗</div>
                    )}
                  </div>
                  {username && username.length < 3 && (
                    <p className="text-sm text-gray-500 mt-1">Handle must be at least 3 characters</p>
                  )}
                </div>
                <div>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={location.split(',')[0]?.trim() || ''}
                      onChange={(e) => {
                        const town = e.target.value.charAt(0).toUpperCase() + e.target.value.slice(1).toLowerCase();
                        const state = location.split(',')[1]?.trim() || 'VIC';
                        setLocation(`${town}, ${state}`);
                        setLocationData({ name: town, address: `${town}, ${state}`, lat: -38.3305, lng: 144.3256 });
                      }}
                      placeholder="Town/Suburb"
                      className="w-full p-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                    />
                    <select
                      value={location.split(',')[1]?.trim() || 'VIC'}
                      onChange={(e) => {
                        const town = location.split(',')[0]?.trim() || '';
                        setLocation(`${town}, ${e.target.value}`);
                        setLocationData({ name: town, address: `${town}, ${e.target.value}`, lat: -38.3305, lng: 144.3256 });
                      }}
                      className="w-full p-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="VIC">VIC</option>
                      <option value="NSW">NSW</option>
                      <option value="QLD">QLD</option>
                      <option value="WA">WA</option>
                      <option value="SA">SA</option>
                      <option value="TAS">TAS</option>
                      <option value="ACT">ACT</option>
                      <option value="NT">NT</option>
                    </select>
                  </div>
                  {location && location.includes(',') && location.split(',')[0].trim() && (
                    <div className="mt-2 p-2 bg-emerald-50 border border-emerald-200 rounded-lg">
                      <div className="text-sm font-medium text-emerald-900">{location}</div>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setStep(3)}
                  disabled={!firstName.trim() || !username.trim() || usernameAvailable === false || !location.split(',')[0]?.trim() || checkingUsername}
                  className="w-full py-3.5 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 disabled:bg-gray-200 disabled:text-gray-400"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* Step 2: About you - Teacher */}
          {step === 2 && userType === 'teacher' && (
            <div>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <input
                      type="text"
                      placeholder="First name"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="w-full p-3 border border-gray-200 rounded-xl bg-white text-gray-900 placeholder-gray-400"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      placeholder="Last name"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="w-full p-3 border border-gray-200 rounded-xl bg-white text-gray-900 placeholder-gray-400"
                    />
                  </div>
                </div>
                
                <div>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Username"
                      value={username}
                      onChange={(e) => {
                        setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''));
                        setUsernameAvailable(null);
                        checkUsernameAvailability(e.target.value);
                      }}
                      className="w-full p-3 border border-gray-200 rounded-xl bg-white text-gray-900 placeholder-gray-400"
                    />
                    {checkingUsername && (
                      <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                        <div className="w-4 h-4 border border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
                      </div>
                    )}
                    {!checkingUsername && usernameAvailable === true && (
                      <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-emerald-600">
                        ✓
                      </div>
                    )}
                    {!checkingUsername && usernameAvailable === false && (
                      <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-red-600">
                        ✗
                      </div>
                    )}
                  </div>
                  {checkingUsername && (
                    <div className="mt-1 flex items-center gap-2">
                      <div className="text-sm font-medium text-emerald-900">Checking username availability...</div>
                    </div>
                  )}
                  {usernameAvailable === false && (
                    <p className="text-red-600 text-sm mt-1">Username is already taken</p>
                  )}
                </div>

                <div>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={location.split(',')[0]?.trim() || ''}
                      onChange={(e) => {
                        const town = e.target.value.charAt(0).toUpperCase() + e.target.value.slice(1).toLowerCase();
                        const state = location.split(',')[1]?.trim() || 'VIC';
                        const newLocation = `${town}, ${state}`;
                        setLocation(newLocation);
                        // Auto-set locationData for form compatibility (town change)
                        setLocationData({
                          name: town,
                          address: newLocation,
                          lat: -38.3305,
                          lng: 144.3256,
                        });
                      }}
                      placeholder="Town/Suburb"
                      className="w-full p-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                    />
                    <select
                      value={location.split(',')[1]?.trim() || 'VIC'}
                      onChange={(e) => {
                        const town = location.split(',')[0]?.trim() || '';
                        const state = e.target.value;
                        const newLocation = `${town}, ${state}`;
                        setLocation(newLocation);
                        // Auto-set locationData for form compatibility (state change)
                        setLocationData({
                          name: town,
                          address: newLocation,
                          lat: -38.3305,
                          lng: 144.3256,
                        });
                      }}
                      className="w-full p-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="VIC">VIC</option>
                      <option value="NSW">NSW</option>
                      <option value="QLD">QLD</option>
                      <option value="WA">WA</option>
                      <option value="SA">SA</option>
                      <option value="TAS">TAS</option>
                      <option value="ACT">ACT</option>
                      <option value="NT">NT</option>
                    </select>
                  </div>
                  {location && location.includes(',') && location.split(',')[0].trim() && (
                    <div className="mt-2 p-2 bg-emerald-50 border border-emerald-200 rounded-lg">
                      <div className="text-sm font-medium text-emerald-900">{location}</div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">Services offered</label>
                  <div className="space-y-2">
                    {[
                      { value: 'group-lessons', label: 'Group Lessons', icon: '' },
                      { value: 'tutoring', label: 'Tutoring', icon: '' },
                      { value: 'sport', label: 'Sport', icon: '' },
                      { value: 'music', label: 'Music', icon: '' },
                      { value: 'other', label: 'Other', icon: '' }
                    ].map((opt) => (
                      <label 
                        key={opt.value}
                        className={`flex items-center p-3.5 rounded-xl border-2 cursor-pointer ${
                          status.includes(opt.value) 
                            ? 'border-emerald-600 bg-emerald-50' 
                            : 'border-gray-100'
                        }`}
                      >
                        <input 
                          type="checkbox" 
                          className="sr-only" 
                          checked={status.includes(opt.value)} 
                          onChange={() => {
                            if (status.includes(opt.value)) {
                              setStatus(status.filter(s => s !== opt.value));
                              if (opt.value === 'other') {
                                setCustomDescriptions([]);
                              }
                            } else {
                              setStatus([...status, opt.value]);
                              if (opt.value === 'other' && customDescriptions.length === 0) {
                                setCustomDescriptions(['']);
                              }
                            }
                          }} 
                        />
                        <span className="text-xl mr-3">{opt.icon}</span>
                        <span className={
                          status.includes(opt.value) 
                            ? 'text-emerald-700 font-medium'
                            : 'text-gray-700'
                        }>{opt.label}</span>
                      </label>
                    ))}
                    
                    {/* Custom description inputs when "Other" is selected */}
                    {status.includes('other') && (
                      <div className="ml-8 mt-2 space-y-2">
                        {customDescriptions.map((description, index) => (
                          <div key={index} className="flex items-center gap-2">
                            <input
                              type="text"
                              placeholder="Please describe..."
                              value={description}
                              onChange={(e) => {
                                const newDescriptions = [...customDescriptions];
                                newDescriptions[index] = e.target.value;
                                setCustomDescriptions(newDescriptions);
                              }}
                              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                if (customDescriptions.length === 1) {
                                  setStatus(status.filter(s => s !== 'other'));
                                  setCustomDescriptions([]);
                                } else {
                                  setCustomDescriptions(customDescriptions.filter((_, i) => i !== index));
                                }
                              }}
                              className="px-2 py-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded"
                              title="Remove"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => setCustomDescriptions([...customDescriptions, ''])}
                          className="text-emerald-600 hover:text-emerald-700 text-sm font-medium"
                        >
                          + Add another
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                
                <div>
                  <button
                    onClick={() => setStep(3)}
                    disabled={!firstName.trim() || !lastName.trim() || !username.trim() || usernameAvailable === false || !location.split(',')[0]?.trim() || status.length === 0 || checkingUsername || (status.includes('other') && !customDescriptions.some(desc => desc.trim()))}
                    className="w-full py-3.5 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 disabled:bg-gray-200 disabled:text-gray-400"
                  >
                    Continue
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: About you - Business */}
          {step === 2 && userType === 'business' && (
            <div>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <input
                      type="text"
                      placeholder="First name"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="w-full p-3 border border-gray-200 rounded-xl bg-white text-gray-900 placeholder-gray-400"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      placeholder="Last name"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="w-full p-3 border border-gray-200 rounded-xl bg-white text-gray-900 placeholder-gray-400"
                    />
                  </div>
                </div>

                {/* Business Name Button */}
                <div>
                  <button
                    type="button"
                    onClick={() => setShowBusinessName(!showBusinessName)}
                    className={`w-full p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                      showBusinessName || businessName 
                        ? 'border-emerald-600 bg-emerald-50' 
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <span className={
                      showBusinessName || businessName 
                        ? 'text-emerald-700 font-medium'
                        : 'text-gray-700'
                    }>
                      Business Name (Optional)
                    </span>
                  </button>
                  
                  {/* Business Name Input */}
                  {showBusinessName && (
                    <div className="mt-2">
                      <input
                        type="text"
                        placeholder="Enter your business name..."
                        value={businessName}
                        onChange={(e) => setBusinessName(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white"
                        autoFocus
                      />
                    </div>
                  )}
                </div>
                
                <div>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Username"
                      value={username}
                      onChange={(e) => {
                        setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''));
                        setUsernameAvailable(null);
                        checkUsernameAvailability(e.target.value);
                      }}
                      className="w-full p-3 border border-gray-200 rounded-xl bg-white text-gray-900 placeholder-gray-400"
                    />
                    {checkingUsername && (
                      <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                        <div className="w-4 h-4 border border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
                      </div>
                    )}
                    {!checkingUsername && usernameAvailable === true && (
                      <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-emerald-600">
                        ✓
                      </div>
                    )}
                    {!checkingUsername && usernameAvailable === false && (
                      <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-red-600">
                        ✗
                      </div>
                    )}
                  </div>
                  {checkingUsername && (
                    <div className="mt-1 flex items-center gap-2">
                      <div className="text-sm font-medium text-emerald-900">Checking username availability...</div>
                    </div>
                  )}
                  {usernameAvailable === false && (
                    <p className="text-red-600 text-sm mt-1">Username is already taken</p>
                  )}
                </div>

                <div>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={location.split(',')[0]?.trim() || ''}
                      onChange={(e) => {
                        const town = e.target.value.charAt(0).toUpperCase() + e.target.value.slice(1).toLowerCase();
                        const state = location.split(',')[1]?.trim() || 'VIC';
                        const newLocation = `${town}, ${state}`;
                        setLocation(newLocation);
                        // Auto-set locationData for form compatibility (town change)
                        setLocationData({
                          name: town,
                          address: newLocation,
                          lat: -38.3305,
                          lng: 144.3256,
                        });
                      }}
                      placeholder="Town/Suburb"
                      className="w-full p-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                    />
                    <select
                      value={location.split(',')[1]?.trim() || 'VIC'}
                      onChange={(e) => {
                        const town = location.split(',')[0]?.trim() || '';
                        const state = e.target.value;
                        const newLocation = `${town}, ${state}`;
                        setLocation(newLocation);
                        // Auto-set locationData for form compatibility (state change)
                        setLocationData({
                          name: town,
                          address: newLocation,
                          lat: -38.3305,
                          lng: 144.3256,
                        });
                      }}
                      className="w-full p-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="VIC">VIC</option>
                      <option value="NSW">NSW</option>
                      <option value="QLD">QLD</option>
                      <option value="WA">WA</option>
                      <option value="SA">SA</option>
                      <option value="TAS">TAS</option>
                      <option value="ACT">ACT</option>
                      <option value="NT">NT</option>
                    </select>
                  </div>
                  {location && location.includes(',') && location.split(',')[0].trim() && (
                    <div className="mt-2 p-2 bg-emerald-50 border border-emerald-200 rounded-lg">
                      <div className="text-sm font-medium text-emerald-900">{location}</div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">What we offer</label>
                  <div className="space-y-2">
                    {[
                      { value: 'group-learning', label: 'Group Learning Space', icon: '' },
                      { value: 'play-space', label: 'Play Space', icon: '' },
                      { value: 'event-space', label: 'Event Space', icon: '' },
                      { value: 'resources', label: 'Resources', icon: '' },
                      { value: 'other', label: 'Other', icon: '' }
                    ].map((opt) => (
                      <label 
                        key={opt.value}
                        className={`flex items-center p-3.5 rounded-xl border-2 cursor-pointer ${
                          status.includes(opt.value) 
                            ? 'border-emerald-600 bg-emerald-50' 
                            : 'border-gray-100'
                        }`}
                      >
                        <input 
                          type="checkbox" 
                          className="sr-only" 
                          checked={status.includes(opt.value)} 
                          onChange={() => {
                            if (status.includes(opt.value)) {
                              setStatus(status.filter(s => s !== opt.value));
                              if (opt.value === 'other') {
                                setCustomDescriptions([]);
                              }
                            } else {
                              setStatus([...status, opt.value]);
                              if (opt.value === 'other' && customDescriptions.length === 0) {
                                setCustomDescriptions(['']);
                              }
                            }
                          }} 
                        />
                        <span className="text-xl mr-3">{opt.icon}</span>
                        <span className={
                          status.includes(opt.value) 
                            ? 'text-emerald-700 font-medium'
                            : 'text-gray-700'
                        }>{opt.label}</span>
                      </label>
                    ))}
                    
                    {/* Custom description inputs when "Other" is selected */}
                    {status.includes('other') && (
                      <div className="ml-8 mt-2 space-y-2">
                        {customDescriptions.map((description, index) => (
                          <div key={index} className="flex items-center gap-2">
                            <input
                              type="text"
                              placeholder="Please describe..."
                              value={description}
                              onChange={(e) => {
                                const newDescriptions = [...customDescriptions];
                                newDescriptions[index] = e.target.value;
                                setCustomDescriptions(newDescriptions);
                              }}
                              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                if (customDescriptions.length === 1) {
                                  setStatus(status.filter(s => s !== 'other'));
                                  setCustomDescriptions([]);
                                } else {
                                  setCustomDescriptions(customDescriptions.filter((_, i) => i !== index));
                                }
                              }}
                              className="px-2 py-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded"
                              title="Remove"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => setCustomDescriptions([...customDescriptions, ''])}
                          className="text-emerald-600 hover:text-emerald-700 text-sm font-medium"
                        >
                          + Add another
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                
                <div>
                  <button
                    onClick={() => setStep(3)}
                    disabled={!firstName.trim() || !lastName.trim() || !username.trim() || usernameAvailable === false || !location.split(',')[0]?.trim() || status.length === 0 || checkingUsername || (status.includes('other') && !customDescriptions.some(desc => desc.trim()))}
                    className="w-full py-3.5 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 disabled:bg-gray-200 disabled:text-gray-400"
                  >
                    Continue
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Kids (only for families) or Skip for teachers/businesses */}
          {step === 3 && userType === 'family' && (
            <div>
              {/* Relationship Selection */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-3">My relationship to the children</label>
                <div className="space-y-2">
                  {[
                    { value: 'parent', label: 'Parent', icon: '' },
                    { value: 'grandparent', label: 'Grandparent', icon: '' },
                    { value: 'caregiver', label: 'Caregiver', icon: '' },
                    { value: 'other', label: 'Other', icon: '' }
                  ].map((opt) => (
                    <label 
                      key={opt.value}
                      className={`flex items-center p-3.5 rounded-xl border-2 cursor-pointer ${
                        relationship.includes(opt.value) 
                          ? 'border-emerald-600 bg-emerald-50' 
                          : 'border-gray-100'
                      }`}
                    >
                      <input 
                        type="checkbox" 
                        className="sr-only" 
                        checked={relationship.includes(opt.value)} 
                        onChange={() => {
                          if (relationship.includes(opt.value)) {
                            setRelationship(relationship.filter(r => r !== opt.value));
                            if (opt.value === 'other') {
                              setRelationshipCustomDescriptions([]);
                            }
                          } else {
                            setRelationship([...relationship, opt.value]);
                            if (opt.value === 'other' && relationshipCustomDescriptions.length === 0) {
                              setRelationshipCustomDescriptions(['']);
                            }
                          }
                        }} 
                      />
                      <span className="text-xl mr-3">{opt.icon}</span>
                      <span className={
                        relationship.includes(opt.value) 
                          ? 'text-emerald-700 font-medium'
                          : 'text-gray-700'
                      }>{opt.label}</span>
                    </label>
                  ))}
                  
                  {/* Custom description inputs when "Other" is selected */}
                  {relationship.includes('other') && (
                    <div className="ml-8 mt-2 space-y-2">
                      {relationshipCustomDescriptions.map((description, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <input
                            type="text"
                            placeholder="Please describe..."
                            value={description}
                            onChange={(e) => {
                              const newDescriptions = [...relationshipCustomDescriptions];
                              newDescriptions[index] = e.target.value;
                              setRelationshipCustomDescriptions(newDescriptions);
                            }}
                            className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              if (relationshipCustomDescriptions.length === 1) {
                                setRelationship(relationship.filter(r => r !== 'other'));
                                setRelationshipCustomDescriptions([]);
                              } else {
                                setRelationshipCustomDescriptions(relationshipCustomDescriptions.filter((_, i) => i !== index));
                              }
                            }}
                            className="px-2 py-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded"
                            title="Remove"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => setRelationshipCustomDescriptions([...relationshipCustomDescriptions, ''])}
                        className="text-emerald-600 hover:text-emerald-700 text-sm font-medium"
                      >
                        + Add another
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4 mb-6">
                {children.map((child, index) => (
                  <div key={child.id} className="flex items-center gap-3">
                    <label className="text-gray-700 font-medium min-w-[70px]">
                      Child {index + 1}
                    </label>
                    <input
                      type="text"
                      value={child.age}
                      onChange={(e) => updateChildAge(child.id, e.target.value)}
                      className="w-28 p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                      placeholder="Age (0-18)"
                      maxLength={2}
                    />
                    {children.length > 1 && (
                      <button
                        onClick={() => removeChild(child.id)}
                        className="text-emerald-600 hover:text-emerald-700 font-medium px-2"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <button
                onClick={addChild}
                className="w-full py-3 text-emerald-600 rounded-xl font-medium hover:bg-emerald-50 transition-colors mb-6"
              >
                + Add Child
              </button>

              <div>
                <button
                  onClick={() => setStep(4)}
                  disabled={children.some(c => c.age === '')}
                  className="w-full py-3.5 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 disabled:bg-gray-200 disabled:text-gray-400"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Ages served - Playgroup */}
          {step === 3 && userType === 'playgroup' && (
            <div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">What ages does your group cater to? (optional)</label>
                  <div className="grid grid-cols-3 gap-2">
                    {['0–1', '1–2', '2–3', '3–4', '4–5', '5+'].map(age => (
                      <button
                        key={age}
                        type="button"
                        onClick={() => setPlaygroupAges(prev => prev.includes(age) ? prev.filter(a => a !== age) : [...prev, age])}
                        className={`py-3 rounded-xl text-sm font-semibold border-2 transition-all ${
                          playgroupAges.includes(age)
                            ? 'border-purple-600 bg-purple-50 text-purple-700'
                            : 'border-gray-200 text-gray-600 hover:border-purple-300'
                        }`}
                      >
                        {age} yrs
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  onClick={() => setStep(4)}
                  className="w-full py-3.5 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Family Bio - Families */}
          {step === 4 && userType === 'family' && (
            <div>
              <div className="space-y-6 mb-6">
                {/* Tell us about your family */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">Tell us about your family</label>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    className="w-full p-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white text-gray-700"
                    rows={6}
                    placeholder="Share what makes your family unique. Your interests, values, what you're looking for in a community, or anything else you'd like other families to know..."
                  />
                </div>
              </div>

              <div>
                              <div className="flex items-start gap-3 mb-4 p-3 bg-gray-50 rounded-xl border border-gray-100">
                <input
                  type="checkbox"
                  id="acceptTerms"
                  checked={acceptedTerms}
                  onChange={e => setAcceptedTerms(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 flex-shrink-0"
                />
                <label htmlFor="acceptTerms" className="text-xs text-gray-600 leading-relaxed cursor-pointer">
                  I agree to Haven&apos;s{' '}
                  <a href="/terms" target="_blank" className="text-emerald-600 underline hover:text-emerald-700">Terms of Service</a>
                  {' '}and{' '}
                  <a href="/privacy" target="_blank" className="text-emerald-600 underline hover:text-emerald-700">Privacy Policy</a>.
                  I confirm I am 18 or older.
                </label>
              </div>
              <button
                  onClick={handleSaveProfile}
                  disabled={loading || !bio.trim() || !acceptedTerms}
                  className="w-full py-3.5 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 disabled:bg-gray-200 disabled:text-gray-400"
                >
                  {loading ? 'Creating your account...' : 'Create Account & Finish'}
                </button>
              </div>
            </div>
          )}

          {/* Step 4: About your group - Playgroup */}
          {step === 4 && userType === 'playgroup' && (
            <div>
              <div className="space-y-6 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">Tell families about your playgroup</label>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    className="w-full p-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white text-gray-700"
                    rows={6}
                    placeholder="When do you meet, what do you do, how can families join? Any other details you'd like parents to know..."
                  />
                </div>
              </div>
              <div>
                              <div className="flex items-start gap-3 mb-4 p-3 bg-gray-50 rounded-xl border border-gray-100">
                <input
                  type="checkbox"
                  id="acceptTerms"
                  checked={acceptedTerms}
                  onChange={e => setAcceptedTerms(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 flex-shrink-0"
                />
                <label htmlFor="acceptTerms" className="text-xs text-gray-600 leading-relaxed cursor-pointer">
                  I agree to Haven&apos;s{' '}
                  <a href="/terms" target="_blank" className="text-emerald-600 underline hover:text-emerald-700">Terms of Service</a>
                  {' '}and{' '}
                  <a href="/privacy" target="_blank" className="text-emerald-600 underline hover:text-emerald-700">Privacy Policy</a>.
                  I confirm I am 18 or older.
                </label>
              </div>
              <button
                  onClick={handleSaveProfile}
                  disabled={loading || !bio.trim() || !acceptedTerms}
                  className="w-full py-3.5 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 disabled:bg-gray-200 disabled:text-gray-400"
                >
                  {loading ? 'Creating your account...' : 'Create Account & Finish'}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Kids - Teachers */}
          {step === 3 && userType === 'teacher' && (
            <div>
              {/* I Don't Have Kids Option */}
              <div className="mb-6">
                <label 
                  className={`flex items-center p-3.5 rounded-xl border-2 cursor-pointer ${
                    relationship.includes('no-kids') 
                      ? 'border-emerald-600 bg-emerald-50' 
                      : 'border-gray-100'
                  }`}
                >
                  <input 
                    type="checkbox" 
                    className="sr-only" 
                    checked={relationship.includes('no-kids')} 
                    onChange={() => {
                      if (relationship.includes('no-kids')) {
                        setRelationship(relationship.filter(r => r !== 'no-kids'));
                      } else {
                        setRelationship(['no-kids']);
                        // Clear children when no kids is selected
                        setChildren([{ id: 1, age: '' }]);
                      }
                    }} 
                  />
                  <span className={
                    relationship.includes('no-kids') 
                      ? 'text-emerald-700 font-medium'
                      : 'text-gray-700'
                  }>I Don't Have Kids</span>
                </label>
              </div>

              {!relationship.includes('no-kids') && (
                <>
                  <div className="space-y-4 mb-6">
                    {children.map((child, index) => (
                      <div key={child.id} className="flex items-center gap-3">
                        <label className="text-gray-700 font-medium min-w-[70px]">
                          Child {index + 1}
                        </label>
                        <input
                          type="text"
                          value={child.age}
                          onChange={(e) => updateChildAge(child.id, e.target.value)}
                          className="w-28 p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                          placeholder="Age (0-18)"
                          maxLength={2}
                        />
                        {children.length > 1 && (
                          <button
                            onClick={() => removeChild(child.id)}
                            className="text-emerald-600 hover:text-emerald-700 font-medium px-2"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={addChild}
                    className="w-full py-3 text-emerald-600 rounded-xl font-medium hover:bg-emerald-50 transition-colors mb-6"
                  >
                    + Add Child
                  </button>
                </>
              )}

              <div>
                <button
                  onClick={() => setStep(4)}
                  disabled={!relationship.includes('no-kids') && children.some(c => c.age === '')}
                  className="w-full py-3.5 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 disabled:bg-gray-200 disabled:text-gray-400"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Teaching Details - Teachers */}
          {step === 4 && userType === 'teacher' && (
            <div>
              <div className="space-y-6 mb-6">
                {/* About Me */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">About Me</label>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    className="w-full p-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white text-gray-700"
                    rows={4}
                    placeholder="Tell families about yourself, your background, and teaching philosophy..."
                  />
                </div>

                {/* Subjects */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Subjects you teach</label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {teacherSubjects.map((s, i) => (
                      <span key={i} className="flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
                        {s}
                        <button onClick={() => setTeacherSubjects(prev => prev.filter((_, idx) => idx !== i))} className="text-blue-500 hover:text-blue-700">×</button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={teacherSubjectInput}
                      onChange={e => setTeacherSubjectInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && teacherSubjectInput.trim()) {
                          e.preventDefault();
                          setTeacherSubjects(prev => [...prev, teacherSubjectInput.trim()]);
                          setTeacherSubjectInput('');
                        }
                      }}
                      placeholder="e.g. Maths, Science… press Enter"
                      className="flex-1 p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 bg-white text-gray-700"
                    />
                    <button
                      type="button"
                      onClick={() => { if (teacherSubjectInput.trim()) { setTeacherSubjects(prev => [...prev, teacherSubjectInput.trim()]); setTeacherSubjectInput(''); } }}
                      className="px-4 py-2 bg-blue-100 text-blue-700 rounded-xl text-sm font-medium"
                    >Add</button>
                  </div>
                </div>

                {/* Age groups */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Age groups you teach</label>
                  <div className="grid grid-cols-3 gap-2">
                    {['0–4', '5–7', '8–10', '11–13', '14–16', '17–18'].map(ag => (
                      <button
                        key={ag}
                        type="button"
                        onClick={() => setTeacherAgeGroups(prev => prev.includes(ag) ? prev.filter(x => x !== ag) : [...prev, ag])}
                        className={`py-2 rounded-xl text-sm font-medium border-2 transition-colors ${
                          teacherAgeGroups.includes(ag)
                            ? 'bg-blue-100 border-blue-400 text-blue-700'
                            : 'bg-white border-gray-200 text-gray-600 hover:border-blue-300'
                        }`}
                      >{ag}</button>
                    ))}
                  </div>
                </div>

                {/* What I Have To Offer */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">What I have to offer</label>
                  <textarea
                    value={customDescriptions.filter(desc => desc.trim()).join('\n\n')}
                    onChange={(e) => {
                      const lines = e.target.value.split('\n\n').filter(line => line.trim());
                      setCustomDescriptions(lines.length > 0 ? lines : ['']);
                    }}
                    className="w-full p-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white text-gray-700"
                    rows={4}
                    placeholder="Qualifications, experience, teaching style, what makes you unique…"
                  />
                </div>
              </div>

              <div>
                              <div className="flex items-start gap-3 mb-4 p-3 bg-gray-50 rounded-xl border border-gray-100">
                <input
                  type="checkbox"
                  id="acceptTerms"
                  checked={acceptedTerms}
                  onChange={e => setAcceptedTerms(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 flex-shrink-0"
                />
                <label htmlFor="acceptTerms" className="text-xs text-gray-600 leading-relaxed cursor-pointer">
                  I agree to Haven&apos;s{' '}
                  <a href="/terms" target="_blank" className="text-emerald-600 underline hover:text-emerald-700">Terms of Service</a>
                  {' '}and{' '}
                  <a href="/privacy" target="_blank" className="text-emerald-600 underline hover:text-emerald-700">Privacy Policy</a>.
                  I confirm I am 18 or older.
                </label>
              </div>
              <button
                  onClick={handleSaveProfile}
                  disabled={loading || !bio.trim() || !customDescriptions.some(desc => desc.trim()) || !acceptedTerms}
                  className="w-full py-3.5 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 disabled:bg-gray-200 disabled:text-gray-400"
                >
                  {loading ? 'Creating your account...' : 'Create Account & Finish'}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Business Details - Businesses */}
          {step === 3 && userType === 'business' && (
            <div>
              <div className="space-y-4 mb-6">
                {children.map((child, index) => (
                  <div key={child.id} className="flex items-center gap-3">
                    <input
                      type="text"
                      value={child.age}
                      onChange={(e) => updateServiceDescription(child.id, e.target.value)}
                      className="flex-1 min-w-0 p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                      placeholder={`Service or product ${index + 1}`}
                    />
                    {children.length > 1 && (
                      <button
                        onClick={() => removeChild(child.id)}
                        className="text-red-400 hover:text-red-600 p-2 flex-shrink-0"
                        type="button"
                        title="Remove"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
                
                <button
                  onClick={addChild}
                  className="flex items-center gap-2 text-emerald-600 hover:text-emerald-700 font-medium"
                  type="button"
                >
                  <span className="text-xl">+</span>
                  Add another service/product
                </button>
              </div>

              <div>
                <button
                  onClick={() => setStep(4)}
                  disabled={children.some(c => !c.age.trim())}
                  className="w-full py-3.5 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 disabled:bg-gray-200 disabled:text-gray-400"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Business Details - Businesses */}
          {step === 4 && userType === 'business' && (
            <div>
              <div className="space-y-6 mb-6">
                {/* Tell us about your business */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">Tell us about your business</label>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    className="w-full p-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white text-gray-700"
                    rows={5}
                    placeholder="What you offer, who you serve, what makes you unique for homeschool families…"
                  />
                </div>

                {/* Contact info */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Contact info</label>
                  <input
                    value={businessContact}
                    onChange={e => setBusinessContact(e.target.value)}
                    placeholder="Website, phone, email…"
                    className="w-full p-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white text-gray-700"
                  />
                  <p className="text-xs text-gray-500 mt-1">Optional — you can add this later in your profile</p>
                </div>
              </div>

              <div>
                              <div className="flex items-start gap-3 mb-4 p-3 bg-gray-50 rounded-xl border border-gray-100">
                <input
                  type="checkbox"
                  id="acceptTerms"
                  checked={acceptedTerms}
                  onChange={e => setAcceptedTerms(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 flex-shrink-0"
                />
                <label htmlFor="acceptTerms" className="text-xs text-gray-600 leading-relaxed cursor-pointer">
                  I agree to Haven&apos;s{' '}
                  <a href="/terms" target="_blank" className="text-emerald-600 underline hover:text-emerald-700">Terms of Service</a>
                  {' '}and{' '}
                  <a href="/privacy" target="_blank" className="text-emerald-600 underline hover:text-emerald-700">Privacy Policy</a>.
                  I confirm I am 18 or older.
                </label>
              </div>
              <button
                  onClick={handleSaveProfile}
                  disabled={loading || !bio.trim() || !acceptedTerms}
                  className="w-full py-3.5 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 disabled:bg-gray-200 disabled:text-gray-400"
                >
                  {loading ? 'Creating your account...' : 'Create Account & Finish'}
                </button>
              </div>
            </div>
          )}

          {/* Step 4 removed - default to in-app messaging only */}
        </div>

        {/* Footer - Existing User Call to Action */}
        {step === 1 && (
          <div className="p-4 mt-6 text-center">
            <p className="text-gray-600 font-medium mb-6">Already have an account?</p>
            <Link 
              href="/login" 
              className="inline-block text-emerald-600 px-6 py-2 rounded-lg font-medium hover:text-emerald-700 transition-colors"
            >
              Sign In
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
