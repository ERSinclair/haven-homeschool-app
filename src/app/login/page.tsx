'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { checkProfileCompletion, getResumeSignupUrl } from '@/lib/profileCompletion';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

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

  // Save email when it changes
  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newEmail = e.target.value;
    setEmail(newEmail);
    
    // Save to localStorage when it looks like a valid email
    if (typeof window !== 'undefined' && newEmail.includes('@') && newEmail.includes('.')) {
      localStorage.setItem('haven-saved-email', newEmail);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    try {
      const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey!,
        },
        body: JSON.stringify({ email, password }),
      });
      
      const result = await response.json();

      if (!response.ok) {
        setError(result.error_description || result.msg || 'Login failed');
        setLoading(false);
        return;
      }

      // Store session manually in localStorage (bypassing SDK)
      const storageKey = `sb-ryvecaicjhzfsikfedkp-auth-token`;
      localStorage.setItem(storageKey, JSON.stringify({
        access_token: result.access_token,
        refresh_token: result.refresh_token,
        expires_at: result.expires_at,
        expires_in: result.expires_in,
        token_type: result.token_type,
        user: result.user,
      }));

      
      // Check if profile is complete
      try {
        const profileRes = await fetch(
          `${supabaseUrl}/rest/v1/profiles?id=eq.${result.user.id}&select=*`,
          {
            headers: {
              'apikey': supabaseKey!,
              'Authorization': `Bearer ${result.access_token}`,
            },
          }
        );

        if (profileRes.ok) {
          const profiles = await profileRes.json();
          const profile = profiles[0];
          const completionStep = checkProfileCompletion(profile);
          
          // Always go to welcome screen - let users choose their own flow
          window.location.href = '/welcome';
        } else {
          window.location.href = '/signup/resume?step=2';
        }
      } catch (profileErr) {
        console.error('Error checking profile:', profileErr);
        // If we can't check profile, assume incomplete and resume signup
        window.location.href = '/signup/resume?step=2';
      }
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
          <h1 className="font-bold text-emerald-600 text-4xl" style={{ fontFamily: 'var(--font-fredoka)' }}>Haven</h1>
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
        <div className="text-center mt-6">
          <p className="text-gray-600 text-sm">
            New to Haven?{' '}
            <Link href="/signup" className="text-emerald-600 hover:underline font-medium">
              Create account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
