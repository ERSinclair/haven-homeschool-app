'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getStoredSession } from '@/lib/session';
import HavenHeader from '@/components/HavenHeader';
import ProtectedRoute from '@/components/ProtectedRoute';

type CircleInvitation = {
  id: string;
  circle_id: string;
  circle_name: string;
  circle_description?: string;
  circle_emoji: string;
  circle_color: string;
  inviter_name: string;
  inviter_display_name?: string;
  invited_at: string;
  status: 'pending' | 'active' | 'declined';
};

type Notification = {
  id: string;
  type: 'circle_invite' | 'message' | 'system';
  title: string;
  body: string;
  time: string;
  read: boolean;
  link?: string;
  invitation?: CircleInvitation;
};

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [loading, setLoading] = useState(true);
  const [processingInvites, setProcessingInvites] = useState<Set<string>>(new Set());

  // Load circle invitations
  useEffect(() => {
    const loadNotifications = async () => {
      try {
        const session = getStoredSession();
        if (!session?.user) return;

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

        // Load pending circle invitations
        const response = await fetch(
          `${supabaseUrl}/rest/v1/pending_circle_invitations?member_id=eq.${session.user.id}&order=invited_at.desc`,
          {
            headers: {
              'apikey': supabaseKey!,
              'Authorization': `Bearer ${session.access_token}`,
            },
          }
        );

        if (response.ok) {
          const invitations = await response.json();
          
          const circleNotifications: Notification[] = invitations.map((inv: any) => ({
            id: inv.id,
            type: 'circle_invite',
            title: `Circle invitation from ${inv.inviter_display_name || inv.inviter_name}`,
            body: `You've been invited to join "${inv.circle_name}" ${inv.circle_emoji}`,
            time: formatTimeAgo(inv.invited_at),
            read: false,
            invitation: inv
          }));

          setNotifications(circleNotifications);
        }
      } catch (error) {
        console.error('Error loading notifications:', error);
      } finally {
        setLoading(false);
      }
    };

    loadNotifications();
  }, []);

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return `${Math.floor(diffDays / 7)}w ago`;
  };

  const handleInviteResponse = async (invitationId: string, accept: boolean) => {
    setProcessingInvites(prev => new Set(prev).add(invitationId));
    
    try {
      const session = getStoredSession();
      if (!session?.user) return;

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      const functionName = accept ? 'accept_circle_invitation' : 'decline_circle_invitation';
      
      const response = await fetch(
        `${supabaseUrl}/rest/v1/rpc/${functionName}`,
        {
          method: 'POST',
          headers: {
            'apikey': supabaseKey!,
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            invitation_id: invitationId
          }),
        }
      );

      if (response.ok) {
        // Remove the notification from the list
        setNotifications(prev => prev.filter(n => n.id !== invitationId));
        
        if (accept) {
          alert('Circle invitation accepted! Welcome to the circle.');
        }
      } else {
        throw new Error('Failed to process invitation');
      }
    } catch (error) {
      console.error('Error processing invitation:', error);
      alert('Failed to process invitation. Please try again.');
    } finally {
      setProcessingInvites(prev => {
        const newSet = new Set(prev);
        newSet.delete(invitationId);
        return newSet;
      });
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;
  const filtered = filter === 'all' ? notifications : notifications.filter(n => !n.read);

  const markAsRead = (id: string) => {
    setNotifications(notifications.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const markAllRead = () => {
    setNotifications(notifications.map(n => ({ ...n, read: true })));
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'circle_invite': return '👥';
      case 'message': return '💬';
      case 'event': return '📅';
      case 'system': return 'ℹ️';
      default: return '📢';
    }
  };

  const getColor = (type: string) => {
    switch (type) {
      case 'circle_invite': return 'bg-purple-500';
      case 'message': return 'bg-emerald-500';
      case 'event': return 'bg-yellow-500';
      case 'system': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <ProtectedRoute>
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
              notification.type === 'circle_invite' ? (
                // Circle invitation with accept/decline buttons
                <div
                  key={notification.id}
                  className={`bg-white rounded-xl p-4 transition-all ${
                    !notification.read ? 'ring-2 ring-purple-100' : ''
                  }`}
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <div className="flex gap-3">
                    <div className={`w-10 h-10 ${getColor(notification.type)} rounded-full flex items-center justify-center flex-shrink-0`}>
                      <span className="text-white text-lg">{getIcon(notification.type)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <p className={`font-medium ${!notification.read ? 'text-gray-900' : 'text-gray-700'}`}>
                          {notification.title}
                          {!notification.read && (
                            <span className="inline-block w-2 h-2 bg-purple-600 rounded-full ml-2"></span>
                          )}
                        </p>
                        <span className="text-xs text-gray-400 flex-shrink-0">{notification.time}</span>
                      </div>
                      <p className="text-sm text-gray-500 mb-3">{notification.body}</p>
                      
                      {/* Action buttons */}
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleInviteResponse(notification.id, true)}
                          disabled={processingInvites.has(notification.id)}
                          className="flex-1 px-3 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                        >
                          {processingInvites.has(notification.id) ? 'Accepting...' : 'Accept'}
                        </button>
                        <button
                          onClick={() => handleInviteResponse(notification.id, false)}
                          disabled={processingInvites.has(notification.id)}
                          className="flex-1 px-3 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 disabled:bg-gray-300 disabled:cursor-not-allowed"
                        >
                          {processingInvites.has(notification.id) ? 'Declining...' : 'Decline'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                // Regular notification as link
                <Link
                  key={notification.id}
                  href={notification.link || '/'}
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
              )
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
      
      {/* Bottom spacing for mobile nav */}
      <div className="h-20"></div>
    </div>
    </ProtectedRoute>
  );
}
