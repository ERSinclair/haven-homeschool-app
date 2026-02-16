'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getStoredSession } from '@/lib/session';

export default function BottomNav() {
  const pathname = usePathname();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    // Check login status when pathname changes or on mount
    const checkLoginStatus = () => {
      const session = getStoredSession();
      setIsLoggedIn(!!session?.user);
    };
    
    checkLoginStatus();
  }, [pathname]);

  // Check for unread messages and pending connection requests
  useEffect(() => {
    if (!isLoggedIn) return;

    const checkNotifications = async () => {
      const session = getStoredSession();
      if (!session?.user) return;

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      try {
        // Check unread messages
        const res = await fetch(
          `${supabaseUrl}/rest/v1/conversations?or=(participant_1.eq.${session.user.id},participant_2.eq.${session.user.id})&select=*`,
          {
            headers: {
              'apikey': supabaseKey!,
              'Authorization': `Bearer ${session.access_token}`,
            },
          }
        );
        const conversations = await res.json();
        
        // Count unread conversations (where last message was not by current user)
        const unreadConversations = conversations.filter((conv: any) => 
          conv.last_message_by && conv.last_message_by !== session.user.id
        );
        
        setUnreadCount(unreadConversations.length);

      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          console.error('Error checking notifications:', err);
        }
      }
    };

    // Check immediately
    checkNotifications();

    // Check every 30 seconds for new notifications
    const interval = setInterval(checkNotifications, 30000);
    
    return () => clearInterval(interval);
  }, [isLoggedIn]);

  const navItems = [
    { href: '/discover', label: 'Discover', badge: 0 },
    { href: '/education', label: 'Education', badge: 0 },
    { href: '/circles', label: 'Circles', badge: 0 },
    { href: '/messages', label: 'Message', badge: unreadCount },
    { href: '/profile', label: 'Profile', badge: 0 },
  ];

  // Only show nav when logged in, but not on auth pages  
  const authPages = ['/', '/signup', '/login', '/welcome', '/forgot-password', '/dashboard'];
  
  console.log('BottomNav debug:', { 
    pathname, 
    isLoggedIn, 
    shouldHide: authPages.includes(pathname) || !isLoggedIn 
  });
  
  if (authPages.includes(pathname) || !isLoggedIn) {
    return null;
  }

  return (
    <div
      id="bottom-navigation-v2"
      className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-50"
      style={{ 
        height: '80px'
      }}
    >
      <nav className="h-full bg-white">
        <div className="max-w-md mx-auto h-full flex justify-around items-center px-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex flex-col items-center justify-center w-full h-full transition-all duration-200 ${
                isActive 
                  ? 'text-teal-600' 
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {/* Badge positioned relative to entire nav item */}
              {item.badge > 0 && (
                <span className="absolute top-2 right-1/2 transform translate-x-3 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center border-2 border-white shadow-sm z-10">
                  {item.badge > 9 ? '9+' : item.badge}
                </span>
              )}
              
              <span className={`text-sm font-semibold transition-all duration-200 ${
                isActive ? 'text-teal-600 scale-105' : 'text-gray-600'
              }`}>
                {item.label}
              </span>
              {isActive && (
                <span className="absolute bottom-0 w-10 h-1 bg-teal-600 rounded-full shadow-sm"></span>
              )}
            </Link>
          );
        })}
        </div>
      </nav>
    </div>
  );
}