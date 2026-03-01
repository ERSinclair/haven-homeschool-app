'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

const STORAGE_KEY = 'sb-ryvecaicjhzfsikfedkp-auth-token';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ryvecaicjhzfsikfedkp.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

function ConfirmContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [error, setError] = useState('');

  useEffect(() => {
    const token_hash = searchParams.get('token_hash') || searchParams.get('token');
    const type = searchParams.get('type') || 'email';

    // Also check URL hash fragment (Supabase sometimes puts token there)
    const hash = window.location.hash;
    let accessToken = '';
    let refreshToken = '';

    if (hash) {
      const params = new URLSearchParams(hash.replace('#', ''));
      accessToken = params.get('access_token') || '';
      refreshToken = params.get('refresh_token') || '';
    }

    // If we already have tokens in the hash, store and redirect
    if (accessToken) {
      storeAndRedirect(accessToken, refreshToken);
      return;
    }

    // Otherwise exchange the token_hash for a session
    if (!token_hash) {
      setStatus('error');
      setError('Invalid confirmation link. Please try signing up again.');
      return;
    }

    exchangeToken(token_hash, type);
  }, []);

  const exchangeToken = async (token_hash: string, type: string) => {
    try {
      const res = await fetch(`${supabaseUrl}/auth/v1/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
        },
        body: JSON.stringify({ token_hash, type }),
      });

      const data = await res.json();

      if (!res.ok || !data.access_token) {
        setStatus('error');
        setError(data.error_description || data.msg || 'Confirmation failed. The link may have expired.');
        return;
      }

      storeAndRedirect(data.access_token, data.refresh_token, data);
    } catch {
      setStatus('error');
      setError('Something went wrong. Please try again.');
    }
  };

  const storeAndRedirect = async (accessToken: string, refreshToken: string, data?: any) => {
    try {
      // Fetch user info if not in data
      let user = data?.user;
      if (!user) {
        const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
          headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${accessToken}` },
        });
        if (userRes.ok) user = await userRes.json();
      }

      const expiresIn = data?.expires_in || 3600;
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: Math.floor(Date.now() / 1000) + expiresIn,
        expires_in: expiresIn,
        token_type: 'bearer',
        user,
      }));

      setStatus('success');
      setTimeout(() => {
        window.location.href = '/welcome?fromSignup=true';
      }, 1500);
    } catch {
      setStatus('error');
      setError('Something went wrong storing your session. Please log in manually.');
    }
  };

  if (status === 'verifying') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white flex flex-col items-center justify-center px-5">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-gray-500 text-sm">Confirming your email...</p>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white flex flex-col items-center justify-center px-5">
        <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
          <svg className="w-7 h-7 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-1">Email confirmed!</h1>
        <p className="text-gray-500 text-sm">Taking you to Haven...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white flex flex-col items-center justify-center px-5">
      <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mb-4">
        <svg className="w-7 h-7 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </div>
      <h1 className="text-xl font-bold text-gray-900 mb-2">Confirmation failed</h1>
      <p className="text-gray-500 text-sm text-center mb-6 max-w-xs">{error}</p>
      <a href="/login" className="text-emerald-600 font-semibold text-sm hover:underline">Go to sign in</a>
    </div>
  );
}

export default function ConfirmPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <ConfirmContent />
    </Suspense>
  );
}
