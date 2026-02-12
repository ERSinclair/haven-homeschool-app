'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredSession } from '@/lib/session';
import Link from 'next/link';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export default function WelcomePage() {
  const fetchProfileData = async (userId: string, accessToken: string) => {
    try {
      const response = await fetch(
        `${supabaseUrl}/rest/v1/profiles?id=eq.${userId}&select=family_name,display_name,location_name`,
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
  const [isRedirecting, setIsRedirecting] = useState(false);
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

    // Don't auto-redirect - let users see welcome every time they complete signup
    // (Only redirect from direct URL access, not from signup completion)

    // Animate in steps
    const timers = [
      setTimeout(() => setStep(1), 300),
      setTimeout(() => setStep(2), 800),
      setTimeout(() => setStep(3), 1300),
    ];
    return () => timers.forEach(clearTimeout);
  }, [router]);

  if (!userData || isRedirecting) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white flex flex-col items-center justify-center px-4 py-12">
      {/* Close Button - Top Left */}
      <Link 
        href="/dashboard" 
        className="fixed top-6 left-6 text-emerald-600 hover:text-emerald-700 text-2xl transition-colors z-10"
        aria-label="Close welcome screen"
      >
        ×
      </Link>
      
      <style jsx>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-20px) rotate(10deg); }
        }
        @keyframes spiral {
          0% { transform: translate(0px, 0px) rotate(0deg); }
          25% { transform: translate(15px, -10px) rotate(90deg); }
          50% { transform: translate(0px, -20px) rotate(180deg); }
          75% { transform: translate(-15px, -10px) rotate(270deg); }
          100% { transform: translate(0px, 0px) rotate(360deg); }
        }
        @keyframes fall {
          0% { transform: translateY(-10px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100px) rotate(360deg); opacity: 0; }
        }
        .float { animation: float 2s ease-in-out infinite; }
        .spiral { animation: spiral 3s ease-in-out infinite; }
        .fall { animation: fall 4s linear infinite; }
      `}</style>
      {/* Falling confetti */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        {[...Array(15)].map((_, i) => (
          <div
            key={i}
            className="absolute w-2 h-2 rounded-full fall opacity-60"
            style={{
              backgroundColor: ['#10b981', '#06b6d4', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6', '#3b82f6'][i % 8],
              left: `${5 + i * 6}%`,
              animationDelay: `${i * 0.3}s`,
              animationDuration: `${3 + (i % 3)}s`
            }}
          />
        ))}
      </div>
      
      <div className="max-w-md w-full text-center">
        {/* Celebration Animation */}
        <div className={`transition-all duration-500 ${step >= 1 ? 'opacity-100 scale-100' : 'opacity-0 scale-50'}`}>
          <div className="relative mx-auto mb-6 flex items-center justify-center">
            {/* Large celebration emoji */}
            <span className="text-8xl">🎉</span>
          </div>
        </div>

        {/* Welcome Message */}
        <div className={`transition-all duration-500 delay-100 ${step >= 1 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <h1 className="text-3xl sm:text-4xl font-bold text-emerald-600 mb-3" style={{ fontFamily: 'var(--font-fredoka)' }}>
            Welcome{profileData?.family_name || profileData?.display_name ? `, ${profileData.family_name || profileData.display_name}` : ''}!
          </h1>
          <p className="text-emerald-700 text-lg mb-8">
            You're all set up and ready to connect.
          </p>
        </div>

        {/* Stats Preview */}
        <div className={`bg-white/80 backdrop-blur rounded-2xl p-6 mb-8 transition-all duration-500 shadow-sm ${step >= 2 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <p className="text-emerald-700 text-sm mb-4">Near {profileData?.location_name || 'your area'}, there are:</p>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-3xl font-bold text-emerald-600">12</p>
              <p className="text-xs text-emerald-600">Families</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-emerald-600">8</p>
              <p className="text-xs text-emerald-600">With similar ages</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-emerald-600">3</p>
              <p className="text-xs text-emerald-600">Events this week</p>
            </div>
          </div>
        </div>

        {/* Quick Tips */}
        <div className={`text-left bg-white rounded-2xl p-6 mb-8 transition-all duration-500 ${step >= 3 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <p className="text-sm font-semibold text-gray-900 mb-4">Quick tips to get started:</p>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 bg-teal-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-teal-600 text-xs font-bold">1</span>
              </div>
              <p className="text-sm text-gray-600">
                <strong className="text-gray-900">Browse families nearby</strong> — see who's in your area and filter by kids' ages
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 bg-teal-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-teal-600 text-xs font-bold">2</span>
              </div>
              <p className="text-sm text-gray-600">
                <strong className="text-gray-900">Send a message</strong> — introduce yourself, suggest a park meetup
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 bg-teal-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-teal-600 text-xs font-bold">3</span>
              </div>
              <p className="text-sm text-gray-600">
                <strong className="text-gray-900">Check out events</strong> — join local meetups or create your own
              </p>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className={`transition-all duration-500 ${step >= 3 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <Link
            href="/dashboard"
            className="block w-full bg-emerald-600 text-white text-lg font-semibold py-4 px-8 rounded-xl hover:bg-emerald-700 active:scale-[0.98] transition-all shadow-lg mb-3"
          >
            Go to Dashboard →
          </Link>
          
          <Link
            href="/discover"
            className="block w-full bg-white text-emerald-600 border-2 border-emerald-600 text-base font-medium py-3 px-8 rounded-xl hover:bg-emerald-50 active:scale-[0.98] transition-all"
          >
            Find Families Near Me
          </Link>
          
          <p className="mt-4 text-emerald-600 text-sm">
            Or explore{' '}
            <Link 
              href="/events" 
              className="underline text-emerald-600 hover:text-emerald-700"
            >
              upcoming events
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
