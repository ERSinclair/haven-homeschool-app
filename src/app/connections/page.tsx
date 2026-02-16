'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredSession } from '@/lib/session';
import AvatarUpload from '@/components/AvatarUpload';
import HavenHeader from '@/components/HavenHeader';
import ProtectedRoute from '@/components/ProtectedRoute';

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
  const router = useRouter();

  useEffect(() => {
    loadConnections();
  }, []);

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
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <ProtectedRoute>
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white">
      <div className="max-w-md mx-auto px-4 py-8">
        <HavenHeader />

        {/* Expandable Search Bar */}
        {showSearch && (
          <div className="mb-6">
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

        {/* Main View Toggle with Search */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-hide justify-center">
          <button
            onClick={() => router.push('/messages')}
            className="px-6 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all shadow-sm min-w-fit flex items-center justify-center bg-white text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 border border-gray-200 hover:border-emerald-200 hover:shadow-md hover:scale-105"
          >
            Messages
          </button>
          <button
            onClick={() => setShowSearch(!showSearch)}
            className={`px-6 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all shadow-sm min-w-fit flex items-center justify-center ${
              showSearch || searchTerm
                ? 'bg-teal-600 text-white shadow-md scale-105'
                : 'bg-white text-gray-700 hover:bg-teal-50 hover:text-teal-700 border border-gray-200 hover:border-teal-200 hover:shadow-md hover:scale-105'
            }`}
          >
            Search
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-2 scrollbar-hide justify-center">
            <button
              onClick={() => setActiveTab('connections')}
              className={`px-6 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all shadow-sm min-w-fit flex items-center justify-center ${
                activeTab === 'connections'
                  ? 'bg-teal-600 text-white shadow-md scale-105'
                  : 'bg-white text-gray-700 hover:bg-teal-50 hover:text-teal-700 border border-gray-200 hover:border-teal-200 hover:shadow-md hover:scale-105'
              }`}
            >
              Connections ({filteredConnections.length})
            </button>
            <button
              onClick={() => setActiveTab('requests')}
              className={`px-6 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all shadow-sm min-w-fit flex items-center justify-center gap-2 ${
                activeTab === 'requests'
                  ? 'bg-teal-600 text-white shadow-md scale-105'
                  : 'bg-white text-gray-700 hover:bg-teal-50 hover:text-teal-700 border border-gray-200 hover:border-teal-200 hover:shadow-md hover:scale-105'
              }`}
            >
              Requests
              {pendingRequests.length > 0 ? (
                <span className="bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 min-w-[20px] flex items-center justify-center border-2 border-white shadow-sm flex-shrink-0">
                  {pendingRequests.length > 9 ? '9+' : pendingRequests.length}
                </span>
              ) : (
                <span>(0)</span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('sent')}
              className={`px-6 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all shadow-sm min-w-fit flex items-center justify-center ${
                activeTab === 'sent'
                  ? 'bg-teal-600 text-white shadow-md scale-105'
                  : 'bg-white text-gray-700 hover:bg-teal-50 hover:text-teal-700 border border-gray-200 hover:border-teal-200 hover:shadow-md hover:scale-105'
              }`}
            >
              Sent ({filteredSentRequests.length})
            </button>
          </div>

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
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-gray-100 rounded-full mx-auto mb-4 flex items-center justify-center">
                  <span className="text-2xl font-bold text-emerald-600">C</span>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {searchTerm ? 'No Results Found' : 'No Connections Yet'}
                </h3>
                <p className="text-gray-600 mb-4">
                  {searchTerm 
                    ? `No connections match "${searchTerm}". Try a different search term.`
                    : 'Start connecting with other families to build your network.'
                  }
                </p>
                {!searchTerm && (
                  <button
                    onClick={() => router.push('/discover')}
                    className="px-6 py-2 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700"
                  >
                    Find Families
                  </button>
                )}
              </div>
            ) : (
              filteredConnections.map((connection) => (
                <div key={connection.id} className="bg-white rounded-xl shadow-sm p-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="cursor-pointer"
                      onClick={() => setSelectedProfile(connection)}
                    >
                      <AvatarUpload
                        userId={connection.user.id}
                        currentAvatarUrl={connection.user.avatar_url}
                        name={connection.user.family_name || connection.user.display_name}
                        size="md"
                        editable={false}
                      />
                    </div>
                    <div 
                      className="flex-1 cursor-pointer"
                      onClick={() => setSelectedProfile(connection)}
                    >
                      <h3 className="font-semibold text-emerald-600">
                        {connection.user.family_name || connection.user.display_name}
                      </h3>
                      <p className="text-sm text-gray-600 mb-1">{connection.user.location_name}</p>
                      
                      {/* Children dots with ages */}
                      {connection.user.kids_ages && connection.user.kids_ages.length > 0 && (
                        <div className="flex items-center gap-1">
                          {connection.user.kids_ages.map((age, index) => (
                            <div key={index} className="flex items-center">
                              <div className="w-6 h-6 bg-teal-100 rounded-full flex items-center justify-center">
                                <span className="text-xs font-medium text-teal-700">{age}</span>
                              </div>
                              {index < (connection.user.kids_ages?.length || 0) - 1 && <div className="w-1 h-1 bg-gray-300 rounded-full mx-1"></div>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex justify-end">
                      <button
                        onClick={() => router.push(`/messages?open=${connection.user.id}`)}
                        className="px-4 py-2 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700 transition-colors text-sm"
                      >
                        Message
                      </button>
                    </div>
                  </div>
                </div>
              ))
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
                <div key={request.id} className="bg-white rounded-xl shadow-sm p-4">
                  <div className="flex items-center gap-3">
                    <AvatarUpload
                      userId={request.user.id}
                      currentAvatarUrl={request.user.avatar_url}
                      name={request.user.family_name || request.user.display_name}
                      size="md"
                      editable={false}
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
                              <div className="w-6 h-6 bg-teal-100 rounded-full flex items-center justify-center">
                                <span className="text-xs font-medium text-teal-700">{age}</span>
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
                      className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700 text-sm"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => handleRejectRequest(request.id)}
                      className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 text-sm"
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
                <div key={request.id} className="bg-white rounded-xl shadow-sm p-4">
                  <div className="flex items-center gap-3">
                    <AvatarUpload
                      userId={request.user.id}
                      currentAvatarUrl={request.user.avatar_url}
                      name={request.user.family_name || request.user.display_name}
                      size="md"
                      editable={false}
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
                              <div className="w-6 h-6 bg-teal-100 rounded-full flex items-center justify-center">
                                <span className="text-xs font-medium text-teal-700">{age}</span>
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
                      <div key={index} className="bg-teal-50 border border-teal-200 rounded-full px-3 py-2">
                        <span className="text-teal-700 font-medium">{age} years old</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    router.push(`/messages?open=${selectedProfile.user.id}`);
                    setSelectedProfile(null);
                  }}
                  className="flex-1 px-6 py-3 bg-teal-600 text-white rounded-xl font-medium hover:bg-teal-700 transition-colors"
                >
                  Message
                </button>
                <button
                  onClick={() => {
                    setConnectionToDelete(selectedProfile);
                    setShowDeleteModal(true);
                  }}
                  className="px-4 py-3 bg-red-100 text-red-600 rounded-xl font-medium hover:bg-red-200 transition-colors"
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
    </div>
    </ProtectedRoute>
  );
}