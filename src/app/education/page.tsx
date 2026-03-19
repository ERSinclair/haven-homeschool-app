'use client';

export const dynamic = 'force-dynamic';

import { useRouter } from 'next/navigation';
import AppHeader from '@/components/AppHeader';
import ProtectedRoute from '@/components/ProtectedRoute';

export default function EducationPage() {
  const router = useRouter();

  const cards = [
    {
      title: 'Learning Circles',
      desc: 'Join or create co-ops, study groups, and collaborative learning groups with local families.',
      icon: (
        <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <circle cx="8.5" cy="12" r="5.5" strokeWidth={2} />
          <circle cx="15.5" cy="12" r="5.5" strokeWidth={2} />
        </svg>
      ),
      href: '/circles',
      cta: 'Go to Circles',
      color: 'emerald',
    },
    {
      title: 'Curriculum & Resources',
      desc: 'Browse and trade curriculum, books, and educational materials with local families.',
      icon: (
        <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      ),
      href: '/exchange?category=curriculum',
      cta: 'Browse Exchange',
      color: 'blue',
    },
    {
      title: 'Teachers & Tutors',
      desc: 'Find local teachers offering classes in sports, arts, music, languages, and more.',
      icon: (
        <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
        </svg>
      ),
      href: '/discover?tab=people&sub=teacher',
      cta: 'Find Teachers',
      color: 'amber',
    },
    {
      title: 'Skills Exchange',
      desc: 'Connect with families who can teach what you want to learn — and share your own skills.',
      icon: (
        <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
        </svg>
      ),
      href: '/exchange',
      cta: 'Skills Exchange',
      color: 'purple',
    },
    {
      title: 'Local Activities',
      desc: 'Markets, fairs, excursions and other local events posted by the Haven community.',
      icon: (
        <svg className="w-6 h-6 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
      href: '/board?tab=activities',
      cta: 'View Activities',
      color: 'teal',
    },
    {
      title: 'Educational Spaces',
      desc: 'Find halls, studios, and community spaces available to hire for classes or meetups.',
      icon: (
        <svg className="w-6 h-6 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      ),
      href: '/exchange?category=spaces',
      cta: 'Find Spaces',
      color: 'rose',
    },
  ];

  const colorMap: Record<string, string> = {
    emerald: 'bg-emerald-50',
    blue:    'bg-blue-50',
    amber:   'bg-amber-50',
    purple:  'bg-purple-50',
    teal:    'bg-teal-50',
    rose:    'bg-rose-50',
  };
  const btnMap: Record<string, string> = {
    emerald: 'bg-emerald-600 hover:bg-emerald-700',
    blue:    'bg-blue-600 hover:bg-blue-700',
    amber:   'bg-amber-600 hover:bg-amber-700',
    purple:  'bg-purple-600 hover:bg-purple-700',
    teal:    'bg-teal-600 hover:bg-teal-700',
    rose:    'bg-rose-600 hover:bg-rose-700',
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white pb-24">
        <div className="max-w-md mx-auto px-4 pt-2">
          <AppHeader title="Education" />

          <p className="text-sm text-gray-500 mb-5 mt-1">
            Everything Haven has for learning, resources, and educational connection.
          </p>

          <div className="grid grid-cols-1 gap-3">
            {cards.map((card) => (
              <button
                key={card.href}
                onClick={() => router.push(card.href)}
                className={`w-full text-left ${colorMap[card.color]} rounded-2xl border border-white/60 shadow-sm p-4 active:scale-[0.99] transition-all flex items-start gap-4`}
              >
                <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm">
                  {card.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm mb-0.5">{card.title}</p>
                  <p className="text-xs text-gray-500 leading-relaxed">{card.desc}</p>
                </div>
                <div className="flex-shrink-0 self-center">
                  <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
