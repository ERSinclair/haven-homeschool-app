'use client';

export const dynamic = 'force-dynamic';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import AppHeader from '@/components/AppHeader';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get('email') || '';
  const [resent, setResent] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');

  const resendEmail = async () => {
    if (!email || resending) return;
    setResending(true);
    setError('');
    try {
      const res = await fetch(`${supabaseUrl}/auth/v1/resend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': supabaseKey },
        body: JSON.stringify({ type: 'signup', email }),
      });
      if (res.ok) {
        setResent(true);
      } else {
        const d = await res.json();
        setError(d.error_description || d.msg || 'Failed to resend. Try again in a moment.');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white">
      <AppHeader />
      <div className="max-w-md mx-auto px-5 pt-6 flex flex-col items-center text-center">

        {/* Icon */}
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-5">
          <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">Check your email</h1>
        <p className="text-gray-500 text-sm leading-relaxed mb-1">
          We sent a confirmation link to
        </p>
        {email && (
          <p className="text-gray-900 font-semibold text-sm mb-4">{email}</p>
        )}
        <p className="text-gray-500 text-sm leading-relaxed mb-8 max-w-xs">
          Click the link in the email to confirm your account and get started.
        </p>

        {/* Resend */}
        <div className="w-full space-y-3">
          {resent ? (
            <div className="flex items-center justify-center gap-2 py-3 bg-emerald-50 rounded-xl border border-emerald-200">
              <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              <p className="text-sm font-medium text-emerald-700">Email resent — check your inbox</p>
            </div>
          ) : (
            <button
              onClick={resendEmail}
              disabled={resending}
              className="w-full py-3.5 bg-white text-emerald-600 text-sm font-semibold rounded-xl border border-emerald-200 hover:bg-emerald-50 transition-colors disabled:opacity-50"
            >
              {resending ? 'Sending...' : "Resend confirmation email"}
            </button>
          )}

          {error && <p className="text-red-500 text-xs text-center">{error}</p>}

          <p className="text-xs text-gray-400 pt-2">
            Wrong email?{' '}
            <a href="/signup" className="text-emerald-600 font-medium hover:underline">Start over</a>
          </p>

          <p className="text-xs text-gray-400">
            Already confirmed?{' '}
            <a href="/login" className="text-emerald-600 font-medium hover:underline">Sign in</a>
          </p>
        </div>

        {/* Tips */}
        <div className="mt-10 bg-gray-50 rounded-2xl p-4 border border-gray-100 text-left w-full">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Can't find it?</p>
          <ul className="space-y-1.5 text-xs text-gray-500">
            <li>· Check your spam or junk folder</li>
            <li>· Make sure you used the right email address</li>
            <li>· The link expires after 24 hours</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  );
}
