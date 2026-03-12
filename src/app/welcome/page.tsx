'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredSession } from '@/lib/session';
import Link from 'next/link';
import AppHeader from '@/components/AppHeader';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Confetti pieces — varied shapes for a refined look
const CONFETTI = [
  { shape: 'circle', color: '#10b981', size: 8,  left: 5,  delay: 0,    dur: 3.8 },
  { shape: 'square', color: '#6ee7b7', size: 6,  left: 11, delay: 0.3,  dur: 4.2 },
  { shape: 'rect',   color: '#f59e0b', size: 10, left: 18, delay: 0.1,  dur: 3.5 },
  { shape: 'circle', color: '#a78bfa', size: 5,  left: 24, delay: 0.6,  dur: 4.5 },
  { shape: 'square', color: '#10b981', size: 7,  left: 31, delay: 0.2,  dur: 3.9 },
  { shape: 'rect',   color: '#34d399', size: 9,  left: 38, delay: 0.8,  dur: 4.1 },
  { shape: 'circle', color: '#fbbf24', size: 6,  left: 45, delay: 0.4,  dur: 3.6 },
  { shape: 'square', color: '#6ee7b7', size: 8,  left: 52, delay: 0.9,  dur: 4.3 },
  { shape: 'rect',   color: '#a78bfa', size: 5,  left: 59, delay: 0.2,  dur: 3.7 },
  { shape: 'circle', color: '#10b981', size: 10, left: 65, delay: 0.5,  dur: 4.0 },
  { shape: 'square', color: '#f59e0b', size: 6,  left: 72, delay: 0.1,  dur: 3.5 },
  { shape: 'rect',   color: '#34d399', size: 8,  left: 78, delay: 0.7,  dur: 4.4 },
  { shape: 'circle', color: '#a78bfa', size: 5,  left: 84, delay: 0.3,  dur: 3.8 },
  { shape: 'square', color: '#10b981', size: 7,  left: 90, delay: 0.6,  dur: 4.1 },
  { shape: 'rect',   color: '#fbbf24', size: 9,  left: 96, delay: 0.0,  dur: 3.6 },
];

// Haven house icon — clean SVG, on-brand emerald
function HavenIcon({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M28 8L6 26h6v20h32V26h6L28 8z" fill="#d1fae5" stroke="#10b981" strokeWidth="2.5" strokeLinejoin="round" />
      <rect x="22" y="34" width="12" height="12" rx="6" fill="#10b981" />
      <rect x="11" y="29" width="7" height="7" rx="1.5" fill="#10b981" opacity="0.35" />
      <rect x="38" y="29" width="7" height="7" rx="1.5" fill="#10b981" opacity="0.35" />
    </svg>
  );
}

