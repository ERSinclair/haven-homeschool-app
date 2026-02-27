'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/AuthContext';

export default function Home() {
  const router = useRouter();
  const { user, loading } = useAuth();

  // Check if logged in and redirect (non-blocking)
  // Only redirect if not coming from auth flow
  useEffect(() => {
    if (!loading && user) {
      // Longer delay to prevent conflict with login redirects
      const timer = setTimeout(() => {
        router.push('/discover');
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [user, loading, router]);

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-50 via-white to-emerald-50"></div>
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-100 rounded-full blur-3xl opacity-40 -translate-y-1/2 translate-x-1/2"></div>
        
        <div className="relative max-w-4xl mx-auto px-4 pt-8 pb-10 sm:pt-14 sm:pb-16">
          {/* Header with Sign In */}
          <div className="flex justify-end mb-4">
            <Link 
              href="/login"
              className="text-emerald-600 font-medium hover:text-emerald-700"
            >
              Sign in
            </Link>
          </div>

          {/* Haven wordmark — matches discover page */}
          <div className="text-center mb-6 pt-2">
            <span
              className="font-bold text-emerald-600 text-4xl"
              style={{ fontFamily: 'var(--font-fredoka)' }}
            >
              Haven
            </span>
          </div>

          {/* Headline + CTA */}
          <div className="text-center mb-8">
            <p className="text-xl sm:text-2xl text-gray-700 max-w-lg mx-auto mb-2 font-medium">
              Find your parent community
            </p>
            <p className="text-gray-500 max-w-md mx-auto mb-2">
              Connect with local families, home educators, teachers and like-minded businesses. Build your village, find your people.
            </p>
            <p className="text-sm text-emerald-600 font-medium max-w-md mx-auto mb-8">
              Families · Home Educators · Teachers · Businesses
            </p>
            <div className="max-w-sm mx-auto">
              <Link 
                href="/signup" 
                className="block w-full bg-emerald-600 text-white text-lg font-semibold py-4 px-8 rounded-xl hover:bg-emerald-700 active:scale-[0.98] transition-all shadow-lg shadow-emerald-600/25 text-center"
              >
                Find Families Near Me
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Problem Section */}
      <div className="bg-gray-50 py-16 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4">
            Finding your parent community is hard
          </h2>
          <p className="text-gray-600 mb-8 max-w-xl mx-auto">
            Facebook groups are overwhelming. Playgroups have waitlists. You just want to find families nearby with similar-aged kids who share your values.
          </p>

          <div className="grid sm:grid-cols-3 gap-6 text-left">
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <h3 className="font-semibold text-gray-900 mb-2">Actually local</h3>
              <p className="text-sm text-gray-600">
                See families within 5, 10, or 20km. Not "Melbourne parents" — your actual neighbours.
              </p>
            </div>
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <h3 className="font-semibold text-gray-900 mb-2">Age-matched</h3>
              <p className="text-sm text-gray-600">
                Filter by your kids' ages. Find playmates and learning buddies at the right stage.
              </p>
            </div>
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <h3 className="font-semibold text-gray-900 mb-2">Direct connection</h3>
              <p className="text-sm text-gray-600">
                Message families directly. No admin approval, no group politics.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* How it Works */}
      <div className="py-16 px-4">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center mb-12">
            How it works
          </h2>
          
          <div className="space-y-8">
            {[
              { num: '1', title: 'Create your profile', desc: 'Tell us your location, kids\' ages, and a bit about your family. Takes 30 seconds.' },
              { num: '2', title: 'Discover nearby families', desc: 'See families in your area, filtered by distance and kids\' ages.' },
              { num: '3', title: 'Connect directly', desc: 'Message families, arrange meetups, build your community.' },
            ].map((step, i) => (
              <div key={i} className="flex gap-4 items-start">
                <div className="w-10 h-10 bg-emerald-600 text-white rounded-full flex items-center justify-center font-bold flex-shrink-0">
                  {step.num}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">{step.title}</h3>
                  <p className="text-gray-600">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Not just for homeschoolers */}
      <div className="py-12 px-4 bg-gray-50">
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-sm font-medium text-emerald-600 mb-2">FOR ALL FAMILIES</p>
          <h3 className="text-xl font-bold text-gray-900 mb-3">
            Young families, new to area, stay-at-home parents
          </h3>
          <p className="text-gray-600">
            Whether you homeschool, have little ones before school, or just moved to the area — we're here to help you find families who share your values and have kids the same age. Building community starts here.
          </p>
        </div>
      </div>

      {/* Safety */}
      <div className="py-12 px-4">
        <div className="max-w-3xl mx-auto">
          <h3 className="text-lg font-bold text-gray-900 text-center mb-6">
            Built with safety in mind
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { icon: '', text: 'Private profiles' },
              { icon: '', text: 'Block anyone' },
              { icon: '', text: 'Report concerns' },
              { icon: '', text: 'Distance only, not address' },
            ].map((item, i) => (
              <div key={i} className="text-center p-4 bg-gray-50 rounded-xl">
                {item.icon && <span className="text-2xl mb-2 block">{item.icon}</span>}
                <p className="text-sm font-medium text-gray-700">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Final CTA */}
      <div className="py-16 px-4 bg-gradient-to-b from-white to-emerald-50">
        <div className="max-w-md mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4">
            Ready to find your community?
          </h2>
          <Link 
            href="/signup" 
            className="inline-block w-full sm:w-auto bg-emerald-600 text-white text-lg font-semibold py-4 px-10 rounded-xl hover:bg-emerald-700 active:scale-[0.98] transition-all shadow-lg shadow-emerald-600/25"
          >
            Get Started Free
          </Link>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-gray-100 py-8 px-4">
        <div className="max-w-3xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2 pointer-events-none">
            <span className="font-bold text-emerald-600 text-4xl" style={{ fontFamily: 'var(--font-fredoka)' }}>Haven</span>
          </div>
          <p className="text-sm text-gray-500">Made for Australian families &nbsp;·&nbsp; © 2026 Haven</p>
        </div>
        <div className="max-w-3xl mx-auto flex justify-center gap-5 mt-3">
          <Link href="/terms" className="text-xs text-gray-400 hover:text-gray-600">Terms</Link>
          <Link href="/community-guidelines" className="text-xs text-gray-400 hover:text-gray-600">Guidelines</Link>
          <Link href="/privacy" className="text-xs text-gray-400 hover:text-gray-600">Privacy</Link>
          <a href="mailto:hello@familyhaven.app" className="text-xs text-gray-400 hover:text-gray-600">Contact</a>
        </div>
      </div>
    </div>
  );
}
