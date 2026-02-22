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

  return (
    <div
      id="bottom-navigation-v2"
      className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-50"
      style={{ height: '80px' }}
    >
      <nav className="h-full bg-white">
        <div className="max-w-md mx-auto h-full flex justify-around items-center px-2">
          {navItems.map((item) => {
            const rootHref = (item as any).rootHref || item.href;
            const isActive = pathname === rootHref || pathname.startsWith(rootHref + '/') ||
                             pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <button
                key={item.href}
                onClick={() => handleNavClick(item.href)}
                className={`relative flex flex-col items-center justify-center w-full h-full transition-all duration-200 ${
                  isActive ? 'text-emerald-600' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {item.badge > 0 && (
                  <span className="absolute top-2 right-1/2 translate-x-3 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center border-2 border-white shadow-sm z-10">
                    {item.badge > 9 ? '9+' : item.badge}
                  </span>
                )}
                <span className={`text-sm font-semibold transition-all duration-200 ${
                  isActive ? 'text-emerald-600 scale-105' : 'text-gray-600'
                }`}>
                  {item.label}
                </span>
                {isActive && (
                  <span className="absolute bottom-0 w-10 h-1 bg-emerald-600 rounded-full shadow-sm"></span>
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
