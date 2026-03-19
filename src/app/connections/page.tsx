'use client';

export const dynamic = 'force-dynamic';
import { toast } from '@/lib/toast';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getStoredSession } from '@/lib/session';
import AvatarUpload from '@/components/AvatarUpload';
import AppHeader from '@/components/AppHeader';
import ProtectedRoute from '@/components/ProtectedRoute';
import { ConnectionsPageSkeleton } from '@/components/SkeletonLoader';
import InviteToHaven from '@/components/InviteToHaven';
import ProfileCardModal from '@/components/ProfileCardModal';
import { getCached, setCached } from '@/lib/pageCache';

type Connection = {
  id: string;
  user: {
    id: string;
    family_name: string;
    display_name: string;
    location_name: string;
    location_lat?: number;
    location_lng?: number;
    avatar_url?: string;
    kids_ages?: number[];
    dob?: string;
    show_birthday?: boolean;
  };
  status: 'pending' | 'accepted' | 'blocked';
  created_at: string;
  is_requester: boolean;
};

export default function ConnectionsPage() {
  const [connections, setConnections] = useState<Connection[]>(() => getCached<Connection[]>('connections:list') ?? []);
  const [pendingRequests, setPendingRequests] = useState<Connection[]>(() => getCached<Connection[]>('connections:pending') ?? []);
  const [sentRequests, setSentRequests] = useState<Connection[]>(() => getCached<Connection[]>('connections:sent') ?? []);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  type FamilyLinkReq = { id: string; otherId: string; name: string; avatar_url?: string; relationship: string; relationship_label?: string; isRequester: boolean };
  const [pendingFamilyLinks, setPendingFamilyLinks] = useState<FamilyLinkReq[]>([]);
  const [sentFamilyLinks, setSentFamilyLinks] = useState<FamilyLinkReq[]>([]);
  const [loading, setLoading] = useState(() => !getCached<Connection[]>('connections:list'));
  const [autoSwitched, setAutoSwitched] = useState(false);
  const [activeTab, setActiveTab] = useState<'connections' | 'requests' | 'sent' | 'map'>(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search).get('tab');
      if (p === 'pending' || p === 'requests') return 'requests';
    }
    return 'connections';
  });
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showConnectPanel, setShowConnectPanel] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<Connection | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [connectionToDelete, setConnectionToDelete] = useState<Connection | null>(null);
  const [viewMode, setViewMode] = useState<'connections' | 'messages'>('connections');
  
  // Multi-select state
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedConnections, setSelectedConnections] = useState<Set<string>>(new Set());
  
  // Message modal state
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [selectedConnectionForMessage, setSelectedConnectionForMessage] = useState<Connection | null>(null);
  const [messageText, setMessageText] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [profileCardUserId, setProfileCardUserId] = useState<string | null>(null);
  const [successMessageText, setSuccessMessageText] = useState('');
  
  const router = useRouter();

  useEffect(() => {
    loadConnections();
  }, []);

  // Multi-select functions
  const handleLongPress = (connectionId: string) => {
    if (!isMultiSelectMode) {
      setIsMultiSelectMode(true);
      setSelectedConnections(new Set([connectionId]));
    }
  };

  const toggleConnectionSelection = (connectionId: string) => {
    const newSelected = new Set(selectedConnections);
    if (newSelected.has(connectionId)) {
      newSelected.delete(connectionId);
    } else {
      newSelected.add(connectionId);
    }
    setSelectedConnections(newSelected);
    
    // Exit multi-select if no connections selected
    if (newSelected.size === 0) {
      setIsMultiSelectMode(false);
    }
  };

  const exitMultiSelect = () => {
    setIsMultiSelectMode(false);
    setSelectedConnections(new Set());
  };

  const addBirthdayToCalendar = async (user: { id: string; family_name: string; display_name?: string; dob?: string }) => {
    if (!user.dob) return;
    const session = getStoredSession();
    if (!session) return;
    const name = user.display_name || user.family_name.split(' ')[0] || user.family_name;
    const [, month, day] = user.dob.split('-');
    const noteDate = `${new Date().getFullYear()}-${month}-${day}`;
    await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/calendar_notes`, {
      method: 'POST',
      headers: {
        'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        profile_id: session.user.id,
        note_date: noteDate,
        title: `${name}'s birthday`,
        content: '',
        recurrence_rule: 'yearly',
        note_type: 'birthday',
      }),
    });
  };

  const sendMessageToSelected = () => {
    if (selectedConnections.size > 0) {
      // Get the selected connections for the message modal
      const selectedConnectionsList = filteredConnections.filter(conn => 
        selectedConnections.has(conn.id)
      );
      setSelectedConnectionForMessage(selectedConnectionsList[0]); // Use first for modal display
      setShowMessageModal(true);
    }
  };

  // Function to send message
  const sendMessage = async () => {
    if (!messageText.trim() || sendingMessage) {
      return;
    }

    try {
      setSendingMessage(true);

      const session = getStoredSession();
      if (!session?.user) return;

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      // Determine recipients
      const recipients = isMultiSelectMode && selectedConnections.size > 0
        ? filteredConnections.filter(conn => selectedConnections.has(conn.id))
        : selectedConnectionForMessage ? [selectedConnectionForMessage] : [];

      if (recipients.length === 0) {
        throw new Error('No recipients selected');
      }

      // Send message to each recipient using conversation model
      const h = {
        'apikey': supabaseKey!,
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      };

      const failedSends: Response[] = [];

      for (const connection of recipients) {
        const otherId = connection.user.id;

        // Find existing conversation
        const convoRes = await fetch(
          `${supabaseUrl}/rest/v1/conversations?or=(and(participant_1.eq.${session.user.id},participant_2.eq.${otherId}),and(participant_1.eq.${otherId},participant_2.eq.${session.user.id}))&select=id&limit=1`,
          { headers: h }
        );
        const convos = convoRes.ok ? await convoRes.json() : [];
        let conversationId: string;

        if (convos.length > 0) {
          conversationId = convos[0].id;
        } else {
          // Create new conversation
          const newConvoRes = await fetch(`${supabaseUrl}/rest/v1/conversations`, {
            method: 'POST',
            headers: { ...h, 'Prefer': 'return=representation' },
            body: JSON.stringify({ participant_1: session.user.id, participant_2: otherId }),
          });
          if (!newConvoRes.ok) { failedSends.push(newConvoRes); continue; }
          const [newConvo] = await newConvoRes.json();
          conversationId = newConvo.id;
        }

        // Send message
        const msgRes = await fetch(`${supabaseUrl}/rest/v1/messages`, {
          method: 'POST',
          headers: { ...h, 'Prefer': 'return=minimal' },
          body: JSON.stringify({ conversation_id: conversationId, sender_id: session.user.id, content: messageText.trim() }),
        });
        if (!msgRes.ok) { failedSends.push(msgRes); continue; }

        // Update conversation metadata
        await fetch(`${supabaseUrl}/rest/v1/conversations?id=eq.${conversationId}`, {
          method: 'PATCH',
          headers: h,
          body: JSON.stringify({ last_message_text: messageText.trim(), last_message_at: new Date().toISOString(), last_message_by: session.user.id }),
        });
      }

      if (failedSends.length === 0) {
        // All messages sent successfully
        setShowMessageModal(false);
        setSelectedConnectionForMessage(null);
        setMessageText('');
        
        if (isMultiSelectMode) {
          exitMultiSelect();
          setSuccessMessageText(`Message sent to ${recipients.length} connection${recipients.length > 1 ? 's' : ''}!`);
        } else {
          setSuccessMessageText('Message sent successfully!');
        }
        
        setShowSuccessMessage(true);
        setTimeout(() => setShowSuccessMessage(false), 3000);
      } else {
        throw new Error(`Failed to send ${failedSends.length} message(s)`);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      toast('Failed to send message. Please try again.', 'error');
    } finally {
      setSendingMessage(false);
    }
  };

  // Helper function to extract last name
  const getLastName = (connection: Connection) => {
    const fullName = connection.user.family_name || connection.user.display_name || '';
    const nameParts = fullName.trim().split(' ');
    return nameParts.length > 1 ? nameParts[nameParts.length - 1] : fullName;
  };

  // Sort function to sort by last name alphabetically
  const sortByLastName = (items: Connection[]) => {
    return [...items].sort((a, b) => {
      const lastNameA = getLastName(a).toLowerCase();
      const lastNameB = getLastName(b).toLowerCase();
      return lastNameA.localeCompare(lastNameB);
    });
  };

  // Filter functions
  const filterBySearch = (items: Connection[]) => {
    if (!searchTerm) return items;
    return items.filter(item => 
      (item.user.family_name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (item.user.display_name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (item.user.location_name?.toLowerCase() || '').includes(searchTerm.toLowerCase())
    );
  };

  // Apply filtering and sorting
  const filteredConnections = sortByLastName(filterBySearch(connections));
  const filteredPendingRequests = sortByLastName(filterBySearch(pendingRequests));
  const filteredSentRequests = sortByLastName(filterBySearch(sentRequests));

  const loadConnections = async () => {
    try {
      const session = getStoredSession();
      if (!session?.user) {
        router.push('/login');
        return;
      }

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      // Load accepted connections
      const connectionsResponse = await fetch(
        `${supabaseUrl}/rest/v1/connections?status=eq.accepted&or=(requester_id.eq.${session.user.id},receiver_id.eq.${session.user.id})&select=*,requester:profiles!connections_requester_id_fkey(id,family_name,display_name,location_name,location_lat,location_lng,avatar_url,kids_ages),receiver:profiles!connections_receiver_id_fkey(id,family_name,display_name,location_name,location_lat,location_lng,avatar_url,kids_ages)`,
        {
          headers: {
            'apikey': supabaseKey!,
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      // Load pending connection requests (where current user is the receiver)
      const requestsResponse = await fetch(
        `${supabaseUrl}/rest/v1/connections?status=eq.pending&receiver_id=eq.${session.user.id}&select=*,requester:profiles!connections_requester_id_fkey(id,family_name,display_name,location_name,location_lat,location_lng,avatar_url,kids_ages)`,
        {
          headers: {
            'apikey': supabaseKey!,
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      // Load sent connection requests (where current user is the requester)
      const sentResponse = await fetch(
        `${supabaseUrl}/rest/v1/connections?status=eq.pending&requester_id=eq.${session.user.id}&select=*,receiver:profiles!connections_receiver_id_fkey(id,family_name,display_name,location_name,location_lat,location_lng,avatar_url,kids_ages)`,
        {
          headers: {
            'apikey': supabaseKey!,
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (!connectionsResponse.ok || !requestsResponse.ok || !sentResponse.ok) {
        throw new Error('Failed to load connections');
      }

      const connectionsData = await connectionsResponse.json();
      const requestsData = await requestsResponse.json();
      const sentData = await sentResponse.json();

      // Process connections (show the other person in each connection)
      const processedConnections = connectionsData.map((conn: any) => ({
        id: conn.id,
        user: conn.requester_id === session.user.id ? conn.receiver : conn.requester,
        status: conn.status,
        created_at: conn.created_at,
        is_requester: conn.requester_id === session.user.id
      }));

      // Process pending requests (requests to current user)
      const processedRequests = requestsData.map((req: any) => ({
        id: req.id,
        user: req.requester,
        status: req.status,
        created_at: req.created_at,
        is_requester: false
      }));

      // Process sent requests (requests from current user)
      const processedSentRequests = sentData.map((req: any) => ({
        id: req.id,
        user: req.receiver,
        status: req.status,
        created_at: req.created_at,
        is_requester: true
      }));

      setConnections(processedConnections);
      setPendingRequests(processedRequests);
      setSentRequests(processedSentRequests);
      setCached('connections:list', processedConnections);
      setCached('connections:pending', processedRequests);
      setCached('connections:sent', processedSentRequests);

      // Load pending family links
      try {
        const flRes = await fetch(
          `${supabaseUrl}/rest/v1/family_links?or=(requester_id.eq.${session.user.id},receiver_id.eq.${session.user.id})&status=eq.pending&select=*`,
          { headers: { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}` } }
        );
        if (flRes.ok) {
          const flRaw = await flRes.json();
          const otherIds = flRaw.map((l: any) => l.requester_id === session.user.id ? l.receiver_id : l.requester_id);
          let profMap: Record<string, any> = {};
          if (otherIds.length > 0) {
            const pRes = await fetch(
              `${supabaseUrl}/rest/v1/profiles?id=in.(${[...new Set(otherIds)].join(',')})&select=id,family_name,display_name,avatar_url`,
              { headers: { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}` } }
            );
            if (pRes.ok) { const ps = await pRes.json(); ps.forEach((p: any) => { profMap[p.id] = p; }); }
          }
          const mapped: FamilyLinkReq[] = flRaw.map((l: any) => {
            const isReq = l.requester_id === session.user.id;
            const otherId = isReq ? l.receiver_id : l.requester_id;
            const p = profMap[otherId] || {};
            const RELS: Record<string, string> = { partner:'Partner', co_parent:'Co-parent', grandparent:'Grandparent', aunt_uncle:'Aunt / Uncle', sibling:'Sibling', close_friend:'Close Friend', other:'Other' };
            return { id: l.id, otherId, name: p.display_name || p.family_name || 'Unknown', avatar_url: p.avatar_url, relationship: l.relationship_label || RELS[l.relationship] || l.relationship, isRequester: isReq };
          });
          setPendingFamilyLinks(mapped.filter(l => !l.isRequester));
          setSentFamilyLinks(mapped.filter(l => l.isRequester));
        }
      } catch { /* ignore */ }
    } catch (err) {
      console.error('Error loading connections:', err);
      setError('Failed to load connections');
    } finally {
      setLoading(false);
      // Auto-switch to requests if pending and no explicit tab in URL
      if (!autoSwitched) {
        setAutoSwitched(true);
        const tabParam = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('tab') : null;
        if (!tabParam && pendingRequests.length > 0) setActiveTab('requests');
      }
    }
  };

  const handleAcceptRequest = async (connectionId: string) => {
    try {
      const session = getStoredSession();
      if (!session?.user) {
        setError('Not authenticated');
        return;
      }

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      const response = await fetch(
        `${supabaseUrl}/rest/v1/connections?id=eq.${connectionId}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': supabaseKey!,
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status: 'accepted' }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to accept connection');
      }

      // Refresh the data
      await loadConnections();
    } catch (err) {
      console.error('Error accepting request:', err);
      setError('Failed to accept connection request');
    }
  };

  const handleRejectRequest = async (connectionId: string) => {
    try {
      const session = getStoredSession();
      if (!session?.user) {
        setError('Not authenticated');
        return;
      }

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      // Delete the connection request
      const response = await fetch(
        `${supabaseUrl}/rest/v1/connections?id=eq.${connectionId}`,
        {
          method: 'DELETE',
          headers: {
            'apikey': supabaseKey!,
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to reject connection');
      }

      // Refresh the data
      await loadConnections();
    } catch (err) {
      console.error('Error rejecting request:', err);
      setError('Failed to reject connection request');
    }
  };

  const handleFamilyLinkAccept = async (linkId: string) => {
    const session = getStoredSession(); if (!session) return;
    const h = { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' };
    await fetch(`${supabaseUrl}/rest/v1/family_links?id=eq.${linkId}`, { method: 'PATCH', headers: h, body: JSON.stringify({ status: 'accepted' }) });
    setPendingFamilyLinks(prev => prev.filter(l => l.id !== linkId));
    toast('Family link accepted!');
  };

  const handleFamilyLinkDecline = async (linkId: string) => {
    const session = getStoredSession(); if (!session) return;
    const h = { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}` };
    await fetch(`${supabaseUrl}/rest/v1/family_links?id=eq.${linkId}`, { method: 'DELETE', headers: h });
    setPendingFamilyLinks(prev => prev.filter(l => l.id !== linkId));
    setSentFamilyLinks(prev => prev.filter(l => l.id !== linkId));
  };

  const handleDeleteConnection = async () => {
    if (!connectionToDelete) return;
    
    try {
      const session = getStoredSession();
      if (!session?.user) return;

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      // Delete connection (works for both directions)
      const response = await fetch(
        `${supabaseUrl}/rest/v1/connections?or=(and(requester_id.eq.${session.user.id},receiver_id.eq.${connectionToDelete.user.id}),and(requester_id.eq.${connectionToDelete.user.id},receiver_id.eq.${session.user.id}))`,
        {
          method: 'DELETE',
          headers: {
            'apikey': supabaseKey!,
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (response.ok) {
        setShowDeleteModal(false);
        setConnectionToDelete(null);
        setSelectedProfile(null);
        await loadConnections(); // Refresh the list
        setError('Connection removed');
        setTimeout(() => setError(''), 3000);
      } else {
        throw new Error('Failed to remove connection');
      }
    } catch (err) {
      console.error('Error removing connection:', err);
      setError('Failed to remove connection');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-transparent">
        <div className="max-w-md mx-auto px-4 pt-2">
          <div className="h-16 flex items-center">
            <div className="w-16 h-4 bg-gray-200 rounded-lg animate-pulse" />
          </div>
          <ConnectionsPageSkeleton />
        </div>
      </div>
    );
  }

  return (
    <ProtectedRoute>
    <div className="min-h-screen bg-transparent">
      <div className="max-w-md mx-auto px-4 pt-2 pb-40">
        <AppHeader title="Connections" />

        {/* Tab bar: Messages | Connections */}
        <div className="flex gap-1 mb-3 bg-white rounded-xl p-1 border border-gray-200">
          <button
            onClick={() => router.push('/messages')}
            className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all text-gray-500 hover:text-gray-700"
          >
            Messages
          </button>
          <div className="flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center bg-emerald-600 text-white shadow-sm">
            Connections
          </div>
        </div>



        {/* Search + expand button */}
        <div className="flex items-center gap-2 mb-2">
          <input
            type="text"
            placeholder="Search connections..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          />
          <button
            onClick={() => setShowConnectPanel(v => !v)}
            className="relative flex items-center justify-center w-9 h-9 bg-white border border-gray-200 rounded-xl text-gray-600 hover:border-emerald-300 hover:text-emerald-600 transition-all font-bold text-lg flex-shrink-0"
          >
            {showConnectPanel ? '×' : '+'}
            {(pendingRequests.length + pendingFamilyLinks.length) > 0 && !showConnectPanel && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full h-4 w-4 flex items-center justify-center border border-white leading-none">
                {(pendingRequests.length + pendingFamilyLinks.length) > 9 ? '9+' : pendingRequests.length + pendingFamilyLinks.length}
              </span>
            )}
          </button>
        </div>

        {/* Collapsed tab panel */}
        {showConnectPanel && (
          <div className="flex gap-1 mb-3 bg-white rounded-xl p-1 border border-gray-200">
            <button
              onClick={() => { setActiveTab('connections'); setShowConnectPanel(false); }}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${activeTab === 'connections' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Connections ({filteredConnections.length})
            </button>
            <button
              onClick={() => { setActiveTab('requests'); setShowConnectPanel(false); }}
              className={`relative flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${activeTab === 'requests' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Requests
              {(pendingRequests.length + pendingFamilyLinks.length) > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full h-4 w-4 flex items-center justify-center border border-white leading-none">
                  {(pendingRequests.length + pendingFamilyLinks.length) > 9 ? '9+' : pendingRequests.length + pendingFamilyLinks.length}
                </span>
              )}
            </button>
            <button
              onClick={() => { setActiveTab('sent'); setShowConnectPanel(false); }}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${activeTab === 'sent' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Sent ({filteredSentRequests.length + sentFamilyLinks.length})
            </button>
            <button
              onClick={() => { setActiveTab('map'); setShowConnectPanel(false); }}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${activeTab === 'map' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Map
            </button>
          </div>
        )}

        {/* Multi-select header */}
        {isMultiSelectMode && (
          <div className="bg-emerald-600 text-white rounded-xl p-4 mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="font-medium">
                {selectedConnections.size} connection{selectedConnections.size !== 1 ? 's' : ''} selected
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={sendMessageToSelected}
                disabled={selectedConnections.size === 0}
                className="px-4 py-2 bg-white text-emerald-600 rounded-lg font-medium hover:bg-gray-100 disabled:opacity-50 text-sm"
              >
                Message
              </button>
              <button
                onClick={exitMultiSelect}
                className="px-4 py-2 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-400 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Main Content */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Connections Tab */}
        {activeTab === 'connections' && (
          <div className="space-y-4">
            {filteredConnections.length === 0 ? (
              searchTerm ? (
                <div className="text-center py-10 px-6">                  <p className="font-semibold text-gray-700 mb-1">No connections match &ldquo;{searchTerm}&rdquo;</p>
                  <p className="text-sm text-gray-500">Try a different name.</p>
                </div>
              ) : (
                <div className="text-center py-12 px-6">                  <p className="font-semibold text-gray-800 mb-1">No connections yet</p>
                  <p className="text-sm text-gray-500">Head to Discover to find families in your area and send a connection request.</p>
                </div>
              )
            ) : (
              filteredConnections.map((connection) => {
                const isSelected = selectedConnections.has(connection.id);
                let longPressTimer: NodeJS.Timeout | null = null;

                const handleTouchStart = () => {
                  longPressTimer = setTimeout(() => {
                    handleLongPress(connection.id);
                  }, 1000); // 1 second long press
                };

                const handleTouchEnd = () => {
                  if (longPressTimer) {
                    clearTimeout(longPressTimer);
                  }
                };

                const handleClick = () => {
                  if (isMultiSelectMode) {
                    toggleConnectionSelection(connection.id);
                  } else {
                    setSelectedProfile(connection);
                  }
                };

                return (
                  <div 
                    key={connection.id} 
                    className={`rounded-xl p-3 border transition-all ${
                      isSelected ? 'ring-2 ring-emerald-500 bg-emerald-50/60 border-emerald-200' : 'bg-white/40 backdrop-blur-sm border-white/60 hover:bg-white/60 active:scale-[0.99]'
                    }`}
                    onTouchStart={handleTouchStart}
                    onTouchEnd={handleTouchEnd}
                    onMouseDown={handleTouchStart}
                    onMouseUp={handleTouchEnd}
                    onMouseLeave={handleTouchEnd}
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        {isMultiSelectMode && (
                          <div className="absolute -top-2 -right-2 z-10">
                            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                              isSelected 
                                ? 'bg-emerald-600 border-emerald-600' 
                                : 'bg-white border-gray-300'
                            }`}>
                              {isSelected && (
                                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </div>
                          </div>
                        )}
                        <div
                          className="cursor-pointer"
                          onClick={handleClick}
                        >
                          <AvatarUpload
                            userId={connection.user.id}
                            currentAvatarUrl={connection.user.avatar_url}
                            name={connection.user.family_name || connection.user.display_name}
                            size="md"
                            editable={false}
                            viewable={true}
                          />
                        </div>
                      </div>
                      <div 
                        className="flex-1 cursor-pointer"
                        onClick={handleClick}
                      >
                        <h3 className="font-semibold text-emerald-600 text-sm leading-tight">
                          {connection.user.family_name || connection.user.display_name}
                        </h3>
                        <p className="text-xs text-gray-500 mb-0.5">{connection.user.location_name}</p>
                        
                        {/* Children dots with ages */}
                        {connection.user.kids_ages && connection.user.kids_ages.length > 0 && (
                          <div className="flex items-center gap-1">
                            {connection.user.kids_ages.map((age, index) => (
                              <div key={index} className="w-5 h-5 bg-emerald-100 rounded-full flex items-center justify-center">
                                <span className="font-medium text-emerald-700" style={{ fontSize: '10px' }}>{age}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      {!isMultiSelectMode && (
                        <div className="flex justify-end">
                          <button
                            onClick={() => {
                              setSelectedConnectionForMessage(connection);
                              setShowMessageModal(true);
                            }}
                            className="text-gray-400 hover:text-emerald-500 transition-colors"
                            aria-label="Message"
                          >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Requests Tab */}
        {activeTab === 'requests' && (
          <div className="space-y-4">
            {/* Family link requests */}
            {pendingFamilyLinks.map(fl => (
              <div key={fl.id} className="bg-white rounded-xl shadow-sm border border-amber-100 p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-base font-bold text-amber-700 flex-shrink-0 overflow-hidden">
                    {fl.avatar_url ? <img src={fl.avatar_url} className="w-full h-full object-cover" alt={fl.name} /> : fl.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 text-sm">{fl.name}</h3>
                    <p className="text-xs text-gray-500">Wants to link as family · <span className="font-medium text-amber-700">{fl.relationship}</span></p>
                  </div>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 flex-shrink-0">Family</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleFamilyLinkAccept(fl.id)} className="flex-1 px-2 py-1.5 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 text-sm">Accept</button>
                  <button onClick={() => handleFamilyLinkDecline(fl.id)} className="flex-1 px-2 py-1.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 text-sm">Decline</button>
                </div>
              </div>
            ))}

            {filteredPendingRequests.length === 0 && pendingFamilyLinks.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-gray-100 rounded-full mx-auto mb-4 flex items-center justify-center">
                  <span className="text-2xl font-bold text-emerald-600">R</span>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {searchTerm ? 'No Results Found' : 'No Pending Requests'}
                </h3>
                <p className="text-gray-600">
                  {searchTerm 
                    ? `No requests match "${searchTerm}". Try a different search term.`
                    : 'Connection requests will appear here.'
                  }
                </p>
              </div>
            ) : (
              filteredPendingRequests.map((request) => (
                <div key={request.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                  <div className="flex items-center gap-3">
                    <AvatarUpload
                      userId={request.user.id}
                      currentAvatarUrl={request.user.avatar_url}
                      name={request.user.family_name || request.user.display_name}
                      size="md"
                      editable={false}
                            viewable={true}
                    />
                    <div className="flex-1">
                      <h3 className="font-semibold text-emerald-600">
                        {request.user.family_name || request.user.display_name}
                      </h3>
                      <p className="text-sm text-gray-600">{request.user.location_name}</p>
                      
                      {/* Children dots with ages */}
                      {request.user.kids_ages && request.user.kids_ages.length > 0 && (
                        <div className="flex items-center gap-1 mt-1">
                          {request.user.kids_ages.map((age, index) => (
                            <div key={index} className="flex items-center">
                              <div className="w-6 h-6 bg-emerald-100 rounded-full flex items-center justify-center">
                                <span className="text-xs font-medium text-emerald-700">{age}</span>
                              </div>
                              {index < (request.user.kids_ages?.length || 0) - 1 && <div className="w-1 h-1 bg-gray-300 rounded-full mx-1"></div>}
                            </div>
                          ))}
                        </div>
                      )}
                      
                      <p className="text-xs text-gray-500 mt-1">
                        Wants to connect with you
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => handleAcceptRequest(request.id)}
                      className="flex-1 px-2 py-1.5 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 text-sm"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => handleRejectRequest(request.id)}
                      className="flex-1 px-2 py-1.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 text-sm"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Sent Requests Tab */}
        {activeTab === 'sent' && (
          <div className="space-y-4">
            {/* Sent family link requests */}
            {sentFamilyLinks.map(fl => (
              <div key={fl.id} className="bg-white rounded-xl shadow-sm border border-amber-100 p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-base font-bold text-amber-700 flex-shrink-0 overflow-hidden">
                    {fl.avatar_url ? <img src={fl.avatar_url} className="w-full h-full object-cover" alt={fl.name} /> : fl.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 text-sm">{fl.name}</h3>
                    <p className="text-xs text-gray-500">Family request sent · <span className="font-medium text-amber-700">{fl.relationship}</span></p>
                  </div>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 flex-shrink-0">Family</span>
                </div>
                <button onClick={() => handleFamilyLinkDecline(fl.id)} className="w-full px-4 py-1.5 bg-red-50 text-red-600 rounded-lg font-medium hover:bg-red-100 text-sm border border-red-100">
                  Cancel request
                </button>
              </div>
            ))}

            {filteredSentRequests.length === 0 && sentFamilyLinks.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-gray-100 rounded-full mx-auto mb-4 flex items-center justify-center">
                  <span className="text-2xl font-bold text-emerald-600">S</span>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {searchTerm ? 'No Results Found' : 'No Sent Requests'}
                </h3>
                <p className="text-gray-600">
                  {searchTerm 
                    ? `No requests match "${searchTerm}". Try a different search term.`
                    : 'Connection requests you\'ve sent will appear here.'
                  }
                </p>
              </div>
            ) : (
              filteredSentRequests.map((request) => (
                <div key={request.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                  <div className="flex items-center gap-3">
                    <AvatarUpload
                      userId={request.user.id}
                      currentAvatarUrl={request.user.avatar_url}
                      name={request.user.family_name || request.user.display_name}
                      size="md"
                      editable={false}
                            viewable={true}
                    />
                    <div className="flex-1">
                      <h3 className="font-semibold text-emerald-600">
                        {request.user.family_name || request.user.display_name}
                      </h3>
                      <p className="text-sm text-gray-600">{request.user.location_name}</p>
                      
                      {/* Children dots with ages */}
                      {request.user.kids_ages && request.user.kids_ages.length > 0 && (
                        <div className="flex items-center gap-1 mt-1">
                          {request.user.kids_ages.map((age, index) => (
                            <div key={index} className="flex items-center">
                              <div className="w-6 h-6 bg-emerald-100 rounded-full flex items-center justify-center">
                                <span className="text-xs font-medium text-emerald-700">{age}</span>
                              </div>
                              {index < (request.user.kids_ages?.length || 0) - 1 && <div className="w-1 h-1 bg-gray-300 rounded-full mx-1"></div>}
                            </div>
                          ))}
                        </div>
                      )}
                      
                      <p className="text-xs text-gray-500 mt-1">
                        Request sent • Waiting for response
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => handleRejectRequest(request.id)}
                      className="flex-1 px-4 py-2 bg-red-100 text-red-700 rounded-lg font-medium hover:bg-red-200 text-sm"
                    >
                      Cancel Request
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
      
      {/* Remove functionality has been removed */}

      {/* Profile Modal */}
      {selectedProfile && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[80vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-white rounded-t-2xl p-6 pb-4 border-b border-gray-100">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-gray-900">Profile Details</h2>
                <button
                  onClick={() => setSelectedProfile(null)}
                  className="text-gray-400 hover:text-gray-600 text-2xl"
                >
                  X
                </button>
              </div>
            </div>
            
            {/* Content */}
            <div className="p-6">
              {/* User Info */}
              <div className="flex items-start gap-4 mb-6">
                <AvatarUpload
                  userId={selectedProfile.user.id}
                  currentAvatarUrl={selectedProfile.user.avatar_url}
                  name={selectedProfile.user.family_name || selectedProfile.user.display_name || 'Family'}
                  size="lg"
                  editable={false}
                            viewable={true}
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-xl font-semibold text-emerald-600">
                      {selectedProfile.user.display_name || selectedProfile.user.family_name}
                    </h3>
                  </div>
                  <p className="text-sm text-gray-500">
                    Connected
                  </p>
                </div>
              </div>

              {/* Location */}
              <div className="mb-6">
                <h4 className="font-semibold text-gray-900 mb-2">Location</h4>
                <p className="text-gray-700">{selectedProfile.user.location_name}</p>
              </div>

              {/* Children */}
              {selectedProfile.user.kids_ages && selectedProfile.user.kids_ages.length > 0 && (
                <div className="mb-6">
                  <h4 className="font-semibold text-gray-900 mb-3">Children</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedProfile.user.kids_ages.map((age, index) => (
                      <div key={index} className="bg-emerald-50 border border-emerald-200 rounded-full px-3 py-2">
                        <span className="text-emerald-700 font-medium">{age} years old</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setSelectedConnectionForMessage(selectedProfile);
                    setShowMessageModal(true);
                    setSelectedProfile(null);
                  }}
                  className="flex-1 px-2 py-1.5 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-colors text-sm"
                >
                  Message
                </button>
                <button
                  onClick={() => { setProfileCardUserId(selectedProfile.user.id); setSelectedProfile(null); }}
                  className="flex-1 px-2 py-1.5 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors text-sm"
                >
                  Profile
                </button>
                <button
                  onClick={() => {
                    setConnectionToDelete(selectedProfile);
                    setShowDeleteModal(true);
                  }}
                  className="px-2 py-1.5 bg-red-100 text-red-600 rounded-xl font-medium hover:bg-red-200 transition-colors text-sm"
                >
                  Delete
                </button>
                {selectedProfile.user.show_birthday && selectedProfile.user.dob && (
                  <button
                    onClick={() => addBirthdayToCalendar(selectedProfile.user)}
                    className="px-2 py-1.5 bg-white text-pink-500 border border-pink-200 rounded-xl hover:bg-pink-50 transition-colors"
                    title="Add birthday to calendar"
                  >
                    <svg className="w-6 h-6" viewBox="0 -1 24 25" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 6 C5.5 5 5.5 1 8 -0.5 C10.5 1 10.5 5 8 6Z" fill="currentColor" stroke="none" />
                    <rect x="7" y="6" width="2" height="4" rx="0.5" />
                    <path d="M16 6 C13.5 5 13.5 1 16 -0.5 C18.5 1 18.5 5 16 6Z" fill="currentColor" stroke="none" />
                    <rect x="15" y="6" width="2" height="4" rx="0.5" />
                    <rect x="2" y="10" width="20" height="12" rx="2" />
                    <path d="M2 13 Q5.5 11 9 13 Q12 15 15 13 Q18.5 11 22 13" strokeWidth={1.4} />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Haven-themed Delete Confirmation Modal */}
      {showDeleteModal && connectionToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-md" onClick={() => { setShowDeleteModal(false); setConnectionToDelete(null); }} />
          <div className="relative w-full max-w-xs rounded-3xl shadow-2xl border border-white/40 px-5 py-6" style={{ background: 'rgba(255,255,255,0.88)', backdropFilter: 'blur(32px) saturate(1.6)', WebkitBackdropFilter: 'blur(32px) saturate(1.6)' }}>
            <p className="text-sm font-medium text-gray-800 text-center mb-1 leading-relaxed">
              Remove connection with <span className="font-semibold">{connectionToDelete.user.family_name || connectionToDelete.user.display_name}</span>?
            </p>
            <p className="text-xs text-gray-400 text-center mb-5">This cannot be undone.</p>
            <div className="flex gap-2">
              <button onClick={() => { setShowDeleteModal(false); setConnectionToDelete(null); }} className="flex-1 py-2.5 bg-white/60 text-gray-600 rounded-2xl font-semibold text-sm border border-white/60 hover:bg-white/80 transition-colors">Cancel</button>
              <button onClick={handleDeleteConnection} className="flex-1 py-2.5 bg-red-500 text-white rounded-2xl font-semibold text-sm hover:bg-red-600 transition-colors">Remove</button>
            </div>
          </div>
        </div>
      )}

      {/* Send Message Modal */}
      {showMessageModal && (selectedConnectionForMessage || (isMultiSelectMode && selectedConnections.size > 0)) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            {isMultiSelectMode && selectedConnections.size > 1 ? (
              <div className="mb-4">
                <h3 className="font-semibold text-emerald-600 mb-2">
                  Send message to {selectedConnections.size} connections
                </h3>
                <div className="flex flex-wrap gap-2">
                  {filteredConnections
                    .filter(conn => selectedConnections.has(conn.id))
                    .map((conn) => (
                      <div key={conn.id} className="flex items-center gap-1 bg-emerald-50 px-2 py-1 rounded-full">
                        <div className="w-6 h-6">
                          <AvatarUpload
                            userId={conn.user.id}
                            currentAvatarUrl={conn.user.avatar_url}
                            name={conn.user.family_name || conn.user.display_name || 'User'}
                            size="sm"
                            editable={false}
                            viewable={true}
                          />
                        </div>
                        <span className="text-xs text-emerald-700 font-medium">
                          {conn.user.family_name?.split(' ')[0] || conn.user.display_name}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            ) : selectedConnectionForMessage ? (
              <div className="flex items-center gap-3 mb-4">
                <AvatarUpload
                  userId={selectedConnectionForMessage.user.id}
                  currentAvatarUrl={selectedConnectionForMessage.user.avatar_url}
                  name={selectedConnectionForMessage.user.family_name || selectedConnectionForMessage.user.display_name || 'User'}
                  size="md"
                  editable={false}
                            viewable={true}
                />
                <div>
                  <h3 className="font-semibold text-emerald-600">
                    {selectedConnectionForMessage.user.display_name || 
                     selectedConnectionForMessage.user.family_name?.split(' ')[0] || 
                     selectedConnectionForMessage.user.family_name}
                  </h3>
                  <p className="text-sm text-gray-600">{selectedConnectionForMessage.user.location_name}</p>
                </div>
              </div>
            ) : null}
            
            <div className="mb-4">
              <textarea
                id="messageInput"
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder="Type your message..."
                className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
                rows={4}
                maxLength={500}
              />
              <p className="text-xs text-gray-500 mt-1">
                {messageText.length}/500 characters
              </p>
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowMessageModal(false);
                  setSelectedConnectionForMessage(null);
                  setMessageText('');
                  if (isMultiSelectMode) {
                    exitMultiSelect();
                  }
                }}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={sendMessage}
                disabled={!messageText.trim() || sendingMessage}
                className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {sendingMessage 
                  ? 'Sending...' 
                  : isMultiSelectMode && selectedConnections.size > 1 
                    ? `Send to ${selectedConnections.size} connections`
                    : 'Send Message'
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Message */}
      {showSuccessMessage && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50">
          <p className="font-medium">{successMessageText}</p>
        </div>
      )}
      
      {/* Invite a friend — sticky above nav */}
      <div className="fixed bottom-16 left-0 right-0 z-30 px-4 pb-2 max-w-md mx-auto" style={{ left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: '28rem' }}>
        <InviteToHaven />
      </div>

        {activeTab === 'map' && (
          <ConnectionsMap connections={connections} />
        )}

      {profileCardUserId && (
        <ProfileCardModal
          userId={profileCardUserId}
          onClose={() => setProfileCardUserId(null)}
          currentUserId={getStoredSession()?.user?.id}
        />
      )}
    </div>
    </ProtectedRoute>
  );
}

// Map component for connections — matches Discover map style
function ConnectionsMap({ connections }: { connections: Connection[] }) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const userMarkerRef = useRef<any>(null);

  const mapped = connections.filter(c => c.user.location_lat && c.user.location_lng);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;
    import('mapbox-gl').then(({ default: mapboxgl }) => {
      if (!mapContainer.current) return;
      const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
      if (!token) return;

      // Block Mapbox telemetry
      if (typeof window !== 'undefined' && !(window as any).__mapboxFetchPatched) {
        (window as any).__mapboxFetchPatched = true;
        const originalFetch = window.fetch.bind(window);
        window.fetch = function(input: RequestInfo | URL, init?: RequestInit) {
          const url = typeof input === 'string' ? input : input.toString();
          if (url.includes('events.mapbox.com') || url.includes('/events/v2') || url.includes('mapbox-turnstile')) {
            return Promise.resolve(new Response('{}', { status: 200 }));
          }
          return originalFetch(input, init);
        };
      }

      mapboxgl.accessToken = token;

      const lngs = mapped.map(c => c.user.location_lng!);
      const lats = mapped.map(c => c.user.location_lat!);
      const centerLng = lngs.length > 0 ? lngs.reduce((a, b) => a + b, 0) / lngs.length : 144.33;
      const centerLat = lats.length > 0 ? lats.reduce((a, b) => a + b, 0) / lats.length : -38.33;

      const map = new mapboxgl.Map({
        container: mapContainer.current!,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [centerLng, centerLat],
        zoom: mapped.length > 0 ? 9 : 8,
      });

      mapRef.current = map;

      // Zoom controls (top-right, matches Discover)
      map.addControl(new mapboxgl.NavigationControl(), 'top-right');

      // Locate me button
      const geolocate = new mapboxgl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: false,
        showAccuracyCircle: false,
      });
      map.addControl(geolocate, 'top-right');

      map.on('load', () => {
        // User location marker (shown when geolocate fires)
        geolocate.on('geolocate', (e: any) => {
          const { longitude, latitude } = e.coords;
          if (userMarkerRef.current) userMarkerRef.current.remove();
          const el = document.createElement('div');
          el.style.cssText = 'width:14px;height:14px;background:#10b981;border-radius:50%;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);';
          el.title = 'Your location';
          userMarkerRef.current = new mapboxgl.Marker({ element: el })
            .setLngLat([longitude, latitude])
            .addTo(map);
        });

        // Connection pins
        mapped.forEach(conn => {
          const el = document.createElement('div');
          el.style.cssText = `
            width:40px;height:40px;border-radius:50%;overflow:hidden;
            border:3px solid #10b981;cursor:pointer;
            box-shadow:0 2px 8px rgba(0,0,0,0.25);background:#d1fae5;
          `;
          if (conn.user.avatar_url) {
            el.style.backgroundImage = `url(${conn.user.avatar_url})`;
            el.style.backgroundSize = 'cover';
            el.style.backgroundPosition = 'center';
          } else {
            // Use textContent to avoid XSS from user-supplied name data
            const inner = document.createElement('div');
            inner.style.cssText = 'width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;color:#065f46;';
            inner.textContent = (conn.user.display_name || conn.user.family_name || '?').charAt(0).toUpperCase();
            el.appendChild(inner);
          }

          // Build popup using DOM nodes to avoid XSS from user-supplied name/location data
          const popupEl = document.createElement('div');
          popupEl.style.cssText = 'padding:4px 2px;';
          const nameEl = document.createElement('p');
          nameEl.style.cssText = 'font-weight:600;font-size:13px;margin:0 0 2px;';
          nameEl.textContent = conn.user.display_name || conn.user.family_name || '';
          const locEl = document.createElement('p');
          locEl.style.cssText = 'font-size:11px;color:#6b7280;margin:0 0 6px;';
          locEl.textContent = conn.user.location_name || '';
          const msgBtn = document.createElement('button');
          msgBtn.style.cssText = 'background:#10b981;color:white;border:none;padding:4px 10px;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;';
          msgBtn.textContent = 'Message';
          msgBtn.addEventListener('click', () => { window.location.href = `/messages?open=${conn.user.id}`; });
          popupEl.appendChild(nameEl);
          popupEl.appendChild(locEl);
          popupEl.appendChild(msgBtn);

          const popup = new mapboxgl.Popup({ offset: 24, closeButton: false })
            .setDOMContent(popupEl);

          new mapboxgl.Marker({ element: el })
            .setLngLat([conn.user.location_lng!, conn.user.location_lat!])
            .setPopup(popup)
            .addTo(map);
        });
      });
    });

    return () => {
      userMarkerRef.current?.remove();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  if (mapped.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="w-16 h-16 bg-emerald-50 rounded-2xl mx-auto mb-4 flex items-center justify-center">
          <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
        <h3 className="text-base font-semibold text-gray-800 mb-1">No location data yet</h3>
        <p className="text-sm text-gray-500 max-w-xs mx-auto">Once your connections set their location, they'll show up here.</p>
      </div>
    );
  }

  return (
    <div>
      <div
        ref={mapContainer}
        className="w-full rounded-2xl overflow-hidden border border-gray-200"
        style={{ height: '65vh' }}
      />
      <p className="text-xs text-gray-400 text-center mt-2">{mapped.length} of {connections.length} connections have a location set</p>
    </div>
  );
}