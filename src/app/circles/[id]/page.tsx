'use client';
import { toast } from '@/lib/toast';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { getStoredSession } from '@/lib/session';
import AvatarUpload from '@/components/AvatarUpload';
import AppHeader from '@/components/AppHeader';
import { createNotification } from '@/lib/notifications';

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
  next_meetup_date?: string | null;
  next_meetup_time?: string | null;
  meetup_location?: string | null;
  meetup_notes?: string | null;
  cover_image_url?: string | null;
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
  file_url?: string;
  file_type?: string;
  sender_profile: {
    family_name: string;
    display_name?: string;
    avatar_url?: string;
  };
};

type Resource = {
  id: string;
  title: string;
  url?: string;
  description?: string;
  created_by: string;
  created_at: string;
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
  const [invitedUsers, setInvitedUsers] = useState<Set<string>>(new Set());
  const [connections, setConnections] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  
  // Chat functionality
  const [newMessage, setNewMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [uploadingChatFile, setUploadingChatFile] = useState(false);
  const chatFileRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<'chat' | 'members' | 'resources' | 'meetup'>('chat');
  const [meetupDate, setMeetupDate] = useState('');
  const [meetupTime, setMeetupTime] = useState('');
  const [meetupLocation, setMeetupLocation] = useState('');
  const [meetupNotes, setMeetupNotes] = useState('');
  const [savingMeetup, setSavingMeetup] = useState(false);
  const [resources, setResources] = useState<Resource[]>([]);
  const [showAddResource, setShowAddResource] = useState(false);
  const [resourceTitle, setResourceTitle] = useState('');
  const [resourceUrl, setResourceUrl] = useState('');
  const [resourceDesc, setResourceDesc] = useState('');
  const [addingResource, setAddingResource] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // New state for modals
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [adminLoading, setAdminLoading] = useState(false);
  
  // Edit circle state
  const [editingName, setEditingName] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [tempName, setTempName] = useState('');
  const [tempDescription, setTempDescription] = useState('');
  const [savingChanges, setSavingChanges] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [confirmDeleteCircle, setConfirmDeleteCircle] = useState(false);
  const [deletingCircle, setDeletingCircle] = useState(false);

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
        if (circleData.next_meetup_date) setMeetupDate(circleData.next_meetup_date);
        if (circleData.next_meetup_time) setMeetupTime(circleData.next_meetup_time.slice(0, 5));
        if (circleData.meetup_location) setMeetupLocation(circleData.meetup_location);
        if (circleData.meetup_notes) setMeetupNotes(circleData.meetup_notes);

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

        // Load resources
        const resourcesRes = await fetch(
          `${supabaseUrl}/rest/v1/circle_resources?circle_id=eq.${circleId}&select=*&order=created_at.desc`,
          { headers: { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}` } }
        );
        if (resourcesRes.ok) {
          setResources(await resourcesRes.json());
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

  const addResource = async () => {
    if (!resourceTitle.trim() || addingResource) return;
    setAddingResource(true);
    try {
      const session = getStoredSession();
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      const res = await fetch(`${supabaseUrl}/rest/v1/circle_resources`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey!,
          'Authorization': `Bearer ${session!.access_token}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        body: JSON.stringify({
          circle_id: circleId,
          created_by: currentUserId,
          title: resourceTitle.trim(),
          url: resourceUrl.trim() || null,
          description: resourceDesc.trim() || null,
        }),
      });
      if (res.ok) {
        const [newResource] = await res.json();
        setResources(prev => [newResource, ...prev]);
        setResourceTitle('');
        setResourceUrl('');
        setResourceDesc('');
        setShowAddResource(false);
        toast('Resource added', 'success');
      } else {
        toast('Failed to add resource', 'error');
      }
    } catch {
      toast('Failed to add resource', 'error');
    } finally {
      setAddingResource(false);
    }
  };

  const deleteResource = async (resourceId: string) => {
    try {
      const session = getStoredSession();
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      const res = await fetch(`${supabaseUrl}/rest/v1/circle_resources?id=eq.${resourceId}`, {
        method: 'DELETE',
        headers: {
          'apikey': supabaseKey!,
          'Authorization': `Bearer ${session!.access_token}`,
        },
      });
      if (res.ok) {
        setResources(prev => prev.filter(r => r.id !== resourceId));
      } else {
        toast('Failed to delete resource', 'error');
      }
    } catch {
      toast('Failed to delete resource', 'error');
    }
  };

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

  const sendCircleFile = async (file: File) => {
    if (!circleId || uploadingChatFile) return;
    setUploadingChatFile(true);
    try {
      const session = getStoredSession();
      if (!session) return;
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      const ext = file.name.split('.').pop() || 'bin';
      const path = `circles/${circleId}/${session.user.id}-${Date.now()}.${ext}`;
      const uploadRes = await fetch(`${supabaseUrl}/storage/v1/object/event-files/${path}`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey!,
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': file.type || 'application/octet-stream',
        },
        body: file,
      });
      if (!uploadRes.ok) { return; }
      const fileUrl = `${supabaseUrl}/storage/v1/object/public/event-files/${path}`;
      const res = await fetch(`${supabaseUrl}/rest/v1/circle_messages`, {
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
          content: file.name,
          file_url: fileUrl,
          file_type: file.type,
          message_type: 'file',
        }),
      });
      if (res.ok) {
        const [newMsg] = await res.json();
        const currentMember = members.find(m => m.member_id === session.user.id);
        setMessages(prev => [...prev, { ...newMsg, sender_profile: currentMember?.profile }]);
      }
    } catch { /* silent */ }
    finally { setUploadingChatFile(false); if (chatFileRef.current) chatFileRef.current.value = ''; }
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
    try {
      setInviteLoading(true);
      const session = getStoredSession();
      if (!session) return;

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      await fetch(`${supabaseUrl}/rest/v1/circle_invitations`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey!,
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          circle_id: circleId,
          invitee_id: userId,
          inviter_id: session.user.id,
          status: 'pending',
        }),
      });

      setInvitedUsers(prev => new Set([...prev, userId]));

      // Notify the invitee
      createNotification({
        userId,
        actorId: session.user.id,
        type: 'circle_invite',
        title: `You've been invited to join ${circle?.name || 'a circle'}`,
        body: `Tap to view your circle invitations`,
        link: '/circles/invitations',
        referenceId: circleId,
        accessToken: session.access_token,
      });
    } catch (error) {
      console.error('Error sending invitation:', error);
    } finally {
      setInviteLoading(false);
    }
  };

  const unrequestMember = async (userId: string) => {
    try {
      setInviteLoading(true);
      const session = getStoredSession();
      if (!session) return;

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      await fetch(
        `${supabaseUrl}/rest/v1/circle_invitations?circle_id=eq.${circleId}&invitee_id=eq.${userId}&status=eq.pending`,
        {
          method: 'DELETE',
          headers: {
            'apikey': supabaseKey!,
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      setInvitedUsers(prev => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    } catch (error) {
      console.error('Error cancelling invitation:', error);
    } finally {
      setInviteLoading(false);
    }
  };

  const filteredConnections = connections.filter((conn: any) =>
    (conn.user.family_name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (conn.user.display_name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (conn.user.location_name?.toLowerCase() || '').includes(searchTerm.toLowerCase())
  );

  // Function to toggle admin status
  const toggleAdminStatus = async (memberId: string, currentRole: 'admin' | 'member') => {
    if (adminLoading) return;

    try {
      setAdminLoading(true);

      const session = getStoredSession();
      if (!session?.user) throw new Error('Not authenticated');

      const newRole = currentRole === 'admin' ? 'member' : 'admin';

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      const response = await fetch(
        `${supabaseUrl}/rest/v1/circle_members?circle_id=eq.${circleId}&member_id=eq.${memberId}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': supabaseKey!,
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ role: newRole }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to update member role');
      }

      // Update local state
      setMembers(prev => prev.map(member => 
        member.member_id === memberId ? { ...member, role: newRole } : member
      ));

      // Close member modal
      setSelectedMember(null);

    } catch (err) {
      console.error('Error updating admin status:', err);
      toast('Failed to update member role. Please try again.', 'error');
    } finally {
      setAdminLoading(false);
    }
  };

  // Function to remove member from circle
  const removeMember = async (memberId: string) => {
    if (adminLoading) return;

    if (!confirm('Are you sure you want to remove this member from the circle?')) {
      return;
    }

    try {
      setAdminLoading(true);

      const session = getStoredSession();
      if (!session?.user) throw new Error('Not authenticated');

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      const response = await fetch(
        `${supabaseUrl}/rest/v1/circle_members?circle_id=eq.${circleId}&member_id=eq.${memberId}`,
        {
          method: 'DELETE',
          headers: {
            'apikey': supabaseKey!,
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to remove member');
      }

      // Update local state
      setMembers(prev => prev.filter(member => member.member_id !== memberId));

      // Update member count
      if (circle) {
        setCircle(prev => prev ? { ...prev, member_count: prev.member_count - 1 } : null);
      }

      // Close member modal
      setSelectedMember(null);

    } catch (err) {
      console.error('Error removing member:', err);
      toast('Failed to remove member. Please try again.', 'error');
    } finally {
      setAdminLoading(false);
    }
  };

  // Function to save circle name
  const saveCircleName = async () => {
    if (!tempName.trim() || savingChanges) return;

    try {
      setSavingChanges(true);

      const session = getStoredSession();
      if (!session?.user) throw new Error('Not authenticated');

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      const response = await fetch(
        `${supabaseUrl}/rest/v1/circles?id=eq.${circleId}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': supabaseKey!,
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name: tempName.trim() }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to update circle name');
      }

      // Update local state
      setCircle(prev => prev ? { ...prev, name: tempName.trim() } : null);
      setEditingName(false);

    } catch (err) {
      console.error('Error updating circle name:', err);
      toast('Failed to update circle name. Please try again.', 'error');
    } finally {
      setSavingChanges(false);
    }
  };

  // Function to save circle description
  const saveCircleDescription = async () => {
    if (savingChanges) return;

    try {
      setSavingChanges(true);

      const session = getStoredSession();
      if (!session?.user) throw new Error('Not authenticated');

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      const response = await fetch(
        `${supabaseUrl}/rest/v1/circles?id=eq.${circleId}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': supabaseKey!,
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ description: tempDescription.trim() }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to update circle description');
      }

      // Update local state
      setCircle(prev => prev ? { ...prev, description: tempDescription.trim() } : null);
      setEditingDescription(false);

    } catch (err) {
      console.error('Error updating circle description:', err);
      toast('Failed to update circle description. Please try again.', 'error');
    } finally {
      setSavingChanges(false);
    }
  };

  const uploadCoverImage = async (file: File) => {
    if (uploadingCover) return;
    setUploadingCover(true);
    try {
      const session = getStoredSession();
      if (!session?.user) return;
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `circles/covers/${circleId}-${Date.now()}.${ext}`;
      const uploadRes = await fetch(`${supabaseUrl}/storage/v1/object/event-files/${path}`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey!,
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': file.type || 'image/jpeg',
        },
        body: file,
      });
      if (!uploadRes.ok) { toast('Upload failed', 'error'); return; }
      const coverUrl = `${supabaseUrl}/storage/v1/object/public/event-files/${path}`;
      await fetch(`${supabaseUrl}/rest/v1/circles?id=eq.${circleId}`, {
        method: 'PATCH',
        headers: {
          'apikey': supabaseKey!,
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({ cover_image_url: coverUrl }),
      });
      setCircle(prev => prev ? { ...prev, cover_image_url: coverUrl } : null);
      toast('Cover photo updated', 'success');
    } catch {
      toast('Failed to upload cover photo', 'error');
    } finally {
      setUploadingCover(false);
    }
  };

  const removeCoverImage = async () => {
    try {
      const session = getStoredSession();
      if (!session?.user) return;
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      await fetch(`${supabaseUrl}/rest/v1/circles?id=eq.${circleId}`, {
        method: 'PATCH',
        headers: {
          'apikey': supabaseKey!,
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({ cover_image_url: null }),
      });
      setCircle(prev => prev ? { ...prev, cover_image_url: null } : null);
      toast('Cover photo removed', 'success');
    } catch {
      toast('Failed to remove cover photo', 'error');
    }
  };

  const deleteCircle = async () => {
    if (deletingCircle) return;
    setDeletingCircle(true);
    try {
      const session = getStoredSession();
      if (!session?.user) return;
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      const headers = { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}` };
      await fetch(`${supabaseUrl}/rest/v1/circle_messages?circle_id=eq.${circleId}`, { method: 'DELETE', headers });
      await fetch(`${supabaseUrl}/rest/v1/circle_members?circle_id=eq.${circleId}`, { method: 'DELETE', headers });
      const res = await fetch(`${supabaseUrl}/rest/v1/circles?id=eq.${circleId}`, { method: 'DELETE', headers });
      if (!res.ok) throw new Error();
      toast('Circle deleted', 'success');
      router.push('/circles');
    } catch {
      toast('Failed to delete circle', 'error');
      setDeletingCircle(false);
    }
  };

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
      teal: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
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
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white p-4">
        <div className="max-w-md mx-auto animate-pulse">
          <div className="h-20 bg-gray-200 rounded-xl mb-4"></div>
          <div className="h-96 bg-gray-200 rounded-xl"></div>
        </div>
      </div>
    );
  }

  if (error || !circle) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white p-4 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error || 'Circle not found'}</p>
          <Link
            href="/circles"
            className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800"
          >
            Back to Circles
          </Link>
        </div>
      </div>
    );
  }

  const colors = getColorClasses(circle.color);

  return (
    <div className="h-screen bg-gradient-to-b from-emerald-50 to-white flex flex-col overflow-hidden">
      {/* Header — flex-shrink-0, always visible */}
      <div className="flex-shrink-0 bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-md mx-auto">
          <AppHeader
            backHref="/circles"
            right={isAdmin ? (
              <button
                onClick={() => setShowSettingsModal(true)}
                className="text-sm font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
              >
                Settings
              </button>
            ) : undefined}
          />
          {/* Cover image banner */}
          {circle.cover_image_url && (
            <div className="relative w-full h-32 overflow-hidden">
              <img
                src={circle.cover_image_url}
                alt="Circle cover"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
            </div>
          )}

          {/* Circle Info */}
          <div className="flex items-center gap-3 px-4 pb-3">
            {circle.emoji && <span className="text-2xl">{circle.emoji}</span>}
            <div>
              <h1 className="font-bold text-gray-900">{circle.name}</h1>
              <p className="text-sm text-gray-500">{circle.member_count} members</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Navigation — flex-shrink-0 */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200">
        <div className="max-w-md mx-auto px-4">
          <div className="flex">
            <button
              onClick={() => setActiveTab('chat')}
              className={`flex-1 py-3 text-center font-medium border-b-2 transition-colors ${
                activeTab === 'chat'
                  ? 'border-emerald-500 text-emerald-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Chat
            </button>
            <button
              onClick={() => setActiveTab('members')}
              className={`flex-1 py-3 text-center font-medium border-b-2 transition-colors ${
                activeTab === 'members'
                  ? 'border-emerald-500 text-emerald-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Members
            </button>
            <button
              onClick={() => setActiveTab('resources')}
              className={`flex-1 py-3 text-center font-medium border-b-2 transition-colors ${
                activeTab === 'resources'
                  ? 'border-emerald-500 text-emerald-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Resources
            </button>
            <button
              onClick={() => setActiveTab('meetup')}
              className={`flex-1 py-3 text-center font-medium border-b-2 transition-colors ${
                activeTab === 'meetup'
                  ? 'border-emerald-500 text-emerald-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Meetup
            </button>
          </div>
        </div>
      </div>

      {/* Content — flex-1, overflow-hidden so chat can control its own scroll */}
      <div className="flex-1 overflow-hidden max-w-md mx-auto w-full">
        {activeTab === 'chat' ? (
          // Chat View — fills remaining height, messages scroll, input pinned at bottom
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
                      {message.file_url && message.file_type?.startsWith('image/') ? (
                        <img
                          src={message.file_url}
                          alt={message.content}
                          className="max-w-[200px] max-h-[200px] object-cover rounded-xl cursor-pointer inline-block"
                          onClick={() => window.open(message.file_url, '_blank')}
                        />
                      ) : message.file_url ? (
                        <div className={`inline-block px-3 py-2 rounded-lg ${message.sender_id === currentUserId ? 'bg-emerald-600 text-white' : 'bg-white border border-gray-200 text-gray-900'}`}>
                          <a href={message.file_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm underline">
                            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                            {message.content}
                          </a>
                        </div>
                      ) : (
                        <div className={`inline-block px-3 py-2 rounded-lg ${message.sender_id === currentUserId ? 'bg-emerald-600 text-white' : 'bg-white border border-gray-200 text-gray-900'}`}>
                          <p>{message.content}</p>
                        </div>
                      )}
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
                <button
                  onClick={() => chatFileRef.current?.click()}
                  disabled={uploadingChatFile}
                  className="p-2 text-gray-400 hover:text-emerald-600 transition-colors flex-shrink-0"
                  title="Attach file"
                >
                  {uploadingChatFile ? (
                    <div className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                  )}
                </button>
                <input
                  ref={chatFileRef}
                  type="file"
                  accept="image/*,.pdf,.doc,.docx,.txt"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) sendCircleFile(f); }}
                />
                <textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Type a message..."
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-emerald-500 focus:border-emerald-500 resize-none min-h-[40px] max-h-[120px] overflow-y-auto"
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
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  {sendingMessage ? '...' : 'Send'}
                </button>
              </div>
            </div>
          </div>
        ) : activeTab === 'members' ? (
          // Members View
          <div className="h-full overflow-y-auto p-4">
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
                  <div 
                    className="flex items-center gap-3 flex-1 cursor-pointer"
                    onClick={() => setSelectedMember(member)}
                  >
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
                      <span className="px-2 py-1 text-xs font-medium text-emerald-700 bg-emerald-100 rounded-full">
                        Admin
                      </span>
                    )}
                    {member.member_id !== currentUserId && (
                      <Link
                        href={`/messages?user=${member.member_id}`}
                        className="text-emerald-600 hover:text-emerald-700 text-sm"
                        onClick={(e) => e.stopPropagation()}
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
                  className="w-full py-3 px-4 text-emerald-600 border border-emerald-200 rounded-lg hover:bg-emerald-50 font-medium"
                >
                  + Invite Members
                </button>
              </div>
            )}
          </div>
        ) : activeTab === 'resources' ? (
          // Resources View
          <div className="h-full overflow-y-auto p-4">
            {/* Add resource button */}
            <button
              onClick={() => setShowAddResource(v => !v)}
              className={`w-full mb-4 py-2.5 px-4 rounded-xl font-medium transition-colors ${showAddResource ? 'bg-gray-100 text-gray-700 hover:bg-gray-200' : 'bg-gray-900 text-white hover:bg-gray-800'}`}
            >
              {showAddResource ? 'Cancel' : '+ Add Resource'}
            </button>

            {/* Add resource form */}
            {showAddResource && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-4 space-y-3">
                <input
                  value={resourceTitle}
                  onChange={e => setResourceTitle(e.target.value)}
                  placeholder="Title (e.g. Khan Academy, Co-op schedule)"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 bg-white"
                />
                <input
                  value={resourceUrl}
                  onChange={e => setResourceUrl(e.target.value)}
                  placeholder="Link (optional)"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 bg-white"
                  type="url"
                />
                <textarea
                  value={resourceDesc}
                  onChange={e => setResourceDesc(e.target.value)}
                  placeholder="Description (optional)"
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 bg-white resize-none"
                />
                <button
                  onClick={addResource}
                  disabled={!resourceTitle.trim() || addingResource}
                  className="w-full py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 disabled:bg-gray-300 transition-colors text-sm"
                >
                  {addingResource ? 'Adding...' : 'Add Resource'}
                </button>
              </div>
            )}

            {/* Resources list */}
            {resources.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500 text-sm">No resources yet.</p>
                <p className="text-gray-400 text-xs mt-1">Share links, documents, or notes with your circle.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {resources.map(resource => (
                  <div key={resource.id} className="bg-white rounded-xl p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        {resource.url ? (
                          <a
                            href={resource.url.startsWith('http') ? resource.url : `https://${resource.url}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-emerald-600 hover:text-emerald-700 hover:underline text-sm"
                          >
                            {resource.title}
                          </a>
                        ) : (
                          <p className="font-medium text-gray-900 text-sm">{resource.title}</p>
                        )}
                        {resource.url && (
                          <p className="text-xs text-gray-400 truncate mt-0.5">{resource.url}</p>
                        )}
                        {resource.description && (
                          <p className="text-sm text-gray-600 mt-1">{resource.description}</p>
                        )}
                      </div>
                      {(resource.created_by === currentUserId || isAdmin) && (
                        <button
                          onClick={() => deleteResource(resource.id)}
                          className="text-gray-300 hover:text-red-400 transition-colors text-lg flex-shrink-0"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : activeTab === 'meetup' ? (
          // Meetup Tab
          <div className="h-full overflow-y-auto p-4 space-y-4">
            {/* Current meetup display */}
            {circle?.next_meetup_date && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide mb-2">Next meetup</p>
                <p className="font-semibold text-emerald-900 text-lg">
                  {new Date(circle.next_meetup_date + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}
                </p>
                {circle.next_meetup_time && (
                  <p className="text-emerald-700 mt-1">
                    {(() => { const [h, m] = circle.next_meetup_time!.split(':'); const hr = parseInt(h); return `${hr % 12 || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`; })()}
                  </p>
                )}
                {circle.meetup_location && <p className="text-emerald-700 text-sm mt-1">{circle.meetup_location}</p>}
                {circle.meetup_notes && <p className="text-gray-600 text-sm mt-2">{circle.meetup_notes}</p>}
                <a
                  href="/calendar"
                  className="inline-flex items-center gap-1.5 mt-3 text-sm font-medium text-emerald-700 hover:text-emerald-800"
                >
                  View in my calendar →
                </a>
              </div>
            )}

            {!circle?.next_meetup_date && !isAdmin && (
              <div className="text-center py-8">
                <p className="text-gray-400 text-sm">No meetup scheduled yet</p>
                <p className="text-gray-400 text-xs mt-1">Admins can schedule a meetup here</p>
              </div>
            )}

            {/* Admin: schedule / edit meetup */}
            {isAdmin && (
              <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
                <p className="font-semibold text-gray-900 text-sm">{circle?.next_meetup_date ? 'Update meetup' : 'Schedule a meetup'}</p>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Date</label>
                  <input
                    type="date"
                    value={meetupDate}
                    onChange={e => setMeetupDate(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Time (optional)</label>
                  <input
                    type="time"
                    value={meetupTime}
                    onChange={e => setMeetupTime(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Location</label>
                  <input
                    type="text"
                    value={meetupLocation}
                    onChange={e => setMeetupLocation(e.target.value)}
                    placeholder="Park, community hall, address..."
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Notes</label>
                  <textarea
                    value={meetupNotes}
                    onChange={e => setMeetupNotes(e.target.value)}
                    placeholder="What to bring, parking info, etc."
                    rows={2}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 resize-none"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    disabled={!meetupDate || savingMeetup}
                    onClick={async () => {
                      if (!meetupDate) return;
                      setSavingMeetup(true);
                      try {
                        const session = getStoredSession();
                        if (!session) return;
                        const sUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
                        const sKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
                        const res = await fetch(`${sUrl}/rest/v1/circles?id=eq.${circle?.id}`, {
                          method: 'PATCH',
                          headers: {
                            'apikey': sKey!,
                            'Authorization': `Bearer ${session.access_token}`,
                            'Content-Type': 'application/json',
                          },
                          body: JSON.stringify({
                            next_meetup_date: meetupDate,
                            next_meetup_time: meetupTime || null,
                            meetup_location: meetupLocation || null,
                            meetup_notes: meetupNotes || null,
                          }),
                        });
                        if (res.ok) {
                          setCircle(prev => prev ? { ...prev, next_meetup_date: meetupDate, next_meetup_time: meetupTime || null, meetup_location: meetupLocation || null, meetup_notes: meetupNotes || null } : null);
                        }
                      } catch { /* silent */ }
                      finally { setSavingMeetup(false); }
                    }}
                    className="flex-1 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-semibold disabled:bg-gray-300 transition-colors"
                  >
                    {savingMeetup ? 'Saving...' : 'Save meetup'}
                  </button>
                  {circle?.next_meetup_date && (
                    <button
                      onClick={async () => {
                        setSavingMeetup(true);
                        try {
                          const session = getStoredSession();
                          if (!session) return;
                          const sUrl2 = process.env.NEXT_PUBLIC_SUPABASE_URL;
                          const sKey2 = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
                          await fetch(`${sUrl2}/rest/v1/circles?id=eq.${circle?.id}`, {
                            method: 'PATCH',
                            headers: { 'apikey': sKey2!, 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
                            body: JSON.stringify({ next_meetup_date: null, next_meetup_time: null, meetup_location: null, meetup_notes: null }),
                          });
                          setCircle(prev => prev ? { ...prev, next_meetup_date: null, next_meetup_time: null, meetup_location: null, meetup_notes: null } : null);
                          setMeetupDate(''); setMeetupTime(''); setMeetupLocation(''); setMeetupNotes('');
                        } catch { /* silent */ }
                        finally { setSavingMeetup(false); }
                      }}
                      className="px-4 py-2.5 bg-red-50 text-red-600 rounded-xl text-sm font-semibold border border-red-200 hover:bg-red-100"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : null}
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
                    setInvitedUsers(new Set());
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
                          onClick={() =>
                            invitedUsers.has(connection.user.id)
                              ? unrequestMember(connection.user.id)
                              : inviteMember(connection.user.id)
                          }
                          disabled={inviteLoading}
                          className={`px-3 py-2 rounded-lg font-medium text-sm transition-all ${
                            invitedUsers.has(connection.user.id)
                              ? 'bg-gray-200 text-gray-600 hover:bg-red-100 hover:text-red-600'
                              : 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-gray-300'
                          }`}
                        >
                          {inviteLoading ? '...' : invitedUsers.has(connection.user.id) ? 'Requested' : 'Invite'}
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

      {/* Circle Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[80vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-white rounded-t-2xl p-6 pb-4 border-b border-gray-100">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-gray-900">Circle Settings</h3>
                <button
                  onClick={() => setShowSettingsModal(false)}
                  className="text-gray-400 hover:text-gray-600 text-xl"
                >
                  ×
                </button>
              </div>
            </div>
            
            {/* Content */}
            <div className="p-6 space-y-6">

              {/* Cover Photo */}
              {isAdmin && (
                <div>
                  <h4 className="font-semibold text-gray-900 mb-3">Cover Photo</h4>
                  <div className="space-y-3">
                    {circle?.cover_image_url ? (
                      <div className="relative rounded-xl overflow-hidden h-28">
                        <img src={circle.cover_image_url} alt="Cover" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/20" />
                        <button
                          onClick={removeCoverImage}
                          className="absolute top-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded-lg hover:bg-black/70"
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <div className="h-20 bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl flex items-center justify-center">
                        <p className="text-sm text-gray-400">No cover photo set</p>
                      </div>
                    )}
                    <label className={`block w-full py-2 text-center rounded-xl text-sm font-medium cursor-pointer transition-colors ${uploadingCover ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'}`}>
                      {uploadingCover ? 'Uploading...' : circle?.cover_image_url ? 'Change cover photo' : 'Upload cover photo'}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={uploadingCover}
                        onChange={e => { const f = e.target.files?.[0]; if (f) uploadCoverImage(f); e.target.value = ''; }}
                      />
                    </label>
                  </div>
                </div>
              )}

              {/* Circle Name */}
              <div>
                <h4 className="font-semibold text-gray-900 mb-3">Circle Name</h4>
                {editingName ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={tempName}
                      onChange={(e) => setTempName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                      placeholder="Circle name"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={saveCircleName}
                        disabled={!tempName.trim() || savingChanges}
                        className="px-3 py-1 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 disabled:bg-gray-300"
                      >
                        {savingChanges ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={() => {
                          setEditingName(false);
                          setTempName(circle?.name || '');
                        }}
                        className="px-3 py-1 bg-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-300"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between bg-gray-50 rounded-xl p-4">
                    <div className="flex items-center gap-3">
                      {circle?.emoji && <span className="text-2xl">{circle.emoji}</span>}
                      <div>
                        <p className="font-medium text-gray-900">{circle?.name}</p>
                        <p className="text-sm text-gray-500">{circle?.member_count} members</p>
                      </div>
                    </div>
                    {isAdmin && (
                      <button
                        onClick={() => {
                          setEditingName(true);
                          setTempName(circle?.name || '');
                        }}
                        className="text-emerald-600 hover:text-emerald-700 text-sm font-medium"
                      >
                        Edit
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Circle Description */}
              <div>
                <h4 className="font-semibold text-gray-900 mb-3">Description</h4>
                {editingDescription ? (
                  <div className="space-y-2">
                    <textarea
                      value={tempDescription}
                      onChange={(e) => setTempDescription(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
                      placeholder="Describe your circle..."
                      rows={3}
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={saveCircleDescription}
                        disabled={savingChanges}
                        className="px-3 py-1 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 disabled:bg-gray-300"
                      >
                        {savingChanges ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={() => {
                          setEditingDescription(false);
                          setTempDescription(circle?.description || '');
                        }}
                        className="px-3 py-1 bg-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-300"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between bg-gray-50 rounded-xl p-4">
                    <p className="text-sm text-gray-600 flex-1">
                      {circle?.description || 'No description set'}
                    </p>
                    {isAdmin && (
                      <button
                        onClick={() => {
                          setEditingDescription(true);
                          setTempDescription(circle?.description || '');
                        }}
                        className="text-emerald-600 hover:text-emerald-700 text-sm font-medium ml-3"
                      >
                        Edit
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Privacy Settings */}
              <div>
                <h4 className="font-semibold text-gray-900 mb-3">Privacy</h4>
                <div className="bg-gray-50 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">Private Circle</p>
                      <p className="text-sm text-gray-600">Only admins can invite new members</p>
                    </div>
                    <div className="w-2 h-2 bg-amber-500 rounded-full"></div>
                  </div>
                </div>
              </div>

              {/* Management Actions */}
              <div>
                <h4 className="font-semibold text-gray-900 mb-3">Management</h4>
                <div className="space-y-2">
                  <button
                    onClick={() => {
                      setShowSettingsModal(false);
                      setActiveTab('members');
                    }}
                    className="w-full p-3 text-left bg-gray-50 hover:bg-gray-100 rounded-xl transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-gray-900">Manage Members</span>
                      <span className="text-gray-400">→</span>
                    </div>
                    <p className="text-sm text-gray-600">View and manage member roles</p>
                  </button>
                </div>
              </div>

              {/* Created Info */}
              <div className="pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-500">
                  Circle created {circle ? new Date(circle.created_at).toLocaleDateString('en-AU', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  }) : ''}
                </p>
              </div>

              {/* Danger zone — admin only */}
              {isAdmin && (
                <div className="pt-4 border-t border-red-100">
                  <h4 className="font-semibold text-red-600 mb-3">Danger Zone</h4>
                  {!confirmDeleteCircle ? (
                    <button
                      onClick={() => setConfirmDeleteCircle(true)}
                      className="w-full p-3 text-left bg-red-50 hover:bg-red-100 rounded-xl transition-colors border border-red-200"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-red-700 font-medium text-sm">Delete Circle</span>
                        <span className="text-red-400">→</span>
                      </div>
                      <p className="text-xs text-red-500 mt-0.5">Permanently removes this circle, all messages and members</p>
                    </button>
                  ) : (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                      <p className="text-sm font-semibold text-red-700 mb-1">Delete this circle?</p>
                      <p className="text-xs text-red-500 mb-3">This cannot be undone. All messages and members will be removed.</p>
                      <div className="flex gap-2">
                        <button
                          onClick={deleteCircle}
                          disabled={deletingCircle}
                          className="flex-1 py-2 bg-red-600 text-white text-sm font-semibold rounded-xl hover:bg-red-700 disabled:opacity-50"
                        >
                          {deletingCircle ? 'Deleting...' : 'Yes, delete'}
                        </button>
                        <button
                          onClick={() => setConfirmDeleteCircle(false)}
                          className="flex-1 py-2 bg-gray-100 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-200"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Member Profile Modal */}
      {selectedMember && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[80vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-white rounded-t-2xl p-6 pb-4 border-b border-gray-100">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-gray-900">Member Profile</h3>
                <button
                  onClick={() => setSelectedMember(null)}
                  className="text-gray-400 hover:text-gray-600 text-xl"
                >
                  ×
                </button>
              </div>
            </div>
            
            {/* Content */}
            <div className="p-6">
              {/* User Info */}
              <div className="flex items-start gap-4 mb-6">
                <AvatarUpload
                  userId={selectedMember.member_id}
                  currentAvatarUrl={selectedMember.profile?.avatar_url}
                  name={selectedMember.profile?.family_name || selectedMember.profile?.display_name || '?'}
                  size="lg"
                  editable={false}
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-xl font-semibold text-emerald-600">
                      {selectedMember.profile?.display_name || 
                       selectedMember.profile?.family_name?.split(' ')[0] || 
                       selectedMember.profile?.family_name}
                    </h3>
                    {selectedMember.role === 'admin' && (
                      <span className="px-2 py-1 text-xs font-medium text-emerald-700 bg-emerald-100 rounded-full">
                        Admin
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500">
                    Joined {new Date(selectedMember.joined_at).toLocaleDateString('en-AU', { 
                      year: 'numeric', 
                      month: 'long', 
                      day: 'numeric' 
                    })}
                  </p>
                </div>
              </div>

              {/* Location */}
              <div className="mb-6">
                <h4 className="font-semibold text-gray-900 mb-2">Location</h4>
                <p className="text-gray-700">{selectedMember.profile?.location_name}</p>
              </div>

              {/* Admin Controls */}
              {isAdmin && selectedMember.member_id !== currentUserId && (
                <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
                  <h4 className="font-semibold text-gray-900 mb-3">Admin Controls</h4>
                  <div className="space-y-3">
                    <button
                      onClick={() => toggleAdminStatus(selectedMember.member_id, selectedMember.role)}
                      disabled={adminLoading}
                      className={`w-full px-4 py-3 rounded-xl font-medium transition-colors ${
                        selectedMember.role === 'admin' 
                          ? 'bg-orange-600 text-white hover:bg-orange-700'
                          : 'bg-emerald-600 text-white hover:bg-emerald-700'
                      } disabled:bg-gray-300`}
                    >
                      {adminLoading ? '...' : 
                       selectedMember.role === 'admin' ? 'Remove Admin Rights' : 'Make Admin'}
                    </button>
                    
                    <button
                      onClick={() => removeMember(selectedMember.member_id)}
                      disabled={adminLoading}
                      className="w-full px-4 py-3 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 disabled:bg-gray-300"
                    >
                      {adminLoading ? '...' : 'Remove from Circle'}
                    </button>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3">
                {selectedMember.member_id !== currentUserId && (
                  <Link
                    href={`/messages?user=${selectedMember.member_id}`}
                    className="flex-1 px-4 py-3 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-800 transition-colors text-center"
                    onClick={() => setSelectedMember(null)}
                  >
                    Message
                  </Link>
                )}
                <button
                  onClick={() => setSelectedMember(null)}
                  className="flex-1 px-4 py-3 bg-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-300 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}