export default function WelcomePage() {
  const [userData, setUserData] = useState<any>(null);
  const [profileData, setProfileData] = useState<any>(null);
  const [step, setStep] = useState(0);
  const [isFromSignup, setIsFromSignup] = useState(false);
  const [stats, setStats] = useState({ families: 0, events: 0, similarAges: 0 });
  const router = useRouter();

  const fetchProfileData = async (userId: string, accessToken: string) => {
    try {
      const response = await fetch(
        `${supabaseUrl}/rest/v1/profiles?id=eq.${userId}&select=family_name,display_name,location_name,bio,user_type,kids_ages`,
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
        fetchStats(userId, accessToken, profiles[0]);
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    }
  };

  const fetchStats = async (userId: string, accessToken: string, userProfile?: any) => {
    try {
      const headers = { 'apikey': supabaseKey!, 'Authorization': `Bearer ${accessToken}` };

      const familiesRes = await fetch(
        `${supabaseUrl}/rest/v1/profiles?id=neq.${userId}&select=id,kids_ages`,
        { headers }
      );
      const families = familiesRes.ok ? await familiesRes.json() : [];

      const today = new Date().toISOString().split('T')[0];
      const eventsRes = await fetch(
        `${supabaseUrl}/rest/v1/events?event_date=gte.${today}&select=id`,
        { headers }
      );
      const events = eventsRes.ok ? await eventsRes.json() : [];

      const myKidsAges: number[] = userProfile?.kids_ages || [];
      let similarAges = 0;
      if (myKidsAges.length > 0) {
        similarAges = families.filter((f: any) => {
          const theirAges: number[] = f.kids_ages || [];
          return theirAges.some((age: number) =>
            myKidsAges.some((myAge: number) => Math.abs(age - myAge) <= 2)
          );
        }).length;
      } else {
        similarAges = families.filter((f: any) => f.kids_ages && f.kids_ages.length > 0).length;
      }

      setStats({
        families: Array.isArray(families) ? families.length : 0,
        events: Array.isArray(events) ? events.length : 0,
        similarAges,
      });
    } catch {
      // Keep zeroes on error
    }
  };

  useEffect(() => {
    const fromSignup = new URLSearchParams(window.location.search).get('fromSignup') === 'true';
    setIsFromSignup(fromSignup);

    if (!fromSignup) {
      const session = getStoredSession();
      if (session?.user) {
        router.replace('/discover');
      } else {
        router.push('/signup');
      }
      return;
    }

    let attempts = 0;
    const trySession = () => {
      const session = getStoredSession();
      if (session?.user) {
        setUserData(session.user);
        fetchProfileData(session.user.id, session.access_token);
        setTimeout(() => setStep(1), 300);
        setTimeout(() => setStep(2), 900);
        setTimeout(() => setStep(3), 1400);
      } else if (attempts < 5) {
        attempts++;
        setTimeout(trySession, 400);
      } else {
        router.push('/signup');
      }
    };

    trySession();
  }, [router]);

  if (!userData) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const firstName = (profileData?.family_name || profileData?.display_name || '').split(' ')[0];

  const similarLabel =
    profileData?.user_type === 'teacher'
      ? 'Seeking help'
      : profileData?.user_type === 'business'
      ? 'Potential clients'
      : 'Similar ages';

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white">
      <style jsx>{`
        @keyframes confettiFall {
          0%   { transform: translateY(-20px) rotate(0deg);   opacity: 1; }
          85%  { opacity: 0.7; }
          100% { transform: translateY(105vh) rotate(500deg); opacity: 0; }
        }
        .confetti-piece {
          animation: confettiFall linear infinite;
          position: absolute;
          top: 0;
        }
      `}</style>

      {/* Confetti — new signup only */}
      {isFromSignup && (
        <div className="fixed inset-0 overflow-hidden pointer-events-none z-10">
          {CONFETTI.map((p, i) => (
            <div
              key={i}
              className="confetti-piece"
              style={{
                left: `${p.left}%`,
                width: p.shape === 'rect' ? Math.round(p.size * 0.45) : p.size,
                height: p.size,
                backgroundColor: p.color,
                borderRadius: p.shape === 'circle' ? '50%' : '2px',
                animationDelay: `${p.delay}s`,
                animationDuration: `${p.dur}s`,
              }}
            />
          ))}
        </div>
      )}

      <AppHeader />
      <div className="max-w-md mx-auto px-5 flex flex-col min-h-screen">

        {/* ── Hero ── */}
        <div
          className={`flex flex-col items-center text-center pt-6 pb-10 transition-all duration-500 ${
            step >= 1 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'
          }`}
        >
          {/* Headline */}
          <h1 className="text-gray-900 font-bold text-2xl mb-2 leading-snug">
            {isFromSignup
              ? <>Welcome{firstName ? `, ${firstName}` : ''}.</>
              : <>Good to have you back{firstName ? `, ${firstName}` : ''}.</>}
          </h1>

          {/* Subline */}
          <p className="text-gray-500 text-sm leading-relaxed max-w-[260px]">
            {isFromSignup
              ? profileData?.user_type === 'teacher'
                ? 'Your profile is live. Families can find you now.'
                : profileData?.user_type === 'business'
                ? 'Your listing is live. Local families can discover you.'
                : "You're part of the community. Let's find your people."
              : 'Pick up where you left off.'}
          </p>
        </div>

        {/* ── Stats card ── */}
        <div
          className={`transition-all duration-500 mb-5 ${
            step >= 2 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
        >
          <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-5">
            <p className="text-gray-400 text-xs font-semibold uppercase tracking-widest text-center mb-4">
              {profileData?.location_name ? `Near ${profileData.location_name}` : 'In your community'}
            </p>
            <div className="grid grid-cols-3 divide-x divide-gray-200">
              <div className="text-center px-2">
                <p className="text-2xl font-bold text-gray-900 tabular-nums">{stats.families}</p>
                <p className="text-xs text-gray-400 mt-0.5">Families</p>
              </div>
              <div className="text-center px-2">
                <p className="text-2xl font-bold text-gray-900 tabular-nums">{stats.similarAges}</p>
                <p className="text-xs text-gray-400 mt-0.5">{similarLabel}</p>
              </div>
              <div className="text-center px-2">
                <p className="text-2xl font-bold text-gray-900 tabular-nums">{stats.events}</p>
                <p className="text-xs text-gray-400 mt-0.5">Events</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── CTA buttons ── */}
        <div
          className={`transition-all duration-500 space-y-3 ${
            step >= 3 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
        >
          {isFromSignup ? (
            <>
              <Link
                href="/onboarding"
                className="block w-full bg-emerald-600 text-white text-sm font-semibold py-3.5 px-6 rounded-xl hover:bg-emerald-700 active:scale-[0.98] transition-all text-center"
              >
                Complete my profile
              </Link>
              <Link
                href="/discover"
                className="block w-full bg-white text-emerald-600 text-sm font-medium py-3.5 px-6 rounded-xl border border-emerald-200 hover:bg-emerald-50 hover:border-emerald-300 active:scale-[0.98] transition-all text-center"
              >
                Explore the community
              </Link>
            </>
          ) : (
            <Link
              href="/discover"
              className="block w-full bg-emerald-600 text-white text-sm font-semibold py-3.5 px-6 rounded-xl hover:bg-emerald-700 active:scale-[0.98] transition-all text-center"
            >
              Go to Discover
            </Link>
          )}
        </div>

        <div className="flex-1 min-h-16" />
      </div>
    </div>
  );
}
