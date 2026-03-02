'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getStoredSession } from '@/lib/session';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

interface AppHeaderProps {
  title?: string;
  backHref?: string;
  backLabel?: string;
  onBack?: () => void;
  left?: React.ReactNode;
  right?: React.ReactNode;
  transparent?: boolean;
  hideBell?: boolean;
}

export default function AppHeader({
  title,
  backHref,
  backLabel,
  onBack,
  left,
  right,
  transparent = false,
  hideBell = false,
}: AppHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [activityCount, setActivityCount] = useState(0);

  const showBack = !!(backHref || onBack);
  const handleBack = onBack ?? (backHref ? () => router.push(backHref) : () => router.back());
  const mainNavPaths = ['/discover', '/circles', '/events', '/messages', '/profile'];
  const calendarNavPaths = ['/discover', '/circles', '/events', '/messages'];
  const isMainNav = mainNavPaths.some(p => pathname === p);
  const isExactMainNav = mainNavPaths.includes(pathname ?? '');
  const showCalendar = calendarNavPaths.some(p => pathname === p);
  const isOnFeed = pathname === '/feed' || pathname === '/notifications';

  useEffect(() => {
    const session = getStoredSession();
    if (!session?.user) return;
    const check = async () => {
      try {
        const res = await fetch(
          `${supabaseUrl}/rest/v1/notifications?user_id=eq.${session.user.id}&read=eq.false&select=id`,
          {
            headers: {
              'apikey': supabaseKey!,
              'Authorization': `Bearer ${session.access_token}`,
              'Prefer': 'count=exact',
              'Range': '0-0',
            },
          }
        );
        const cr = res.headers.get('Content-Range');
        const count = cr ? parseInt(cr.split('/')[1]) || 0 : 0;
        setActivityCount(count);
      } catch { /* silent */ }
    };
    check();
    const interval = setInterval(check, 60000);
    return () => clearInterval(interval);
  }, [pathname]);

  return (
    <>
    <div className="fixed top-0 left-0 right-0 z-30 h-16 bg-white/10 backdrop-blur-lg border-b border-white/10">
      <div className="max-w-md mx-auto h-full flex items-center justify-between px-4">
      {/* Left */}
      <div className="w-20 flex items-center">
        {showBack ? (
          <button
            onClick={handleBack}
            className="flex items-center justify-center w-8 h-8 rounded-xl hover:bg-emerald-50 transition-colors text-gray-500 hover:text-emerald-600"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        ) : left ? (
          left
        ) : showCalendar ? (
          <button
            onClick={() => router.push('/calendar?from=' + pathname)}
            className="p-1 rounded-xl hover:bg-emerald-50 transition-colors -ml-1"
            aria-label="Calendar"
          >
            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-6h.008v.008H12v-.008zM12 15h.008v.008H12V15zm0 2.25h.008v.008H12v-.008zM9.75 15h.008v.008H9.75V15zm0 2.25h.008v.008H9.75v-.008zM7.5 15h.008v.008H7.5V15zm0 2.25h.008v.008H7.5v-.008zm6.75-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V15zm0 2.25h.008v.008h-.008v-.008zm2.25-4.5h.008v.008H16.5v-.008zm0 2.25h.008v.008H16.5V15z" />
            </svg>
          </button>
        ) : null}
      </div>

      {/* Centre — Haven wordmark */}
      <div className="absolute inset-x-0 flex justify-center items-center pointer-events-none">
        <Link href="/discover" className="pointer-events-auto">
          <span
            className="font-bold text-emerald-600 text-3xl cursor-pointer hover:text-emerald-700 transition-colors"
            style={{ fontFamily: 'var(--font-fredoka)' }}
          >
            Haven
          </span>
        </Link>
      </div>

      {/* Right — feed bell + custom slot */}
      <div className="w-20 flex items-center justify-end gap-3 relative z-10">
        {right}
        {isExactMainNav && !isOnFeed && !hideBell && (
          <button
            onClick={() => router.push('/notifications')}
            className="relative p-1 rounded-xl hover:bg-emerald-50 transition-colors mt-1 mr-[-8px]"
            aria-label="Activity feed"
          >
            <span className="relative inline-flex">
              <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {activityCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none">
                  {activityCount > 9 ? '9+' : activityCount}
                </span>
              )}
            </span>
          </button>
        )}
      </div>
      </div>
    </div>
    <div className="h-16 flex-shrink-0" />
    </>
  );
}
