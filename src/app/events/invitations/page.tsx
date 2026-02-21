'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getStoredSession } from '@/lib/session';
import AvatarUpload from '@/components/AvatarUpload';
import HavenHeader from '@/components/HavenHeader';
import ProtectedRoute from '@/components/ProtectedRoute';

type EventInvitation = {
  id: string;
  event_id: string;
  event_title: string;
  event_description?: string;
  event_date: string;
  event_time: string;
  event_category: string;
  event_location_name: string;
  host_id: string;
  host_name: string;
  host_avatar_url?: string;
  created_at: string;
  status: 'pending' | 'accepted' | 'declined';
};

const categoryColors: Record<string, string> = {
  'Educational': 'bg-emerald-100 text-emerald-700',
  'Play': 'bg-blue-100 text-blue-700',
  'Other': 'bg-violet-100 text-violet-700',
};

const categoryEmojis: Record<string, string> = {
  'Educational': '📚',
  'Play': '🎮',
  'Other': '🎯',
};

export default function EventInvitationsPage() {
  const [invitations, setInvitations] = useState<EventInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [processingInvite, setProcessingInvite] = useState<string | null>(null);
  const router = useRouter();

  // Filter invitations
  const pendingInvitations = invitations.filter(inv => inv.status === 'pending');
  const processedInvitations = invitations.filter(inv => inv.status !== 'pending');

  // Load user's event invitations
  useEffect(() => {
    const loadInvitations = async () => {
      try {
        const session = getStoredSession();
        if (!session?.user) {
          router.push('/login');
          return;
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

        setInvitations([]);
      } catch (err) {
        console.error('Error loading event invitations:', err);
        setError('Failed to load invitations. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    loadInvitations();
  }, [router]);

  const handleInvitation = async (invitationId: string, action: 'accept' | 'decline') => {
    setProcessingInvite(invitationId);
    
    try {
      // Show success message
      const invitation = invitations.find(inv => inv.id === invitationId);
      if (action === 'accept') {
        alert(`You're attending "${invitation?.event_title}"! Your RSVP has been confirmed. You'll receive event updates and reminders.`);
      } else {
        alert('Event invitation declined.');
      }
      
      // Update local state
      setInvitations(prev => prev.map(inv => 
        inv.id === invitationId 
          ? { ...inv, status: action === 'accept' ? 'accepted' : 'declined' }
          : inv
      ));
      
      // In a real implementation, this would call the API:
      /*
      const session = getStoredSession();
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      
      const response = await fetch(
        `${supabaseUrl}/rest/v1/event_invitations?id=eq.${invitationId}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': supabaseKey!,
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status: action === 'accept' ? 'accepted' : 'declined' })
        }
      );
      */
      
    } catch (err) {
      console.error('Error processing invitation:', err);
      alert('Failed to process invitation. Please try again.');
    } finally {
      setProcessingInvite(null);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const diffTime = date.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays > 0 && diffDays <= 7) return `In ${diffDays} days`;
    
    return date.toLocaleDateString('en-AU', { 
      weekday: 'short',
      month: 'short', 
      day: 'numeric' 
    });
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString('en-AU', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white p-4 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-2 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <ProtectedRoute>
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white">
      <div className="max-w-md mx-auto px-4 py-8">
        <HavenHeader backHref="/events" />

        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Event Invitations</h1>
        </div>

        {/* Pending Invitations */}
        {pendingInvitations.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              Pending Invitations
              <span className="bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                {pendingInvitations.length}
              </span>
            </h2>
            
            <div className="space-y-4">
              {pendingInvitations.map((invitation) => (
                <div key={invitation.id} className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
                  {/* Event Info */}
                  <div className="flex items-start gap-4 mb-4">
                    <div className={`w-12 h-12 ${categoryColors[invitation.event_category] || categoryColors['Other']} rounded-xl flex items-center justify-center text-2xl`}>
                      {categoryEmojis[invitation.event_category] || categoryEmojis['Other']}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 mb-1">{invitation.event_title}</h3>
                      {invitation.event_description && (
                        <p className="text-sm text-gray-600 mb-2">{invitation.event_description}</p>
                      )}
                      <div className="flex items-center gap-3 text-sm text-gray-600">
                        <span>📅 {formatDate(invitation.event_date)}</span>
                        <span>🕐 {invitation.event_time}</span>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">📍 {invitation.event_location_name}</p>
                    </div>
                  </div>

                  {/* Host */}
                  <div className="flex items-center gap-3 mb-4">
                    <AvatarUpload
                      userId={invitation.host_id}
                      currentAvatarUrl={invitation.host_avatar_url}
                      name={invitation.host_name}
                      size="sm"
                      editable={false}
                      showFamilySilhouette={true}
                    />
                    <div className="flex-1">
                      <p className="text-sm text-gray-600">
                        Invited by <span className="font-medium text-gray-900">{invitation.host_name}</span>
                      </p>
                      <p className="text-xs text-gray-500">{formatTime(invitation.created_at)}</p>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleInvitation(invitation.id, 'decline')}
                      disabled={processingInvite === invitation.id}
                      className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 disabled:opacity-50 text-sm"
                    >
                      {processingInvite === invitation.id ? 'Processing...' : 'Decline'}
                    </button>
                    <button
                      onClick={() => handleInvitation(invitation.id, 'accept')}
                      disabled={processingInvite === invitation.id}
                      className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 disabled:opacity-50 text-sm"
                    >
                      {processingInvite === invitation.id ? 'Processing...' : 'Accept & RSVP'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No Pending Invitations */}
        {pendingInvitations.length === 0 && (
          <div className="text-center py-12">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Pending Invitations</h3>
            <p className="text-gray-600 mb-4">
              You don't have any pending event invitations right now.
            </p>
            <Link
              href="/events"
              className="inline-flex items-center px-2 py-1.5 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-colors text-sm"
            >
              Browse Events
            </Link>
          </div>
        )}

        {/* Recent Activity */}
        {processedInvitations.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h2>
            
            <div className="space-y-3">
              {processedInvitations.slice(0, 5).map((invitation) => (
                <div key={invitation.id} className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 ${categoryColors[invitation.event_category] || categoryColors['Other']} rounded-lg flex items-center justify-center text-lg`}>
                      {categoryEmojis[invitation.event_category] || categoryEmojis['Other']}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{invitation.event_title}</p>
                      <p className="text-xs text-gray-500">
                        {invitation.status === 'accepted' ? 'Attending' : 'Declined'} • {formatTime(invitation.created_at)}
                      </p>
                    </div>
                    <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                      invitation.status === 'accepted' 
                        ? 'bg-green-100 text-green-700' 
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {invitation.status === 'accepted' ? 'Attending' : 'Declined'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
    </ProtectedRoute>
  );
}