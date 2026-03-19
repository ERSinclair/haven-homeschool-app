'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/AuthContext';

export default function Home() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user) {
      router.replace('/discover');
    }
  }, [user, loading, router]);

  return (
    <div className="min-h-screen bg-white">

      {/* Nav */}
      <nav className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="flex justify-between items-center px-6 py-4 max-w-5xl mx-auto">
          <span className="font-bold text-emerald-600 text-2xl" style={{ fontFamily: 'var(--font-fredoka)' }}>Haven</span>
          <Link href="/login" className="text-sm font-semibold text-gray-700 hover:text-gray-900 transition-colors">
            Sign in
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="bg-gradient-to-b from-emerald-50 to-white px-6 py-16 text-center">
        <h1 className="text-5xl sm:text-6xl font-bold text-gray-900 leading-tight mb-4">
          Find your community.
        </h1>
        <p className="text-lg text-gray-500 max-w-md mx-auto mb-10 leading-relaxed">
          Connect with local families, playgroups, and teachers.
          <span className="block mt-2 text-lg font-normal opacity-80">Find your people, right where you are.</span>
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
          <Link
            href="/signup"
            className="w-full sm:w-auto bg-emerald-600 text-white text-base font-semibold py-3.5 px-8 rounded-xl hover:bg-emerald-700 active:scale-[0.98] transition-all shadow-md shadow-emerald-600/20"
          >
            Get started free
          </Link>
          <Link
            href="/login"
            className="w-full sm:w-auto bg-white text-emerald-700 text-base font-semibold py-3.5 px-8 rounded-xl border-2 border-emerald-200 hover:bg-emerald-50 hover:border-emerald-300 transition-all"
          >
            Sign in
          </Link>
        </div>
      </section>

      {/* How it works */}
      <section className="px-6 py-16 bg-white">
        <div className="max-w-sm mx-auto sm:max-w-2xl">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-10">How it works</h2>
          <div className="space-y-8">
            {[
              { num: '1', title: 'Create your profile', desc: 'Share your location, your kids\' ages, and a bit about your family. Takes about 60 seconds.' },
              { num: '2', title: 'Discover nearby families', desc: 'Browse families, teachers, and playgroups within your area — filtered by age and distance.' },
              { num: '3', title: 'Connect and meet up', desc: 'Message directly, join local circles, RSVP to events, and build your village.' },
            ].map((step) => (
              <div key={step.num} className="flex gap-5 items-start">
                <div className="w-10 h-10 bg-emerald-600 text-white rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0">
                  {step.num}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">{step.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>


      {/* CTA */}
      <section className="bg-emerald-600 px-6 py-16">
        <div className="max-w-md mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-8">
            Ready to find your community?
          </h2>
          <Link
            href="/signup"
            className="inline-block bg-white text-emerald-700 text-base font-bold py-3.5 px-10 rounded-xl hover:bg-emerald-50 active:scale-[0.98] transition-all shadow-md"
          >
            Get started free
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-8 px-6 bg-white">
        <div className="max-w-3xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          <span className="font-bold text-emerald-600 text-2xl" style={{ fontFamily: 'var(--font-fredoka)' }}>Haven</span>
          <p className="text-sm text-gray-400">Made for Australian families · © 2026 Haven</p>
        </div>
        <div className="max-w-3xl mx-auto flex justify-center gap-5 mt-3 flex-wrap">
          <Link href="/terms" className="text-xs text-gray-400 hover:text-gray-600">Terms</Link>
          <Link href="/community-guidelines" className="text-xs text-gray-400 hover:text-gray-600">Guidelines</Link>
          <Link href="/privacy" className="text-xs text-gray-400 hover:text-gray-600">Privacy</Link>
          <a href="mailto:cane@familyhaven.app" className="text-xs text-gray-400 hover:text-gray-600">Contact</a>
        </div>
      </footer>

    </div>
  );
}
