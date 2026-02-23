'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { getStoredSession } from '@/lib/session';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [messagesBadge, setMessagesBadge] = useState(0);
  const [circlesBadge, setCirclesBadge] = useState(0);
  const [notifBadge, setNotifBadge] = useState(0);

  useEffect(() => {
    const session = getStoredSession();
    setIsLoggedIn(!!session?.user);
  }, [pathname]);

  useEffect(() => {
    if (!isLoggedIn) return;

    const check = async () => {
      const session = getStoredSession();
      if (!session?.user) return;

      const headers = {
        'apikey': supabaseKey!,
        'Authorization': `Bearer ${session.access_token}`,
      };

      try {
        // Unread message conversations
        const convRes = await fetch(
          `${supabaseUrl}/rest/v1/conversations?or=(participant_1.eq.${session.user.id},participant_2.eq.${session.user.id})&select=last_message_by`,
          { headers }
        );
        if (convRes.ok) {
          const convs = await convRes.json();
          setMessagesBadge(
            Array.isArray(convs)
              ? convs.filter((c: any) => c.last_message_by && c.last_message_by !== session.user.id).length
              : 0
          );
        }

        // Pending circle invitations
        const circleRes = await fetch(
          `${supabaseUrl}/rest/v1/circle_invitations?invitee_id=eq.${session.user.id}&status=eq.pending&select=id`,
          { headers }
        );
        if (circleRes.ok) {
          const ci = await circleRes.json();
          setCirclesBadge(Array.isArray(ci) ? ci.length : 0);
        }

        // Unread notifications (connections, events, etc — excludes messages)
        try {
          const notifRes = await fetch(
            `${supabaseUrl}/rest/v1/notifications?user_id=eq.${session.user.id}&read=eq.false&type=not.eq.message&select=id`,
            { headers: { ...headers, 'Prefer': 'count=exact', 'Range': '0-0' } }
          );
          if (notifRes.ok) {
            const cr = notifRes.headers.get('Content-Range');
            setNotifBadge(cr ? parseInt(cr.split('/')[1]) || 0 : 0);
          }
        } catch { /* notifications table may not exist yet */ }

      } catch {
        // Silent
      }
    };

    check();
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, [isLoggedIn, pathname]);

  const authPages = ['/', '/signup', '/login', '/welcome', '/forgot-password', '/reset-password'];
  if (authPages.includes(pathname) || !isLoggedIn) return null;

  // Circles goes to invitations when there are pending invites
  const circlesHref = circlesBadge > 0 ? '/circles/invitations' : '/circles';

  const navItems = [
    { href: '/discover',    label: 'Discover', badge: 0 },
    { href: circlesHref,    label: 'Circles',  badge: circlesBadge, rootHref: '/circles' },
    { href: '/events/my',   label: 'Events',   badge: 0 },
    { href: '/messages',    label: 'Message',  badge: messagesBadge },
    { href: '/profile',     label: 'Profile',  badge: notifBadge },
  ];

  const handleNavClick = (href: string) => {
    const isCurrentPage = pathname === href || pathname.startsWith(href + '/');
    if (isCurrentPage) {
      // Dispatch reset event so pages can respond (e.g. messages → conversation list)
      window.dispatchEvent(new CustomEvent('haven-nav-reset', { detail: { href } }));
    }
    router.push(href);
  };

  const NAV_ICONS: Record<string, React.ReactNode> = {
    Discover: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    Circles: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <circle cx="8.5" cy="12" r="6" strokeWidth={2} />
        <circle cx="15.5" cy="12" r="6" strokeWidth={2} />
      </svg>
    ),
    Events: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
    Message: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
      </svg>
    ),
    Profile: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  };

  return (
    <div
      id="bottom-navigation-v2"
      className="fixed bottom-0 left-0 right-0 z-50"
      style={{ height: '72px' }}
    >
      <div className="h-full bg-white/95 backdrop-blur-sm border-t border-gray-100 shadow-[0_-1px_12px_rgba(0,0,0,0.06)]">
        <div className="max-w-md mx-auto h-full flex justify-around items-center px-1">
          {navItems.map((item) => {
            const rootHref = (item as any).rootHref || item.href;
            const isActive = pathname === rootHref || pathname.startsWith(rootHref + '/') ||
                             pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <button
                key={item.href}
                onClick={() => handleNavClick(item.href)}
                className="relative flex flex-col items-center justify-center flex-1 h-full gap-1 transition-all duration-150"
              >
                {/* Badge */}
                {item.badge > 0 && (
                  <span className="absolute top-2 left-[calc(50%+8px)] bg-red-500 text-white text-[10px] font-bold rounded-full h-4 w-4 flex items-center justify-center border-2 border-white z-10">
                    {item.badge > 9 ? '9+' : item.badge}
                  </span>
                )}
                {/* Icon with pill background when active */}
                <div className={`p-1.5 rounded-xl transition-all duration-200 ${
                  isActive ? 'bg-emerald-100 text-emerald-700' : 'text-gray-400'
                }`}>
                  {NAV_ICONS[item.label]}
                </div>
                {/* Label */}
                <span className={`text-[10px] font-semibold leading-none transition-colors duration-200 ${
                  isActive ? 'text-emerald-700' : 'text-gray-400'
                }`}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
