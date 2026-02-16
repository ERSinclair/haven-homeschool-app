'use client';

import { useState } from 'react';
import Link from 'next/link';
import HavenHeader from '@/components/HavenHeader';

const initialNotifications = [
  {
    id: 1,
    type: 'message',
    title: 'Emma sent you a message',
    body: 'Perfect! The kids are so excited for Thursday...',
    time: '2h ago',
    read: false,
    link: '/messages',
  },
  {
    id: 2,
    type: 'nearby',
    title: 'New family nearby',
    body: 'Priya & Sam joined in Belmont with kids 4, 7',
    time: '6h ago',
    read: false,
    link: '/discover',
  },
  {
    id: 3,
    type: 'event',
    title: 'Event tomorrow',
    body: 'Beach Playdate at Torquay Foreshore, 10am',
    time: '1d ago',
    read: true,
    link: '/events',
  },
  {
    id: 4,
    type: 'message',
    title: 'Michelle shared resources',
    body: 'Here are those curriculum links I mentioned...',
    time: '1d ago',
    read: true,
    link: '/messages',
  },
  {
    id: 5,
    type: 'nearby',
    title: '3 new families this week',
    body: 'Torquay, Jan Juc, and Geelong areas',
    time: '3d ago',
    read: true,
    link: '/discover',
  },
  {
    id: 6,
    type: 'system',
    title: 'Welcome to Haven!',
    body: 'Your profile is set up. Start connecting!',
    time: '1w ago',
    read: true,
    link: '/discover',
  },
];

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const unreadCount = notifications.filter(n => !n.read).length;
  const filtered = filter === 'all' ? notifications : notifications.filter(n => !n.read);

  const markAsRead = (id: number) => {
    setNotifications(notifications.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const markAllRead = () => {
    setNotifications(notifications.map(n => ({ ...n, read: true })));
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'message': return '';
      case 'nearby': return '';
      case 'event': return '';
      case 'system': return '';
      default: return '';
    }
  };

  const getColor = (type: string) => {
    switch (type) {
      case 'message': return 'bg-emerald-500';
      case 'nearby': return 'bg-green-500';
      case 'event': return 'bg-yellow-500';
      case 'system': return 'bg-purple-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-md mx-auto px-4 py-5">
          <div className="flex items-center justify-between mb-4">
            <HavenHeader />
            {unreadCount > 0 && (
              <button 
                onClick={markAllRead}
                className="text-sm text-teal-600 font-medium"
              >
                Mark all read
              </button>
            )}
          </div>
          
          {/* Filter Tabs */}
          <div className="flex gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`flex-1 py-2 rounded-lg font-medium text-sm transition-all ${
                filter === 'all' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('unread')}
              className={`flex-1 py-2 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2 ${
                filter === 'unread' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600'
              }`}
            >
              Unread
              {unreadCount > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-xs ${
                  filter === 'unread' ? 'bg-white/20' : 'bg-emerald-600 text-white'
                }`}>
                  {unreadCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Notifications List */}
      <div className="max-w-md mx-auto px-4 py-4">
        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-gray-100 rounded-full mx-auto mb-4 flex items-center justify-center">
              <div className="w-8 h-8 bg-gray-100 rounded-full"></div>
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">
              {filter === 'unread' ? 'All caught up!' : 'No notifications'}
            </h3>
            <p className="text-gray-500 text-sm">
              {filter === 'unread' 
                ? 'You\'ve read everything' 
                : 'Activity will show up here'}
            </p>
            {filter === 'unread' && (
              <button 
                onClick={() => setFilter('all')}
                className="mt-4 text-emerald-600 font-medium text-sm"
              >
                View all activity
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((notification, index) => (
              <Link
                key={notification.id}
                href={notification.link}
                onClick={() => markAsRead(notification.id)}
                className={`block bg-white rounded-xl p-4 transition-all hover:shadow-md ${
                  !notification.read ? 'ring-2 ring-emerald-100' : ''
                }`}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="flex gap-3">
                  <div className={`w-10 h-10 ${getColor(notification.type)} rounded-full flex items-center justify-center flex-shrink-0`}>
                    <span className="text-white text-lg">{getIcon(notification.type)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`font-medium ${!notification.read ? 'text-gray-900' : 'text-gray-700'}`}>
                        {notification.title}
                        {!notification.read && (
                          <span className="inline-block w-2 h-2 bg-emerald-600 rounded-full ml-2"></span>
                        )}
                      </p>
                      <span className="text-xs text-gray-400 flex-shrink-0">{notification.time}</span>
                    </div>
                    <p className="text-sm text-gray-500 mt-0.5 truncate">{notification.body}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Settings Link */}
        <div className="mt-6">
          <Link 
            href="/settings" 
            className="flex items-center justify-between p-4 bg-white rounded-xl hover:shadow-md transition-all"
          >
            <div className="flex items-center gap-3">
              <span className="text-xl">⚙️</span>
              <div>
                <p className="font-medium text-gray-900">Notification settings</p>
                <p className="text-sm text-gray-500">Manage what you receive</p>
              </div>
            </div>
            <span className="text-gray-300">→</span>
          </Link>
        </div>

        {/* Clear All */}
        {notifications.length > 0 && (
          <button
            onClick={() => setNotifications([])}
            className="w-full mt-4 py-3 text-center text-sm text-gray-400 hover:text-red-500 transition-colors"
          >
            Clear all notifications
          </button>
        )}
      </div>
    </div>
  );
}
