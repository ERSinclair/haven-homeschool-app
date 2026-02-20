'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredSession } from '@/lib/session';
import Link from 'next/link';
import HavenHeader from '@/components/HavenHeader';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export default function WelcomePage() {
  const fetchProfileData = async (userId: string, accessToken: string) => {
    try {
      const response = await fetch(
        `${supabaseUrl}/rest/v1/profiles?id=eq.${userId}&select=family_name,display_name,location_name,bio,user_type`,
        {
          headers: {
            'apikey': supabaseKey!,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );
      const profiles = await response.json();
      if (profiles && profiles.length > 0) {
        setProfileData(profiles[0]);
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    }
  };
  const [userData, setUserData] = useState<any>(null);
  const [profileData, setProfileData] = useState<any>(null);
  const [step, setStep] = useState(0);
  const [isFromSignup, setIsFromSignup] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const session = getStoredSession();
    if (session?.user) {
      setUserData(session.user);
      // Fetch profile data separately
      fetchProfileData(session.user.id, session.access_token);
    } else {
      router.push('/signup');
      return;
    }

    // Check if coming from signup for celebration mode
    const fromSignup = new URLSearchParams(window.location.search).get('fromSignup') === 'true';
    setIsFromSignup(fromSignup);

    // Animate in steps
    const timers = [
      setTimeout(() => setStep(1), 300),
      setTimeout(() => setStep(2), 800),
      setTimeout(() => setStep(3), 1300),
    ];
    return () => timers.forEach(clearTimeout);
  }, [router]);

  if (!userData) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white">
      <style jsx>{`
        @keyframes fall {
          0% { transform: translateY(-10px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(360deg); opacity: 0; }
        }
        .fall { animation: fall 4s linear infinite; }
      `}</style>

      {/* Falling confetti balls - only for celebration mode */}
      {isFromSignup && (
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              className="absolute w-3 h-3 rounded-full fall opacity-80"
              style={{
                backgroundColor: ['#10b981', '#06b6d4', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6', '#3b82f6', '#f97316', '#84cc16'][i % 10],
                left: `${2 + i * 4.8}%`,
                animationDelay: `${i * 0.2}s`,
                animationDuration: `${3 + (i % 4)}s`
              }}
            />
          ))}
        </div>
      )}

      <div className="max-w-md mx-auto px-4 py-8">
        {/* Haven header — same position as other pages */}
        <HavenHeader />

        {/* Welcome Message — sits where the top button row sits on other pages */}
        <div className={`transition-all duration-500 text-center mb-6 ${step >= 1 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          {isFromSignup && (
            <div className="w-14 h-14 bg-emerald-600 rounded-full mx-auto mb-4"></div>
          )}
          <h1 className="text-3xl font-bold text-emerald-700 mb-2" style={{ fontFamily: 'var(--font-fredoka)' }}>
            {isFromSignup 
              ? <>Welcome to Haven{profileData?.family_name || profileData?.display_name ? `, ${profileData.family_name || profileData.display_name}` : ''}!</>
              : <>Welcome back{profileData?.family_name || profileData?.display_name ? `, ${profileData.family_name || profileData.display_name}` : ''}!</>
            }
          </h1>
          <p className="text-emerald-600 text-base">
            {isFromSignup 
              ? profileData?.user_type === 'family' 
                ? "Your family community awaits"
                : profileData?.user_type === 'teacher'
                  ? "Ready to connect with homeschool families"
                  : "Welcome to the homeschool community"
              : profileData?.user_type === 'family'
                ? "Good to see you back"
                : profileData?.user_type === 'teacher'
                  ? "Connect with homeschool families"
                  : "Connect with the homeschool community"
            }
          </p>
        </div>

        {/* Stats Preview */}
        <div className={`bg-white rounded-2xl p-5 mb-6 transition-all duration-500 shadow-sm border border-emerald-100 ${step >= 2 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <p className="text-emerald-500 text-xs font-medium uppercase tracking-wide mb-4 text-center">
            Near {profileData?.location_name || 'your area'}
          </p>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-emerald-50 rounded-xl py-3 px-2 text-center">
              <p className="text-2xl font-bold text-emerald-600">12</p>
              <p className="text-xs text-emerald-500 mt-0.5">Families</p>
            </div>
            <div className="bg-emerald-50 rounded-xl py-3 px-2 text-center">
              <p className="text-2xl font-bold text-emerald-600">8</p>
              <p className="text-xs text-emerald-500 mt-0.5">
                {profileData?.user_type === 'teacher' ? 'Seeking help' : 
                 profileData?.user_type === 'business' ? 'Potential clients' : 'Similar ages'}
              </p>
            </div>
            <div className="bg-emerald-50 rounded-xl py-3 px-2 text-center">
              <p className="text-2xl font-bold text-emerald-600">3</p>
              <p className="text-xs text-emerald-500 mt-0.5">Events</p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className={`transition-all duration-500 space-y-3 ${step >= 3 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          {isFromSignup ? (
            <>
              {profileData?.user_type === 'family' && (
                <>
                  {!profileData?.bio && (
                    <Link
                      href="/profile?edit=true&focus=bio"
                      className="block w-full bg-white text-emerald-600 border-2 border-emerald-200 text-base font-medium py-3 px-8 rounded-xl hover:border-emerald-400 hover:bg-emerald-50 active:scale-[0.98] transition-all text-center"
                    >
                      Write a Family Bio
                    </Link>
                  )}
                  <Link
                    href="/discover"
                    className="block w-full bg-emerald-600 text-white text-base font-semibold py-3 px-8 rounded-xl hover:bg-emerald-700 active:scale-[0.98] transition-all shadow-sm text-center"
                    onClick={() => {
                      if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('fromSignup') === 'true') {
                        localStorage.setItem('haven-signup-complete', Date.now().toString());
                      }
                    }}
                  >
                    Find Families Near Me
                  </Link>
                </>
              )}
              {profileData?.user_type === 'teacher' && (
                <>
                  <Link
                    href="/discover"
                    className="block w-full bg-emerald-600 text-white text-base font-semibold py-3 px-8 rounded-xl hover:bg-emerald-700 active:scale-[0.98] transition-all shadow-sm text-center"
                    onClick={() => {
                      if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('fromSignup') === 'true') {
                        localStorage.setItem('haven-signup-complete', Date.now().toString());
                      }
                    }}
                  >
                    Find Families to Help
                  </Link>
                  <Link
                    href="/profile"
                    className="block w-full bg-white text-emerald-600 border-2 border-emerald-200 text-base font-medium py-3 px-8 rounded-xl hover:border-emerald-400 hover:bg-emerald-50 active:scale-[0.98] transition-all text-center"
                  >
                    View My Profile
                  </Link>
                </>
              )}
              {profileData?.user_type === 'business' && (
                <>
                  <Link
                    href="/discover"
                    className="block w-full bg-emerald-600 text-white text-base font-semibold py-3 px-8 rounded-xl hover:bg-emerald-700 active:scale-[0.98] transition-all shadow-sm text-center"
                    onClick={() => {
                      if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('fromSignup') === 'true') {
                        localStorage.setItem('haven-signup-complete', Date.now().toString());
                      }
                    }}
                  >
                    Connect with Families
                  </Link>
                  <Link
                    href="/profile"
                    className="block w-full bg-white text-emerald-600 border-2 border-emerald-200 text-base font-medium py-3 px-8 rounded-xl hover:border-emerald-400 hover:bg-emerald-50 active:scale-[0.98] transition-all text-center"
                  >
                    View My Profile
                  </Link>
                </>
              )}
            </>
          ) : (
            <>
              {profileData?.user_type === 'family' && !profileData?.bio && (
                <Link
                  href="/profile?edit=true&focus=bio"
                  className="block w-full bg-white text-emerald-600 border-2 border-emerald-200 text-base font-medium py-3 px-8 rounded-xl hover:border-emerald-400 hover:bg-emerald-50 active:scale-[0.98] transition-all text-center"
                >
                  Complete Your Bio
                </Link>
              )}
              <Link
                href="/discover"
                className="block w-full bg-emerald-600 text-white text-base font-semibold py-3 px-8 rounded-xl hover:bg-emerald-700 active:scale-[0.98] transition-all shadow-sm text-center"
              >
                Explore Families
              </Link>
            </>
          )}
        </div>

      </div>
    </div>
  );
}
