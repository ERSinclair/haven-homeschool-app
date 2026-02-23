'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getStoredSession } from '@/lib/session';
import AvatarUpload from '@/components/AvatarUpload';
import AppHeader from '@/components/AppHeader';
import ProtectedRoute from '@/components/ProtectedRoute';

type CircleInvitation = {
  id: string;
  circle_id: string;
  circle_name: string;
  circle_description?: string;
  circle_emoji: string;
  circle_color: string;
  inviter_id: string;
  inviter_name: string;
  inviter_avatar_url?: string;
  created_at: string;
  status: 'pending' | 'accepted' | 'declined';
};

export default function CircleInvitationsPage() {
  const [invitations, setInvitations] = useState<CircleInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [processingInvite, setProcessingInvite] = useState<string | null>(null);
  const router = useRouter();

  // Filter invitations
  const pendingInvitations = invitations.filter(inv => inv.status === 'pending');
  const processedInvitations = invitations.filter(inv => inv.status !== 'pending');

  // Load user's circle invitations
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
        const headers = {
          'apikey': supabaseKey!,
          'Authorization': `Bearer ${session.access_token}`,
        };

        // Fetch invitations with circle data
        const invRes = await fetch(
          `${supabaseUrl}/rest/v1/circle_invitations?invitee_id=eq.${session.user.id}&select=*,circles(name,description,emoji,color)&order=created_at.desc`,
          { headers }
        );

        if (!invRes.ok) {
          setInvitations([]);
          setLoading(false);
          return;
        }

        const rawInvs = await invRes.json();
        if (!Array.isArray(rawInvs) || rawInvs.length === 0) {
          setInvitations([]);
          setLoading(false);
          return;
        }

        // Fetch inviter profiles in one query
        const inviterIds = [...new Set(rawInvs.map((i: any) => i.inviter_id))];
        const profilesRes = await fetch(
          `${supabaseUrl}/rest/v1/profiles?id=in.(${inviterIds.join(',')})&select=id,family_name,display_name,avatar_url`,
          { headers }
        );
        const profiles = profilesRes.ok ? await profilesRes.json() : [];
        const profileMap: Record<string, any> = {};
        profiles.forEach((p: any) => { profileMap[p.id] = p; });

        // Merge data
        const merged: CircleInvitation[] = rawInvs.map((inv: any) => {
          const circle = inv.circles || {};
          const inviter = profileMap[inv.inviter_id] || {};
          return {
            id: inv.id,
            circle_id: inv.circle_id,
            circle_name: circle.name || 'Unknown Circle',
            circle_description: circle.description,
            circle_emoji: circle.emoji || '⭕',
            circle_color: circle.color || 'emerald',
            inviter_id: inv.inviter_id,
            inviter_name: inviter.family_name || inviter.display_name || 'Someone',
            inviter_avatar_url: inviter.avatar_url,
            created_at: inv.created_at,
            status: inv.status,
          };
        });

        setInvitations(merged);
      } catch (err) {
        console.error('Error loading circle invitations:', err);
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
      const session = getStoredSession();
      if (!session?.user) return;

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      const headers = {
        'apikey': supabaseKey!,
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      };

      const invitation = invitations.find(inv => inv.id === invitationId);

      // Update invitation status
      await fetch(
        `${supabaseUrl}/rest/v1/circle_invitations?id=eq.${invitationId}`,
        {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ status: action === 'accept' ? 'accepted' : 'declined' }),
        }
      );

      if (action === 'accept' && invitation) {
        // Add user to circle_members
        await fetch(
          `${supabaseUrl}/rest/v1/circle_members`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({
              circle_id: invitation.circle_id,
              member_id: session.user.id,
              role: 'member',
              joined_at: new Date().toISOString(),
            }),
          }
        );
      }

      // Update local state
      setInvitations(prev => prev.map(inv =>
        inv.id === invitationId
          ? { ...inv, status: action === 'accept' ? 'accepted' : 'declined' }
          : inv
      ));
    } catch (err) {
      console.error('Error processing invitation:', err);
    } finally {
      setProcessingInvite(null);
    }
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
            className="px-2 py-1.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 text-sm"
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
        <AppHeader backHref="/circles" />

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
                  {/* Circle Info */}
                  <div className="flex items-start gap-4 mb-4">
                    <div className={`w-12 h-12 bg-${invitation.circle_color}-100 rounded-xl flex items-center justify-center text-2xl`}>
                      {invitation.circle_emoji}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 mb-1">{invitation.circle_name}</h3>
                      {invitation.circle_description && (
                        <p className="text-sm text-gray-600 mb-2">{invitation.circle_description}</p>
                      )}
                    </div>
                  </div>

                  {/* Inviter */}
                  <div className="flex items-center gap-3 mb-4">
                    <AvatarUpload
                      userId={invitation.inviter_id}
                      currentAvatarUrl={invitation.inviter_avatar_url}
                      name={invitation.inviter_name}
                      size="sm"
                      editable={false}
                      showFamilySilhouette={true}
                    />
                    <div className="flex-1">
                      <p className="text-sm text-gray-600">
                        Invited by <span className="font-medium text-gray-900">{invitation.inviter_name}</span>
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
                      {processingInvite === invitation.id ? 'Processing...' : 'Accept'}
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
            <p className="text-base font-bold text-gray-900 mb-1">No Pending Invitations</p>
            <p className="text-sm text-gray-500">You don't have any pending circle invitations right now.</p>
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
                    <div className={`w-8 h-8 bg-${invitation.circle_color}-100 rounded-lg flex items-center justify-center text-lg`}>
                      {invitation.circle_emoji}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{invitation.circle_name}</p>
                      <p className="text-xs text-gray-500">
                        {invitation.status === 'accepted' ? 'Joined' : 'Declined'} • {formatTime(invitation.created_at)}
                      </p>
                    </div>
                    <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                      invitation.status === 'accepted' 
                        ? 'bg-green-100 text-green-700' 
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {invitation.status === 'accepted' ? 'Joined' : 'Declined'}
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