'use client';
import { toast } from '@/lib/toast';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getStoredSession } from '@/lib/session';
import AvatarUpload from '@/components/AvatarUpload';
import AppHeader from '@/components/AppHeader';
import ProtectedRoute from '@/components/ProtectedRoute';
import { ConnectionsPageSkeleton } from '@/components/SkeletonLoader';

type Connection = {
  id: string;
  user: {
    id: string;
    family_name: string;
    display_name: string;
    location_name: string;
    avatar_url?: string;
    kids_ages?: number[];
  };
  status: 'pending' | 'accepted' | 'blocked';
  created_at: string;
  is_requester: boolean;
};

export default function ConnectionsPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [pendingRequests, setPendingRequests] = useState<Connection[]>([]);
  const [sentRequests, setSentRequests] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'connections' | 'requests' | 'sent'>('connections');
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showSearch, setShowSearch] = useState(false);
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
        `${supabaseUrl}/rest/v1/connections?status=eq.accepted&or=(requester_id.eq.${session.user.id},receiver_id.eq.${session.user.id})&select=*,requester:profiles!connections_requester_id_fkey(id,family_name,display_name,location_name,avatar_url,kids_ages),receiver:profiles!connections_receiver_id_fkey(id,family_name,display_name,location_name,avatar_url,kids_ages)`,
        {
          headers: {
            'apikey': supabaseKey!,
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      // Load pending connection requests (where current user is the receiver)
      const requestsResponse = await fetch(
        `${supabaseUrl}/rest/v1/connections?status=eq.pending&receiver_id=eq.${session.user.id}&select=*,requester:profiles!connections_requester_id_fkey(id,family_name,display_name,location_name,avatar_url,kids_ages)`,
        {
          headers: {
            'apikey': supabaseKey!,
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      // Load sent connection requests (where current user is the requester)
      const sentResponse = await fetch(
        `${supabaseUrl}/rest/v1/connections?status=eq.pending&requester_id=eq.${session.user.id}&select=*,receiver:profiles!connections_receiver_id_fkey(id,family_name,display_name,location_name,avatar_url,kids_ages)`,
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
    } catch (err) {
      console.error('Error loading connections:', err);
      setError('Failed to load connections');
    } finally {
      setLoading(false);
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
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white">
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
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white">
      <div className="max-w-md mx-auto px-4 pt-2 pb-8">
        <AppHeader />

        {/* Main View Toggle with Search */}
        <div className="flex gap-1 mb-3 bg-white rounded-xl p-1 border border-gray-200">
          <button
            onClick={() => router.push('/messages')}
            className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all text-gray-500 hover:text-gray-700"
          >
            Messages
          </button>
          <button
            onClick={() => setShowSearch(!showSearch)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              showSearch || searchTerm ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Search
          </button>
        </div>

        {/* Expandable Search Bar — opens below the Search button */}
        {showSearch && (
          <div className="mb-3">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                placeholder="Search connections..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                autoFocus
              />
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex gap-1 mb-4 bg-white rounded-xl p-1 border border-gray-200">
          <button
            onClick={() => setActiveTab('connections')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'connections' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Connections ({filteredConnections.length})
          </button>
          <button
            onClick={() => setActiveTab('requests')}
            className={`relative flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'requests' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Requests
            {pendingRequests.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full h-4 w-4 flex items-center justify-center border border-white leading-none">
                {pendingRequests.length > 9 ? '9+' : pendingRequests.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('sent')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'sent' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Sent ({filteredSentRequests.length})
          </button>
        </div>

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
                <div className="text-center py-10 px-6">
                  <div className="text-3xl mb-2">🔍</div>
                  <p className="font-semibold text-gray-700 mb-1">No connections match &ldquo;{searchTerm}&rdquo;</p>
                  <p className="text-sm text-gray-500">Try a different name.</p>
                </div>
              ) : (
                <div className="text-center py-12 px-6">
                  <div className="text-4xl mb-3">🤝</div>
                  <p className="font-semibold text-gray-800 mb-1">No connections yet</p>
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
                    className={`bg-white rounded-xl shadow-sm p-3 border transition-all ${
                      isSelected ? 'ring-2 ring-emerald-500 bg-emerald-50 border-emerald-200' : 'border-gray-100 hover:shadow-md hover:border-gray-200 active:scale-[0.99]'
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
                            className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-colors text-sm"
                          >
                            Message
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
            {filteredPendingRequests.length === 0 ? (
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
            {filteredSentRequests.length === 0 ? (
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
                  onClick={() => {
                    window.location.href = `/profile?user=${selectedProfile.user.id}`;
                  }}
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
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Haven-themed Delete Confirmation Modal */}
      {showDeleteModal && connectionToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-red-600">!</span>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Remove Connection?</h3>
              <p className="text-gray-600 mb-6">
                Are you sure you want to remove your connection with{' '}
                <span className="font-medium text-emerald-600">
                  {connectionToDelete.user.family_name || connectionToDelete.user.display_name}
                </span>?
                {' '}This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowDeleteModal(false);
                    setConnectionToDelete(null);
                  }}
                  className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteConnection}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700"
                >
                  Remove
                </button>
              </div>
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
      
      {/* Bottom spacing for mobile nav */}
      <div className="h-20"></div>
    </div>
    </ProtectedRoute>
  );
}