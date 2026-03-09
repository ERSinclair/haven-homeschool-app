'use client';
import { useState, useEffect } from 'react';

export default function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);
  const [showBack, setShowBack] = useState(false);

  useEffect(() => {
    const onOffline = () => { setOffline(true); setWasOffline(true); setShowBack(false); };
    const onOnline = () => {
      setOffline(false);
      setShowBack(true);
      setTimeout(() => setShowBack(false), 3000);
    };
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    // Check initial state
    if (!navigator.onLine) { setOffline(true); setWasOffline(true); }
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, []);

  if (!offline && !showBack) return null;

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium transition-all duration-300 ${
        offline ? 'bg-red-500 text-white' : 'bg-emerald-500 text-white'
      }`}
    >
      {offline ? (
        <>
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636a9 9 0 010 12.728M15.536 8.464a5 5 0 010 7.072M12 12h.01M3 3l18 18" />
          </svg>
          No internet connection
        </>
      ) : (
        <>
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          Back online
        </>
      )}
    </div>
  );
}
