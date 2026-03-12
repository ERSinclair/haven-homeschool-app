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
      const timer = setTimeout(() => router.push('/discover'), 300);
      return () => clearTimeout(timer);
    }
  }, [user, loading, router]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 via-emerald-50/40 to-white">

      {/* ── Nav ── */}
      <nav className="relative z-10 flex justify-end items-center px-6 py-3 max-w-5xl mx-auto">
        <Link href="/login" className="text-sm font-semibold text-emerald-600 hover:text-emerald-700 transition-colors">Sign in</Link>
      </nav>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        {/* Light green fade background */}

        <div className="relative max-w-3xl mx-auto px-6 pt-4 pb-20 text-center">
          <div className="font-bold text-emerald-600 text-5xl sm:text-6xl mb-6" style={{ fontFamily: 'var(--font-fredoka)' }}>Haven</div>


          <h1 className="text-3xl sm:text-4xl font-bold text-gray-800 leading-tight mb-5">
            Find Your Community
          </h1>
          <p className="text-lg text-gray-500 max-w-xl mx-auto mb-10 leading-relaxed">
            Connect with local families, teachers, and like-minded groups. Build real friendships and communities.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center max-w-sm mx-auto sm:max-w-none">
            <Link href="/signup"
              className="bg-emerald-600 text-white text-base font-semibold py-3.5 px-8 rounded-xl hover:bg-emerald-700 active:scale-[0.98] transition-all shadow-md shadow-emerald-600/20">
              Get started free
            </Link>
            <Link href="/login"
              className="bg-white text-emerald-700 text-base font-semibold py-3.5 px-8 rounded-xl border border-emerald-200 hover:bg-emerald-50 transition-all">
              Sign in
            </Link>
          </div>
        </div>
      </section>

      {/* ── Problem ── */}
      <section className="bg-gray-50 py-16 px-6">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3">
              Finding your community shouldn&apos;t be this hard
            </h2>
            <p className="text-gray-500 max-w-xl mx-auto">
              Facebook groups are overwhelming. Playgroups have waitlists. You just want families nearby with similar-aged kids who share your values.
            </p>
          </div>
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              {
                title: 'Actually local',
                desc: 'See families within 5, 10, or 20km — not "Melbourne parents", your actual neighbours.',
                icon: (
                  <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                ),
              },
              {
                title: 'Age-matched',
                desc: 'Filter by your kids\' ages. Find playmates and learning buddies at the right stage.',
                icon: (
                  <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                ),
              },
              {
                title: 'Direct connection',
                desc: 'Message families directly. No admin approval, no group politics, no algorithm.',
                icon: (
                  <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                ),
              },
            ].map((f, i) => (
              <div key={i} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                <div className="w-9 h-9 bg-emerald-50 rounded-lg flex items-center justify-center mb-3">
                  {f.icon}
                </div>
                <h3 className="font-semibold text-gray-900 mb-1.5">{f.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="py-16 px-6">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center mb-10">How it works</h2>
          <div className="space-y-6">
            {[
              { num: '1', title: 'Create your profile', desc: 'Share your location, your kids\' ages, and a bit about your family. Takes about 60 seconds.' },
              { num: '2', title: 'Discover nearby families', desc: 'Browse families, teachers, playgroups, and home education resources within your area.' },
              { num: '3', title: 'Connect and meet up', desc: 'Message directly, join local circles, RSVP to events, and build your village.' },
            ].map((step, i) => (
              <div key={i} className="flex gap-4 items-start">
                <div className="w-9 h-9 bg-emerald-600 text-white rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 mt-0.5">{step.num}</div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">{step.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Who it's for ── */}
      <section className="bg-gray-50 py-14 px-6">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">Perfect for</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              'Home Education',
              'Playgroups',
              'Private teachers',
              'Family businesses',
              'Community Building',
              'Relocating Families',
            ].map((label, i) => (
              <div key={i} className="bg-white border border-emerald-100 rounded-xl p-4 text-center shadow-sm">
                <p className="text-sm font-semibold text-emerald-700">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Safety ── */}
      <section className="py-14 px-6">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-xl font-bold text-gray-900 text-center mb-6">Built with safety in mind</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {['Private profiles', 'Block anyone', 'Report concerns', 'Distance only, not address'].map((item, i) => (
              <div key={i} className="flex items-center gap-2.5 bg-gray-50 rounded-xl p-3.5 border border-gray-100">
                <svg className="w-4 h-4 text-emerald-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                <p className="text-xs font-medium text-gray-700">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── About Us ── */}
      <section className="py-16 px-6 bg-white border-t border-gray-100">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Why we built this</h2>
          <div>
            <div>
              <p className="text-gray-600 leading-relaxed mb-4">
                Haven started in a pretty ordinary way — we&apos;re a family that moves around a lot, and every time we do, we find ourselves starting from scratch.
              </p>
              <p className="text-gray-600 leading-relaxed mb-4">
                Finding other families nearby shouldn&apos;t be hard. But it is. And if your kids aren&apos;t in school yet, or you&apos;re new to an area, there&apos;s no obvious way in.
              </p>
              <p className="text-gray-600 leading-relaxed mb-4">
                We were also planning to home education, which made it worse — that community is out there, but it&apos;s scattered and hard to find.
              </p>
              <p className="text-gray-600 leading-relaxed">
                Haven is our answer to all of it. Whether you&apos;re a family looking to connect, a playgroup searching for members, a teacher offering classes in sport, arts or music, or a business that works with kids — this is the place. Built by parents, for everyone who believes kids thrive when they grow up with real community around them.
              </p>
              <p className="mt-4 text-sm font-semibold text-emerald-700">— The Haven family, Surf Coast VIC</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="py-16 px-6 bg-emerald-600">
        <div className="max-w-md mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">Ready to find your community?</h2>
          <Link href="/signup"
            className="inline-block bg-white text-emerald-700 text-base font-bold py-3.5 px-10 rounded-xl hover:bg-emerald-50 active:scale-[0.98] transition-all shadow-md">
            Get started free
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-gray-100 py-8 px-6">
        <div className="max-w-3xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          <span className="font-bold text-emerald-600 text-2xl" style={{ fontFamily: 'var(--font-fredoka)' }}>Haven</span>
          <p className="text-sm text-gray-400">Made for Australian families · © 2026 Haven</p>
        </div>
        <div className="max-w-3xl mx-auto flex justify-center gap-5 mt-3 flex-wrap">
          <Link href="/terms" className="text-xs text-gray-400 hover:text-gray-600">Terms</Link>
          <Link href="/community-guidelines" className="text-xs text-gray-400 hover:text-gray-600">Guidelines</Link>
          <Link href="/privacy" className="text-xs text-gray-400 hover:text-gray-600">Privacy</Link>
          <a href="mailto:cane@familyhaven.app" className="text-xs text-gray-400 hover:text-gray-600">Contact</a>
          <a href="mailto:cane@familyhaven.app?subject=Haven Feedback" className="text-xs text-gray-400 hover:text-gray-600">Send feedback</a>
        </div>
      </footer>

    </div>
  );
}
