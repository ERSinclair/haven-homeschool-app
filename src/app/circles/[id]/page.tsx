'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { getStoredSession } from '@/lib/session';
import AvatarUpload from '@/components/AvatarUpload';
import HavenHeader from '@/components/HavenHeader';

type Circle = {
  id: string;
  name: string;
  description?: string;
  emoji: string;
  color: string;
  member_count: number;
  last_activity_at: string;
  created_at: string;
  created_by: string;
};

type Member = {
  id: string;
  member_id: string;
  role: 'admin' | 'member';
  joined_at: string;
  profile: {
    family_name: string;
    display_name?: string;
    avatar_url?: string;
    location_name: string;
  };
};

type Message = {
  id: string;
  content: string;
  sender_id: string;
  created_at: string;
  message_type: string;
  sender_profile: {
    family_name: string;
    display_name?: string;
    avatar_url?: string;
  };
};

export default function CirclePage() {
  const params = useParams();
  const router = useRouter();
  const [circle, setCircle] = useState<Circle | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [connections, setConnections] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  
  // Chat functionality
  const [newMessage, setNewMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'members'>('chat');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const circleId = params.id as string;

  // Load circle data
  useEffect(() => {
    const loadCircleData = async () => {
      try {
        const session = getStoredSession();
        if (!session?.user) {
          router.push('/login');
          return;
        }

        setCurrentUserId(session.user.id);

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

        // Load circle details
        const circleRes = await fetch(
          `${supabaseUrl}/rest/v1/circles?id=eq.${circleId}&select=*`,
          {
            headers: {
              'apikey': supabaseKey!,
              'Authorization': `Bearer ${session.access_token}`,
            },
          }
        );

        if (!circleRes.ok) {
          throw new Error('Circle not found');
        }

        const [circleData] = await circleRes.json();
        if (!circleData) {
          throw new Error('Circle not found');
        }

        setCircle(circleData);

        // Load members
        const membersRes = await fetch(
          `${supabaseUrl}/rest/v1/circle_members?circle_id=eq.${circleId}&select=*,profile:member_id(family_name,display_name,avatar_url,location_name)&order=role.desc,joined_at.asc`,
          {
            headers: {
              'apikey': supabaseKey!,
              'Authorization': `Bearer ${session.access_token}`,
            },
          }
        );

        if (membersRes.ok) {
          const membersData = await membersRes.json();
          setMembers(membersData);
          
          // Check if current user is admin
          const currentMember = membersData.find((m: Member) => m.member_id === session.user.id);
          setIsAdmin(currentMember?.role === 'admin');
        }

        // Load recent messages
        const messagesRes = await fetch(
          `${supabaseUrl}/rest/v1/circle_messages?circle_id=eq.${circleId}&select=*,sender_profile:sender_id(family_name,display_name,avatar_url)&order=created_at.desc&limit=50`,
          {
            headers: {
              'apikey': supabaseKey!,
              'Authorization': `Bearer ${session.access_token}`,
            },
          }
        );

        if (messagesRes.ok) {
          const messagesData = await messagesRes.json();
          setMessages(messagesData.reverse()); // Show oldest first
        }

      } catch (err) {
        console.error('Error loading circle:', err);
        setError('Failed to load circle. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    if (circleId) {
      loadCircleData();
    }
  }, [circleId, router]);

  // Function to load connections for inviting to circle
  const loadConnections = async () => {
    try {
      const session = getStoredSession();
      if (!session?.user) return;

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      // Load accepted connections that aren't already in the circle
      const connectionsResponse = await fetch(
        `${supabaseUrl}/rest/v1/connections?status=eq.accepted&or=(requester_id.eq.${session.user.id},receiver_id.eq.${session.user.id})&select=*,requester:profiles!connections_requester_id_fkey(id,family_name,display_name,location_name,avatar_url),receiver:profiles!connections_receiver_id_fkey(id,family_name,display_name,location_name,avatar_url)`,
        {
          headers: {
            'apikey': supabaseKey!,
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (connectionsResponse.ok) {
        const connectionsData = await connectionsResponse.json();
        
        // Process connections (get the other person in each connection)
        const processedConnections = connectionsData.map((conn: any) => ({
          id: conn.id,
          user: conn.requester_id === session.user.id ? conn.receiver : conn.requester,
          status: conn.status,
          created_at: conn.created_at,
          is_requester: conn.requester_id === session.user.id
        }));

        // Filter out users who are already members of this circle
        const memberIds = members.map(m => m.member_id);
        const availableConnections = processedConnections.filter((conn: any) => 
          !memberIds.includes(conn.user.id)
        );

        setConnections(availableConnections);
      }
    } catch (err) {
      console.error('Error loading connections:', err);
    }
  };

  // Load connections when members change (for filtering out existing members)
  useEffect(() => {
    if (members.length > 0) {
      loadConnections();
    }
  }, [members]);

  // Auto scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!newMessage.trim() || sendingMessage) return;

    try {
      setSendingMessage(true);

      const session = getStoredSession();
      if (!session?.user) throw new Error('Not authenticated');

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      const response = await fetch(
        `${supabaseUrl}/rest/v1/circle_messages`,
        {
          method: 'POST',
          headers: {
            'apikey': supabaseKey!,
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
          },
          body: JSON.stringify({
            circle_id: circleId,
            sender_id: session.user.id,
            content: newMessage.trim(),
            message_type: 'text'
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      const [sentMessage] = await response.json();
      
      // Add sender profile info
      const currentMember = members.find(m => m.member_id === session.user.id);
      const messageWithProfile = {
        ...sentMessage,
        sender_profile: currentMember?.profile
      };

      setMessages(prev => [...prev, messageWithProfile]);
      setNewMessage('');

    } catch (err) {
      console.error('Error sending message:', err);
    } finally {
      setSendingMessage(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const openInviteModal = async () => {
    setShowInviteModal(true);
    await loadConnections();
  };

  const inviteMember = async (userId: string) => {
    if (!isAdmin) return;

    setInviteLoading(true);
    try {
      const session = getStoredSession();
      if (!session?.user) throw new Error('Not authenticated');

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      // Send invitation (status = 'pending')
      const response = await fetch(
        `${supabaseUrl}/rest/v1/circle_members`,
        {
          method: 'POST',
          headers: {
            'apikey': supabaseKey!,
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
          },
          body: JSON.stringify({
            circle_id: circleId,
            member_id: userId,
            role: 'member',
            status: 'pending',
            invited_by: session.user.id,
            invited_at: new Date().toISOString()
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to send invitation');
      }

      // Update last activity (but don't increment member count until accepted)
      await fetch(
        `${supabaseUrl}/rest/v1/circles?id=eq.${circleId}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': supabaseKey!,
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            last_activity_at: new Date().toISOString()
          }),
        }
      );

      // Show success message and update UI
      setShowInviteModal(false);
      setError('');
      alert('Circle invitation sent! They will receive a notification to accept or decline.');
      
      // Refresh connections to remove invited user from list
      await loadConnections();

    } catch (err) {
      console.error('Error sending invitation:', err);
      setError('Failed to send invitation');
    } finally {
      setInviteLoading(false);
    }
  };

  const filteredConnections = connections.filter((conn: any) =>
    (conn.user.family_name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (conn.user.display_name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (conn.user.location_name?.toLowerCase() || '').includes(searchTerm.toLowerCase())
  );

  const formatMessageTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  const getColorClasses = (color: string) => {
    const colorMap: Record<string, { bg: string; text: string }> = {
      teal: { bg: 'bg-teal-100', text: 'text-teal-700' },
      blue: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
      emerald: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
      purple: { bg: 'bg-purple-100', text: 'text-purple-700' },
      orange: { bg: 'bg-orange-100', text: 'text-orange-700' },
      pink: { bg: 'bg-pink-100', text: 'text-pink-700' },
    };
    return colorMap[color] || colorMap.teal;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-md mx-auto animate-pulse">
          <div className="h-20 bg-gray-200 rounded-xl mb-4"></div>
          <div className="h-96 bg-gray-200 rounded-xl"></div>
        </div>
      </div>
    );
  }

  if (error || !circle) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error || 'Circle not found'}</p>
          <Link
            href="/circles"
            className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700"
          >
            Back to Circles
          </Link>
        </div>
      </div>
    );
  }

  const colors = getColorClasses(circle.color);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-md mx-auto px-4 py-4">
          <HavenHeader />
          
          {/* Back Link */}
          <div className="mb-6 mt-4">
            <Link 
              href="/circles"
              className="text-emerald-600 hover:text-emerald-700 font-medium"
            >
              ← Back
            </Link>
          </div>
          
          {/* Circle Info */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {circle.emoji && <span className="text-2xl">{circle.emoji}</span>}
              <div>
                <h1 className="font-bold text-gray-900">{circle.name}</h1>
                <p className="text-sm text-gray-500">{circle.member_count} members</p>
              </div>
            </div>
            {isAdmin && (
              <button className="text-gray-400 hover:text-gray-600 text-sm font-medium">
                Settings
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-md mx-auto px-4">
          <div className="flex">
            <button
              onClick={() => setActiveTab('chat')}
              className={`flex-1 py-3 text-center font-medium border-b-2 transition-colors ${
                activeTab === 'chat'
                  ? 'border-teal-500 text-teal-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Chat
            </button>
            <button
              onClick={() => setActiveTab('members')}
              className={`flex-1 py-3 text-center font-medium border-b-2 transition-colors ${
                activeTab === 'members'
                  ? 'border-teal-500 text-teal-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Members
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 max-w-md mx-auto w-full">
        {activeTab === 'chat' ? (
          // Chat View
          <div className="flex flex-col h-full">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-500">No messages yet. Start the conversation!</p>
                </div>
              ) : (
                messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex gap-3 ${
                      message.sender_id === currentUserId ? 'flex-row-reverse' : ''
                    }`}
                  >
                    <AvatarUpload
                      userId={message.sender_id}
                      currentAvatarUrl={message.sender_profile?.avatar_url}
                      name={message.sender_profile?.family_name || message.sender_profile?.display_name || '?'}
                      size="sm"
                      editable={false}
                    />
                    <div
                      className={`flex-1 max-w-xs ${
                        message.sender_id === currentUserId ? 'text-right' : ''
                      }`}
                    >
                      <div
                        className={`inline-block px-3 py-2 rounded-lg ${
                          message.sender_id === currentUserId
                            ? 'bg-teal-600 text-white'
                            : 'bg-white border border-gray-200 text-gray-900'
                        }`}
                      >
                        <p>{message.content}</p>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {message.sender_id !== currentUserId && (
                          <>
                            {message.sender_profile?.family_name || message.sender_profile?.display_name} · 
                          </>
                        )}
                        {formatMessageTime(message.created_at)}
                      </p>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            <div className="bg-white border-t border-gray-200 p-4">
              <div className="flex gap-2 items-end">
                <textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Type a message..."
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-teal-500 focus:border-teal-500 resize-none min-h-[40px] max-h-[120px] overflow-y-auto"
                  maxLength={500}
                  rows={1}
                  style={{
                    minHeight: '40px',
                    maxHeight: '120px',
                    height: Math.min(120, Math.max(40, (newMessage.split('\n').length * 20) + 20)) + 'px'
                  }}
                />
                <button
                  onClick={sendMessage}
                  disabled={!newMessage.trim() || sendingMessage}
                  className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  {sendingMessage ? '...' : 'Send'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          // Members View
          <div className="p-4">
            <div className="space-y-4">
              {/* Sort members alphabetically by last name */}
              {[...members].sort((a, b) => {
                const getLastName = (member: Member) => {
                  const fullName = member.profile?.family_name || member.profile?.display_name || '';
                  const nameParts = fullName.trim().split(' ');
                  return nameParts.length > 1 ? nameParts[nameParts.length - 1] : fullName;
                };
                const lastNameA = getLastName(a).toLowerCase();
                const lastNameB = getLastName(b).toLowerCase();
                return lastNameA.localeCompare(lastNameB);
              }).map((member) => (
                <div key={member.id} className="flex items-center justify-between bg-white rounded-xl p-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    <AvatarUpload
                      userId={member.member_id}
                      currentAvatarUrl={member.profile?.avatar_url}
                      name={member.profile?.family_name || member.profile?.display_name || '?'}
                      size="md"
                      editable={false}
                    />
                    <div>
                      <h3 className="font-medium text-gray-900">
                        {member.profile?.family_name || member.profile?.display_name}
                      </h3>
                      <p className="text-sm text-gray-500">{member.profile?.location_name}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {member.role === 'admin' && (
                      <span className="px-2 py-1 text-xs font-medium text-teal-700 bg-teal-100 rounded-full">
                        Admin
                      </span>
                    )}
                    {member.member_id !== currentUserId && (
                      <Link
                        href={`/messages?user=${member.member_id}`}
                        className="text-teal-600 hover:text-teal-700 text-sm"
                      >
                        Message
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Add Members Button (Admin Only) */}
            {isAdmin && (
              <div className="mt-6 pt-6 border-t border-gray-200">
                <button 
                  onClick={openInviteModal}
                  className="w-full py-3 px-4 text-teal-600 border border-teal-200 rounded-lg hover:bg-teal-50 font-medium"
                >
                  + Invite Members
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Invite Members Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[80vh] flex flex-col">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900">Invite Members</h3>
                <button
                  onClick={() => {
                    setShowInviteModal(false);
                    setSearchTerm('');
                  }}
                  className="text-gray-400 hover:text-gray-600 text-xl"
                >
                  ×
                </button>
              </div>
              <p className="text-sm text-gray-600 mt-2">
                Select from your connections to invite to this circle
              </p>
              
              {/* Search Bar */}
              <div className="mt-4">
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
                  />
                </div>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4">
              {filteredConnections.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-gray-100 rounded-lg mb-2"></div>
                  <h4 className="font-semibold text-gray-900 mb-2">
                    {searchTerm ? 'No Results Found' : 'No Available Connections'}
                  </h4>
                  <p className="text-gray-600 text-sm">
                    {searchTerm 
                      ? `No connections match "${searchTerm}".`
                      : 'All your connections are already members of this circle, or you need to make connections first.'
                    }
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredConnections.map((connection) => (
                    <div key={connection.id} className="bg-gray-50 rounded-xl p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <AvatarUpload
                            userId={connection.user.id}
                            currentAvatarUrl={connection.user.avatar_url}
                            name={connection.user.family_name || connection.user.display_name || '?'}
                            size="sm"
                            editable={false}
                          />
                          <div>
                            <h4 className="font-medium text-gray-900">
                              {connection.user.family_name || connection.user.display_name}
                            </h4>
                            <p className="text-sm text-gray-500">{connection.user.location_name}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => inviteMember(connection.user.id)}
                          disabled={inviteLoading}
                          className="px-3 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 disabled:bg-gray-300 text-sm"
                        >
                          {inviteLoading ? '...' : 'Invite'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}