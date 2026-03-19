'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';


export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  // Load saved email on component mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Pre-fill saved email
    const savedEmail = localStorage.getItem('haven-saved-email');
    if (savedEmail && savedEmail.includes('@')) setEmail(savedEmail);
  }, [router]);

  // Save email when it changes
  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newEmail = e.target.value;
    setEmail(newEmail);
    
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error || !data.session) {
        setError(error?.message || 'Login failed');
        setLoading(false);
        return;
      }

      // Navigate immediately — no extra profile fetch needed on login.
      // The feed page handles the profile-nudge check on load.
      router.push('/feed');
    } catch (err) {
      console.error('Login exception:', err);
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white">
      <div className="max-w-md mx-auto px-4 py-6">
        {/* Back Link */}
        <div className="mb-6">
          <Link href="/" className="text-emerald-600 hover:text-emerald-700 font-medium">← Back</Link>
        </div>

        {/* Header */}
        <div className="text-center mb-12">
          <Link href="/" className="font-bold text-emerald-600 text-4xl" style={{ fontFamily: 'var(--font-fredoka)' }}>Haven</Link>
        </div>

        {/* Content */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Sign in</h2>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={handleEmailChange}
                className="w-full p-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                placeholder="you@email.com"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full p-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                placeholder="Your password"
                required
              />
            </div>
            
            <button
              type="submit"
              disabled={!email || !password || loading}
              className="w-full py-3.5 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 disabled:bg-gray-200 disabled:text-gray-400 transition-colors"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link href="/forgot-password" className="text-sm text-emerald-600 hover:underline">
              Forgot your password?
            </Link>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-6 space-y-2">
          <p className="text-gray-600 text-sm">
            New to Haven?{' '}
            <Link href="/signup" className="text-emerald-600 hover:underline font-medium">
              Create account
            </Link>
          </p>
          <p>
            <a href="mailto:cane@familyhaven.app?subject=Haven Feedback" className="text-xs text-gray-400 hover:text-gray-600">
              Send feedback or report a bug
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
