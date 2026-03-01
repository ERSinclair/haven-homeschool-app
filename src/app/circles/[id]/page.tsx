'use client';
import { toast } from '@/lib/toast';

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { getStoredSession } from '@/lib/session';
import AvatarUpload from '@/components/AvatarUpload';
import AppHeader from '@/components/AppHeader';
import ImageCropModal from '@/components/ImageCropModal';
import { createNotification } from '@/lib/notifications';
import EmojiPicker from '@/components/EmojiPicker';
import ChatView, { ChatMessage as ChatViewMessage } from '@/components/ChatView';
import ProfileCardModal from '@/components/ProfileCardModal';
import MessageContextMenu from '@/components/MessageContextMenu';

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
  is_public: boolean;
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
  file_url?: string;
  file_name?: string;
  created_by: string;
  created_at: string;
};

type BoardPost = {
  id: string;
  title: string;
  content: string;
  tag: string;
  created_at: string;
  author_id: string;
  author: {
    family_name: string;
    display_name?: string;
    avatar_url?: string;
  };
};

const BOARD_TAG_COLORS: Record<string, string> = {
  question:   'bg-purple-100 text-purple-700',
  curriculum: 'bg-blue-100 text-blue-700',
  resource:   'bg-emerald-100 text-emerald-700',
  meetup:     'bg-orange-100 text-orange-700',
  general:    'bg-gray-100 text-gray-600',
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
  const [pendingChatFile, setPendingChatFile] = useState<File | null>(null);
  const [uploadingChatFile, setUploadingChatFile] = useState(false);
  const [contextMenuMsg, setContextMenuMsg] = useState<ChatViewMessage | null>(null);
  const chatFileRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<'chat' | 'info'>('chat');
  const [announcement, setAnnouncement] = useState('');
  const [announcementEdit, setAnnouncementEdit] = useState(false);
  const [announcementInput, setAnnouncementInput] = useState('');
  const [infoSubTab, setInfoSubTab] = useState<'members' | 'resources' | 'meetup' | 'board'>('members');
  const [boardPosts, setBoardPosts] = useState<BoardPost[]>([]);
  const [boardLoading, setBoardLoading] = useState(false);
  const [showBoardCreate, setShowBoardCreate] = useState(false);
  const [boardTitle, setBoardTitle] = useState('');
  const [boardContent, setBoardContent] = useState('');
  const [boardTag, setBoardTag] = useState('general');
  const [boardPosting, setBoardPosting] = useState(false);
  const [meetupDate, setMeetupDate] = useState('');
  const [meetupTime, setMeetupTime] = useState('09:00');
  const [meetupLocation, setMeetupLocation] = useState('');
  const [meetupNotes, setMeetupNotes] = useState('');
  const [savingMeetup, setSavingMeetup] = useState(false);
  const [showMeetupForm, setShowMeetupForm] = useState(false);
  const [meetupCalendarMonth, setMeetupCalendarMonth] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; });
  const [showMeetupTimePicker, setShowMeetupTimePicker] = useState(false);
  const [resources, setResources] = useState<Resource[]>([]);
  const [showAddResource, setShowAddResource] = useState(false);
  const [resourceTitle, setResourceTitle] = useState('');
  const [resourceUrl, setResourceUrl] = useState('');
  const [resourceDesc, setResourceDesc] = useState('');
  const [resourceFile, setResourceFile] = useState<File | null>(null);
  const [addingResource, setAddingResource] = useState(false);
  const resourceFileRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatTextareaRef = useRef<HTMLTextAreaElement>(null);
  const boardTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [showChatEmojiPicker, setShowChatEmojiPicker] = useState(false);
  const [showBoardEmojiPicker, setShowBoardEmojiPicker] = useState(false);
  const [circleReactions, setCircleReactions] = useState<Record<string, { emoji: string; users: string[] }[]>>({});
  const [circleLongPressTimer, setCircleLongPressTimer] = useState<NodeJS.Timeout | null>(null);
  const [circleSelectedMsg, setCircleSelectedMsg] = useState<Message | null>(null);
  const [showCircleReactionSheet, setShowCircleReactionSheet] = useState(false);
  const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

  // New state for modals
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [profileCardUserId, setProfileCardUserId] = useState<string | null>(null);
  const [adminLoading, setAdminLoading] = useState(false);
  
  // Edit circle state
  const [editingName, setEditingName] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [tempName, setTempName] = useState('');
  const [tempDescription, setTempDescription] = useState('');
  const [savingChanges, setSavingChanges] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [coverCropSrc, setCoverCropSrc] = useState<string | null>(null);
  const [confirmDeleteCircle, setConfirmDeleteCircle] = useState(false);
  const [confirmPrivacyToggle, setConfirmPrivacyToggle] = useState(false);
  const [deletingCircle, setDeletingCircle] = useState(false);

  const circleId = params.id as string;

  // Reset window scroll before first paint so the header is never cut off
  // (the h-dvh layout is affected by any scroll carry-over from the previous page)
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [circleId]);

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
        if (circleData.pinned_announcement) setAnnouncement(circleData.pinned_announcement);
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
          fetchCircleReactions(messagesData.map((m: Message) => m.id));
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

  // Scroll is now handled internally by ChatView (scrollTrigger={activeTab})

  const fetchCircleReactions = async (msgIds: string[]) => {
    if (!msgIds.length) return;
    const session = getStoredSession();
    if (!session) return;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    try {
      const ids = msgIds.join(',');
      const res = await fetch(
        `${supabaseUrl}/rest/v1/message_reactions?message_id=in.(${ids})&message_type=eq.circle&select=message_id,emoji,user_id`,
        { headers: { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}` } }
      );
      if (!res.ok) return;
      const rows: { message_id: string; emoji: string; user_id: string }[] = await res.json();
      const map: Record<string, { emoji: string; users: string[] }[]> = {};
      rows.forEach(r => {
        if (!map[r.message_id]) map[r.message_id] = [];
        const group = map[r.message_id].find(g => g.emoji === r.emoji);
        if (group) group.users.push(r.user_id);
        else map[r.message_id].push({ emoji: r.emoji, users: [r.user_id] });
      });
      setCircleReactions(map);
    } catch { /* silent */ }
  };

  const toggleCircleReaction = async (messageId: string, emoji: string) => {
    const session = getStoredSession();
    if (!session || !currentUserId) return;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const h = { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' };
    // Find user's existing reaction on this message (if any)
    const existingGroup = (circleReactions[messageId] || []).find(g => g.users.includes(currentUserId));
    const isSameEmoji = existingGroup?.emoji === emoji;

    // Remove existing reaction (if any)
    if (existingGroup) {
      await fetch(
        `${supabaseUrl}/rest/v1/message_reactions?message_id=eq.${messageId}&message_type=eq.circle&user_id=eq.${currentUserId}&emoji=eq.${encodeURIComponent(existingGroup.emoji)}`,
        { method: 'DELETE', headers: h }
      );
      setCircleReactions(prev => {
        const groups = (prev[messageId] || [])
          .map(g => g.emoji === existingGroup.emoji ? { ...g, users: g.users.filter(u => u !== currentUserId) } : g)
          .filter(g => g.users.length > 0);
        return { ...prev, [messageId]: groups };
      });
    }

    // Add new reaction only if it's a different emoji (same emoji = toggle off)
    if (!isSameEmoji) {
      await fetch(`${supabaseUrl}/rest/v1/message_reactions`, {
        method: 'POST',
        headers: { ...h, 'Prefer': 'return=minimal,resolution=ignore-duplicates' },
        body: JSON.stringify({ message_id: messageId, message_type: 'circle', user_id: currentUserId, emoji }),
      });
      setCircleReactions(prev => {
        const groups = [...(prev[messageId] || [])];
        const group = groups.find(g => g.emoji === emoji);
        if (group) group.users.push(currentUserId);
        else groups.push({ emoji, users: [currentUserId] });
        return { ...prev, [messageId]: groups };
      });
    }
  };

  const addResource = async () => {
    if (!resourceTitle.trim() || addingResource) return;
    setAddingResource(true);
    try {
      const session = getStoredSession();
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      // Upload file if one was selected
      let uploadedFileUrl: string | null = null;
      let uploadedFileName: string | null = null;
      if (resourceFile) {
        const safeFileName = resourceFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `circles/resources/${circleId}/${Date.now()}-${safeFileName}`;
        const uploadRes = await fetch(`${supabaseUrl}/storage/v1/object/event-files/${path}`, {
          method: 'POST',
          headers: {
            'apikey': supabaseKey!,
            'Authorization': `Bearer ${session!.access_token}`,
            'Content-Type': resourceFile.type || 'application/octet-stream',
          },
          body: resourceFile,
        });
        if (uploadRes.ok) {
          uploadedFileUrl = `${supabaseUrl}/storage/v1/object/public/event-files/${path}`;
          uploadedFileName = resourceFile.name;
        } else {
          toast('File upload failed', 'error');
          return;
        }
      }

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
          file_url: uploadedFileUrl,
          file_name: uploadedFileName,
        }),
      });
      if (res.ok) {
        const [newResource] = await res.json();
        setResources(prev => [newResource, ...prev]);
        setResourceTitle('');
        setResourceUrl('');
        setResourceDesc('');
        setResourceFile(null);
        if (resourceFileRef.current) resourceFileRef.current.value = '';
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

  const loadBoardPosts = useCallback(async () => {
    if (!circleId) return;
    setBoardLoading(true);
    try {
      const session = getStoredSession();
      if (!session) return;
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      const headers = { apikey: supabaseKey!, Authorization: `Bearer ${session.access_token}` };

      // Fetch posts without FK join (no FK defined on community_posts.author_id)
      const res = await fetch(
        `${supabaseUrl}/rest/v1/community_posts?circle_id=eq.${circleId}&select=id,title,content,tag,created_at,author_id&order=created_at.desc`,
        { headers }
      );
      const posts = await res.json();
      if (!Array.isArray(posts)) { setBoardPosts([]); return; }

      // Enrich with author profiles
      const authorIds = [...new Set(posts.map((p: any) => p.author_id).filter(Boolean))];
      let profileMap: Record<string, any> = {};
      if (authorIds.length > 0) {
        const pRes = await fetch(
          `${supabaseUrl}/rest/v1/profiles?id=in.(${authorIds.join(',')})&select=id,family_name,display_name,avatar_url`,
          { headers }
        );
        const profiles = pRes.ok ? await pRes.json() : [];
        if (Array.isArray(profiles)) {
          profiles.forEach((p: any) => { profileMap[p.id] = p; });
        }
      }

      setBoardPosts(posts.map((p: any) => ({ ...p, author: profileMap[p.author_id] || null })));
    } catch {
      // silent
    } finally {
      setBoardLoading(false);
    }
  }, [circleId]);

  useEffect(() => {
    if (activeTab === 'info' && infoSubTab === 'board') loadBoardPosts();
  }, [activeTab, infoSubTab, loadBoardPosts]);

  const submitBoardPost = async () => {
    if (!boardTitle.trim() || !boardContent.trim()) return;
    setBoardPosting(true);
    try {
      const session = getStoredSession();
      if (!session) return;
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      const res = await fetch(`${supabaseUrl}/rest/v1/community_posts`, {
        method: 'POST',
        headers: {
          apikey: supabaseKey!,
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({
          circle_id: circleId,
          author_id: session.user.id,
          title: boardTitle.trim(),
          content: boardContent.trim(),
          tag: boardTag,
        }),
      });
      if (res.ok) {
        setBoardTitle('');
        setBoardContent('');
        setBoardTag('general');
        setShowBoardCreate(false);
        loadBoardPosts();
        toast('Post shared', 'success');
      }
    } catch {
      toast('Failed to post', 'error');
    } finally {
      setBoardPosting(false);
    }
  };

  const deleteBoardPost = async (postId: string) => {
    const session = getStoredSession();
    if (!session) return;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    await fetch(`${supabaseUrl}/rest/v1/community_posts?id=eq.${postId}`, {
      method: 'DELETE',
      headers: { apikey: supabaseKey!, Authorization: `Bearer ${session.access_token}` },
    });
    setBoardPosts(prev => prev.filter(p => p.id !== postId));
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || sendingMessage) return;
    try {
      setSendingMessage(true);
      const session = getStoredSession();
      if (!session?.user) throw new Error('Not authenticated');
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      const response = await fetch(`${supabaseUrl}/rest/v1/circle_messages`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey!,
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        body: JSON.stringify({ circle_id: circleId, sender_id: session.user.id, content: text.trim(), message_type: 'text' }),
      });
      if (!response.ok) throw new Error('Failed to send message');
      const [sentMessage] = await response.json();
      const currentMember = members.find(m => m.member_id === session.user.id);
      setMessages(prev => [...prev, { ...sentMessage, sender_profile: currentMember?.profile }]);
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
    finally { setUploadingChatFile(false); }
  };

  const deleteCircleMessage = async (msgId: string) => {
    const session = getStoredSession();
    if (!session) return;
    await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/circle_messages?id=eq.${msgId}`, {
      method: 'DELETE',
      headers: { 'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, 'Authorization': `Bearer ${session.access_token}` },
    });
    setMessages(prev => prev.filter((m: any) => m.id !== msgId));
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

      // Email the invitee (best-effort)
      try {
        const inviteeRes = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${userId}&select=email`, {
          headers: { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}` },
        });
        if (inviteeRes.ok) {
          const [invitee] = await inviteeRes.json();
          if (invitee?.email) {
            fetch('/api/email', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ type: 'circle_invite', to: invitee.email, circleName: circle?.name || 'a circle' }),
            }).catch(() => {});
          }
        }
      } catch { /* silent */ }
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

  const handleCoverCropConfirm = async (blob: Blob) => {
    setCoverCropSrc(null);
    const file = new File([blob], `circle-cover-${Date.now()}.jpg`, { type: 'image/jpeg' });
    await uploadCoverImage(file);
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

  const toggleCirclePrivacy = async () => {
    if (!circle || !isAdmin) return;
    const session = getStoredSession();
    if (!session?.user) return;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const headers = { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' };
    const newValue = !circle.is_public;
    const label = newValue ? 'public' : 'private';
    try {
      // Update circle visibility
      const res = await fetch(`${supabaseUrl}/rest/v1/circles?id=eq.${circleId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ is_public: newValue }),
      });
      if (!res.ok) throw new Error();
      setCircle(prev => prev ? { ...prev, is_public: newValue } : null);
      setConfirmPrivacyToggle(false);

      // Post system message to chat
      const systemMsg = `This circle has been made ${label}.`;
      const msgRes = await fetch(`${supabaseUrl}/rest/v1/circle_messages`, {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'return=representation' },
        body: JSON.stringify({ circle_id: circleId, sender_id: session.user.id, content: systemMsg, message_type: 'system' }),
      });
      if (msgRes.ok) {
        const [sentMsg] = await msgRes.json();
        const currentMember = members.find(m => m.member_id === session.user.id);
        setMessages(prev => [...prev, { ...sentMsg, sender_profile: currentMember?.profile }]);
      }

      // Notify all other members
      const otherMembers = members.filter(m => m.member_id !== session.user.id);
      for (const member of otherMembers) {
createNotification({
          userId: member.member_id,
          type: 'circle_update',
          title: circle.name,
          body: `This circle has been made ${label}.`,
          actorId: session.user.id,
          referenceId: circleId,
          accessToken: session.access_token,
        });
      }

      toast(`Circle is now ${label}`, 'success');
    } catch {
      toast('Failed to update circle visibility', 'error');
    }
  };

  const leaveOrCloseCircle = async () => {
    if (deletingCircle) return;
    setDeletingCircle(true);
    try {
      const session = getStoredSession();
      if (!session?.user) return;
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      const headers = { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' };

      // Get all members sorted by joined_at ascending (oldest = most senior)
      const membersRes = await fetch(
        `${supabaseUrl}/rest/v1/circle_members?circle_id=eq.${circleId}&order=joined_at.asc&select=id,member_id,role`,
        { headers }
      );
      const allMembers: { id: string; member_id: string; role: string }[] = await membersRes.json();
      const otherMembers = allMembers.filter(m => m.member_id !== currentUserId);

      if (otherMembers.length === 0) {
        // Last member — close the circle entirely
        await fetch(`${supabaseUrl}/rest/v1/circle_messages?circle_id=eq.${circleId}`, { method: 'DELETE', headers });
        await fetch(`${supabaseUrl}/rest/v1/circle_members?circle_id=eq.${circleId}`, { method: 'DELETE', headers });
        const res = await fetch(`${supabaseUrl}/rest/v1/circles?id=eq.${circleId}`, { method: 'DELETE', headers });
        if (!res.ok) throw new Error();
        toast('Circle closed', 'success');
        router.push('/circles');
      } else {
        // If owner, transfer ownership to next most senior member
        if (isAdmin) {
          const nextOwner = otherMembers[0];
          await fetch(
            `${supabaseUrl}/rest/v1/circle_members?id=eq.${nextOwner.id}`,
            { method: 'PATCH', headers, body: JSON.stringify({ role: 'admin' }) }
          );
          await fetch(
            `${supabaseUrl}/rest/v1/circles?id=eq.${circleId}`,
            { method: 'PATCH', headers, body: JSON.stringify({ created_by: nextOwner.member_id }) }
          );
        }
        // Remove self
        await fetch(
          `${supabaseUrl}/rest/v1/circle_members?circle_id=eq.${circleId}&member_id=eq.${currentUserId}`,
          { method: 'DELETE', headers }
        );
        toast('You have left the circle', 'success');
        router.push('/circles');
      }
    } catch {
      toast('Failed to leave circle', 'error');
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
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
          >
            Back to Circles
          </Link>
        </div>
      </div>
    );
  }

  const colors = getColorClasses(circle.color);

  return (
    <div className="fixed top-0 left-0 right-0 bg-gradient-to-b from-emerald-50 to-white flex flex-col overflow-hidden" style={{ bottom: '72px' }}>
      {/* Cover image crop modal */}
      {coverCropSrc && (
        <ImageCropModal
          imageSrc={coverCropSrc}
          aspect={16 / 9}
          circular={false}
          title="Crop cover photo"
          onConfirm={handleCoverCropConfirm}
          onCancel={() => setCoverCropSrc(null)}
        />
      )}

      {/* Header — flex-shrink-0, always visible */}
      <div className="flex-shrink-0 bg-white shadow-sm border-b border-gray-200" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
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
          {/* Always-visible compact name — keeps tab nav at stable position */}
          <div className="flex items-center gap-2 px-4 pb-2 -mt-1">
            {circle.emoji && <span className="text-base">{circle.emoji}</span>}
            <span className="text-sm font-semibold text-gray-900 truncate">{circle.name}</span>
            <span className="text-xs text-gray-400 ml-1">{circle.member_count} members</span>
          </div>
        </div>
      </div>

      {/* Tab Navigation — flex-shrink-0 */}
      <div className="flex-shrink-0 bg-white border-b border-gray-100 px-4 pb-3">
        <div className="max-w-md mx-auto">
          <div className="flex gap-1 bg-white rounded-xl p-1 shadow-sm border border-gray-100">
            <button
              onClick={() => setActiveTab('chat')}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'chat' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Chat {messages.length > 0 && `(${messages.length})`}
            </button>
            <button
              onClick={() => setActiveTab('info')}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'info' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Info
            </button>
          </div>
        </div>
      </div>

      {/* Content — flex-1, overflow-hidden so chat can control its own scroll */}
      <div className="flex-1 overflow-hidden max-w-md mx-auto w-full">
        {activeTab === 'chat' ? (
          <div className="flex flex-col h-full">
            {/* Pinned announcement */}
            {announcement && !announcementEdit && (
              <div className="mx-3 mt-2 mb-1 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 flex items-start gap-2">
                <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 3a1 1 0 00-1.447-.894L8.763 6H5a3 3 0 000 6h.28l1.771 5.316A1 1 0 008 18h1a1 1 0 001-1v-4.382l6.553 3.276A1 1 0 0018 15V3z" clipRule="evenodd" /></svg>
                <p className="text-xs text-amber-800 flex-1 leading-relaxed">{announcement}</p>
                {isAdmin && (
                  <button onClick={() => { setAnnouncementInput(announcement); setAnnouncementEdit(true); }} className="text-amber-500 hover:text-amber-700 ml-1 flex-shrink-0">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                  </button>
                )}
              </div>
            )}
            {announcementEdit && (
              <div className="mx-3 mt-2 mb-1 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 space-y-2">
                <textarea
                  value={announcementInput}
                  onChange={e => setAnnouncementInput(e.target.value)}
                  placeholder="Pin an announcement for the circle..."
                  className="w-full text-xs text-gray-800 bg-transparent resize-none border-none focus:outline-none"
                  rows={2}
                  maxLength={200}
                />
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setAnnouncementEdit(false)} className="text-xs text-gray-500 px-2 py-1 rounded-lg hover:bg-gray-100">Cancel</button>
                  <button onClick={async () => {
                    const session = getStoredSession();
                    if (!session) return;
                    await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/circles?id=eq.${circleId}`, {
                      method: 'PATCH',
                      headers: { 'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
                      body: JSON.stringify({ pinned_announcement: announcementInput || null, pinned_at: announcementInput ? new Date().toISOString() : null }),
                    });
                    setAnnouncement(announcementInput);
                    setAnnouncementEdit(false);
                  }} className="text-xs bg-emerald-600 text-white px-3 py-1 rounded-lg font-medium hover:bg-emerald-700">Save</button>
                </div>
              </div>
            )}
            {isAdmin && !announcement && !announcementEdit && (
              <button onClick={() => { setAnnouncementInput(''); setAnnouncementEdit(true); }} className="mx-3 mt-2 mb-1 text-xs text-amber-600 hover:text-amber-700 flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 3a1 1 0 00-1.447-.894L8.763 6H5a3 3 0 000 6h.28l1.771 5.316A1 1 0 008 18h1a1 1 0 001-1v-4.382l6.553 3.276A1 1 0 0018 15V3z" clipRule="evenodd" /></svg>
                Pin an announcement
              </button>
            )}
            <div className="flex-1 overflow-hidden">
              <ChatView
                onAvatarPress={(uid) => setProfileCardUserId(uid)}
                messages={messages as ChatViewMessage[]}
                currentUserId={currentUserId}
                reactions={circleReactions}
                onSend={sendMessage}
                onSendFile={sendCircleFile}
                onReact={toggleCircleReaction}
                onLongPress={msg => setContextMenuMsg(msg)}
                sending={sendingMessage}
                uploadingFile={uploadingChatFile}
                showSenderName={true}
                placeholder="Message the circle..."
                emptyText="No messages yet. Start the conversation!"
                scrollTrigger={activeTab}
              />
            </div>
          </div>
        ) : activeTab === 'info' ? (
          <div className="flex flex-col h-full">
            {/* Cover image banner */}
            {circle.cover_image_url && (
              <div className="relative w-full h-28 overflow-hidden flex-shrink-0">
                <img src={circle.cover_image_url} alt="Circle cover" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
              </div>
            )}
            {/* Info sub-tabs */}
            <div className="flex-shrink-0 bg-white border-b border-gray-100 px-4 py-2">
              <div className="flex gap-1">
                {(['members', 'resources', 'meetup', 'board'] as const).map(sub => (
                  <button
                    key={sub}
                    onClick={() => setInfoSubTab(sub)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      infoSubTab === sub ? 'bg-emerald-600 text-white' : 'text-gray-500 hover:text-gray-700 bg-gray-100'
                    }`}
                  >
                    {sub.charAt(0).toUpperCase() + sub.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            {/* Info sub-tab content */}
            <div className="flex-1 overflow-hidden">
              {infoSubTab === 'members' ? (
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
                    onClick={() => setProfileCardUserId(member.member_id)}
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
              ) : infoSubTab === 'resources' ? (
          // Resources View
          <div className="h-full overflow-y-auto p-4">
            {/* Add resource button */}
            <button
              onClick={() => setShowAddResource(v => !v)}
              className={`w-full mb-4 py-2.5 px-4 rounded-xl font-medium transition-colors ${showAddResource ? 'bg-gray-100 text-gray-700 hover:bg-gray-200' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
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

                {/* File attachment */}
                <div>
                  <input
                    ref={resourceFileRef}
                    type="file"
                    className="hidden"
                    onChange={e => setResourceFile(e.target.files?.[0] ?? null)}
                  />
                  {resourceFile ? (
                    <div className="flex items-center gap-2 px-3 py-2 bg-white border border-emerald-300 rounded-lg text-sm">
                      <svg className="w-4 h-4 text-emerald-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                      </svg>
                      <span className="flex-1 truncate text-gray-700">{resourceFile.name}</span>
                      <button
                        type="button"
                        onClick={() => { setResourceFile(null); if (resourceFileRef.current) resourceFileRef.current.value = ''; }}
                        className="text-gray-400 hover:text-red-400 text-lg leading-none flex-shrink-0"
                      >×</button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => resourceFileRef.current?.click()}
                      className="w-full px-3 py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-emerald-400 hover:text-emerald-600 bg-white text-left flex items-center gap-2"
                    >
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                      </svg>
                      Attach a file (optional)
                    </button>
                  )}
                </div>

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
                        {resource.description && (
                          <p className="text-sm text-gray-600 mt-1">{resource.description}</p>
                        )}
                        {resource.file_url && (
                          <a
                            href={resource.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            download={resource.file_name || true}
                            className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 bg-gray-100 hover:bg-emerald-50 border border-gray-200 hover:border-emerald-300 rounded-lg text-xs text-gray-600 hover:text-emerald-700 transition-colors"
                          >
                            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            {resource.file_name || 'Download file'}
                          </a>
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
              ) : infoSubTab === 'meetup' ? (
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
              <>
                <button
                  onClick={() => setShowMeetupForm(v => !v)}
                  className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors ${showMeetupForm ? 'bg-gray-100 text-gray-700' : 'bg-emerald-600 text-white'}`}
                >
                  {showMeetupForm ? 'Cancel' : circle?.next_meetup_date ? 'Edit meetup' : 'Schedule a meetup'}
                </button>
              {showMeetupForm && (
              <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
                {/* Date — calendar picker */}
                {(() => {
                  const [year, month] = meetupCalendarMonth.split('-').map(Number);
                  const firstDay = new Date(year, month - 1, 1).getDay();
                  const daysInMonth = new Date(year, month, 0).getDate();
                  const today = new Date().toISOString().slice(0, 10);
                  const prevMonth = () => { const d = new Date(year, month - 2, 1); setMeetupCalendarMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`); };
                  const nextMonth = () => { const d = new Date(year, month, 1); setMeetupCalendarMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`); };
                  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
                  return (
                    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                        <button type="button" onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">&#8249;</button>
                        <span className="text-sm font-semibold text-gray-900">{monthLabel}</span>
                        <button type="button" onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">&#8250;</button>
                      </div>
                      <div className="grid grid-cols-7 text-center px-2 pt-2">
                        {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
                          <div key={d} className="text-[10px] font-semibold text-gray-400 py-1">{d}</div>
                        ))}
                      </div>
                      <div className="grid grid-cols-7 px-2 pb-3 gap-y-1">
                        {Array.from({ length: firstDay }).map((_, i) => <div key={`e-${i}`} />)}
                        {Array.from({ length: daysInMonth }).map((_, i) => {
                          const day = i + 1;
                          const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                          const selected = meetupDate === dateStr;
                          const isPast = dateStr < today;
                          return (
                            <button key={day} type="button" disabled={isPast}
                              onClick={() => setMeetupDate(dateStr)}
                              className={`h-8 w-full rounded-lg text-xs font-semibold transition-colors ${selected ? 'bg-emerald-600 text-white' : isPast ? 'text-gray-200 cursor-not-allowed' : 'text-gray-700 hover:bg-emerald-50 hover:text-emerald-600'}`}
                            >{day}</button>
                          );
                        })}
                      </div>
                      {meetupDate && (
                        <div className="px-4 pb-3">
                          <span className="text-xs text-emerald-600 font-semibold">{new Date(meetupDate + 'T00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                        </div>
                      )}
                    </div>
                  );
                })()}
                {/* Time picker */}
                {(() => {
                  const [hStr, mStr] = meetupTime.split(':');
                  const hour24 = parseInt(hStr || '9', 10);
                  const isPM = hour24 >= 12;
                  const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
                  const minute = Math.round(parseInt(mStr || '0', 10) / 5) * 5 % 60;
                  const hours = [12,1,2,3,4,5,6,7,8,9,10,11];
                  const minutes = [0,5,10,15,20,25,30,35,40,45,50,55];
                  const formatted = `${hour12}:${String(minute).padStart(2,'0')} ${isPM ? 'PM' : 'AM'}`;
                  const setHour = (h12: number) => { const h24 = h12 === 12 ? (isPM ? 12 : 0) : isPM ? h12 + 12 : h12; setMeetupTime(`${String(h24).padStart(2,'0')}:${String(minute).padStart(2,'0')}`); };
                  const setMin = (m: number) => { setMeetupTime(`${String(hour24).padStart(2,'0')}:${String(m).padStart(2,'0')}`); };
                  const toggleAmPm = (pm: boolean) => { const h24 = hour12 === 12 ? (pm ? 12 : 0) : pm ? hour12 + 12 : hour12; setMeetupTime(`${String(h24).padStart(2,'0')}:${String(minute).padStart(2,'0')}`); };
                  return (
                    <div>
                      <button type="button" onClick={() => setShowMeetupTimePicker(v => !v)}
                        className="w-full flex items-center justify-between px-4 py-3 bg-white border border-gray-200 rounded-xl hover:border-emerald-300 transition-colors">
                        <span className="text-sm text-gray-500">Time</span>
                        <span className="text-lg font-bold text-gray-900 font-mono">{formatted}</span>
                      </button>
                      {showMeetupTimePicker && (
                        <div className="mt-2 rounded-2xl border border-gray-200 overflow-hidden shadow-md bg-white">
                          <div className="relative" style={{height: 200}}>
                            <div className="absolute inset-x-0 pointer-events-none z-10" style={{top: '50%', transform: 'translateY(-50%)', height: 40, background: 'rgba(16,185,129,0.07)', borderTop: '1.5px solid rgba(16,185,129,0.2)', borderBottom: '1.5px solid rgba(16,185,129,0.2)'}} />
                            <div className="flex h-full">
                              <div className="flex-1 overflow-y-scroll" style={{scrollSnapType:'y mandatory', scrollbarWidth:'none'}}
                                ref={el => { if (el) { const idx = hours.indexOf(hour12); el.scrollTop = idx * 40; } }}>
                                <div style={{paddingTop: 80, paddingBottom: 80}}>
                                  {hours.map(h => (
                                    <div key={h} onClick={() => setHour(h)} style={{scrollSnapAlign:'center', height: 40}}
                                      className={`flex items-center justify-center text-xl font-bold cursor-pointer transition-colors ${h === hour12 ? 'text-emerald-600' : 'text-gray-300'}`}>
                                      {String(h).padStart(2,'0')}
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <div className="flex items-center justify-center w-5 text-xl font-bold text-gray-300 flex-shrink-0 pointer-events-none">:</div>
                              <div className="flex-1 overflow-y-scroll" style={{scrollSnapType:'y mandatory', scrollbarWidth:'none'}}
                                ref={el => { if (el) { const idx = minutes.indexOf(minute); el.scrollTop = idx * 40; } }}>
                                <div style={{paddingTop: 80, paddingBottom: 80}}>
                                  {minutes.map(m => (
                                    <div key={m} onClick={() => setMin(m)} style={{scrollSnapAlign:'center', height: 40}}
                                      className={`flex items-center justify-center text-xl font-bold cursor-pointer transition-colors ${m === minute ? 'text-emerald-600' : 'text-gray-300'}`}>
                                      {String(m).padStart(2,'0')}
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <div className="flex flex-col items-center justify-center gap-2 px-3 flex-shrink-0 border-l border-gray-100">
                                <button type="button" onClick={() => toggleAmPm(false)} className={`w-12 py-2.5 rounded-xl text-sm font-bold transition-colors ${!isPM ? 'bg-emerald-600 text-white' : 'text-gray-400 hover:bg-gray-100'}`}>AM</button>
                                <button type="button" onClick={() => toggleAmPm(true)} className={`w-12 py-2.5 rounded-xl text-sm font-bold transition-colors ${isPM ? 'bg-emerald-600 text-white' : 'text-gray-400 hover:bg-gray-100'}`}>PM</button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
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
                          setShowMeetupForm(false);
                        }
                      } catch { /* silent */ }
                      finally { setSavingMeetup(false); }
                    }}
                    className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold disabled:bg-gray-300 transition-colors"
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
                          setMeetupDate(''); setMeetupTime('09:00'); setMeetupLocation(''); setMeetupNotes('');
                          setShowMeetupForm(false);
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
              </>
            )}
          </div>
              ) : infoSubTab === 'board' ? (
          <div className="h-full overflow-y-auto p-4">
            <div className="pt-4">
              {/* Post button */}
              <button
                onClick={() => setShowBoardCreate(v => !v)}
                className="w-full py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl mb-4"
              >
                {showBoardCreate ? 'Cancel' : '+ New post'}
              </button>

              {/* Create form */}
              {showBoardCreate && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4 space-y-3">
                  <input
                    placeholder="Title"
                    value={boardTitle}
                    onChange={e => setBoardTitle(e.target.value)}
                    maxLength={120}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <div className="relative">
                    {showBoardEmojiPicker && (
                      <EmojiPicker
                        onSelect={emoji => {
                          const el = boardTextareaRef.current;
                          if (el) {
                            const start = el.selectionStart ?? boardContent.length;
                            const end = el.selectionEnd ?? boardContent.length;
                            const next = boardContent.slice(0, start) + emoji + boardContent.slice(end);
                            setBoardContent(next);
                            setTimeout(() => { el.focus(); el.setSelectionRange(start + emoji.length, start + emoji.length); }, 0);
                          } else {
                            setBoardContent(v => v + emoji);
                          }
                        }}
                        onClose={() => setShowBoardEmojiPicker(false)}
                      />
                    )}
                    <textarea
                      ref={boardTextareaRef}
                      placeholder="Share something with the circle..."
                      value={boardContent}
                      onChange={e => setBoardContent(e.target.value)}
                      rows={3}
                      maxLength={1000}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowBoardEmojiPicker(v => !v)}
                      className="absolute bottom-2 right-2 p-1 text-gray-400 hover:text-emerald-600 transition-colors"
                      title="Emoji"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </button>
                  </div>
                  <select
                    value={boardTag}
                    onChange={e => setBoardTag(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="general">General</option>
                    <option value="question">Question</option>
                    <option value="curriculum">Curriculum</option>
                    <option value="resource">Resource</option>
                    <option value="meetup">Meetup idea</option>
                  </select>
                  <button
                    onClick={submitBoardPost}
                    disabled={boardPosting || !boardTitle.trim() || !boardContent.trim()}
                    className="w-full py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl disabled:opacity-50"
                  >
                    {boardPosting ? 'Posting...' : 'Post'}
                  </button>
                </div>
              )}

              {/* Posts list */}
              {boardLoading ? (
                <div className="space-y-3">
                  {[1,2,3].map(i => (
                    <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 animate-pulse">
                      <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
                      <div className="h-3 bg-gray-100 rounded w-full mb-1" />
                      <div className="h-3 bg-gray-100 rounded w-2/3" />
                    </div>
                  ))}
                </div>
              ) : boardPosts.length === 0 ? (
                <div className="text-center py-12 px-6">                  <p className="font-semibold text-gray-800 mb-1">Nothing posted yet</p>
                  <p className="text-sm text-gray-500">Be the first to share something with the circle.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {boardPosts.map(post => (
                    <div key={post.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full mr-2 ${BOARD_TAG_COLORS[post.tag] || 'bg-gray-100 text-gray-600'}`}>
                            {post.tag}
                          </span>
                          <span className="text-xs text-gray-400">{new Date(post.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</span>
                        </div>
                        {post.author_id === currentUserId && (
                          <button
                            onClick={() => deleteBoardPost(post.id)}
                            className="text-xs text-gray-400 hover:text-red-500"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                      <p className="font-semibold text-gray-900 text-sm mb-1">{post.title}</p>
                      <p className="text-sm text-gray-600 leading-relaxed">{post.content}</p>
                      <p className="text-xs text-gray-400 mt-2">— {post.author?.display_name || post.author?.family_name}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
              ) : null}
            </div>
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
              <div className="flex justify-between items-center gap-2">
                <h3 className="text-lg font-bold text-gray-900 truncate">Circle Settings</h3>
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
                        onChange={e => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          const reader = new FileReader();
                          reader.onload = () => setCoverCropSrc(reader.result as string);
                          reader.readAsDataURL(f);
                          e.target.value = '';
                        }}
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
                      setActiveTab('info');
                      setInfoSubTab('members');
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

              {/* Visibility */}
              {isAdmin && (
                <div className="pt-4 border-t border-gray-100">
                  <h4 className="font-semibold text-gray-900 mb-3">Visibility</h4>
                  {!confirmPrivacyToggle ? (
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {circle?.is_public ? 'Public circle' : 'Private circle'}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {circle?.is_public
                            ? 'Anyone can find and request to join this circle.'
                            : 'Only invited members can see and join this circle.'}
                        </p>
                      </div>
                      <button
                        onClick={() => setConfirmPrivacyToggle(true)}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${circle?.is_public ? 'bg-emerald-500' : 'bg-gray-300'}`}
                      >
                        <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${circle?.is_public ? 'translate-x-5' : 'translate-x-0'}`} />
                      </button>
                    </div>
                  ) : (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                      <p className="text-sm font-semibold text-amber-800 mb-1">
                        Make this circle {circle?.is_public ? 'private' : 'public'}?
                      </p>
                      <p className="text-xs text-amber-600 mb-3">
                        {circle?.is_public
                          ? 'The circle will no longer appear in Discover. All members will be notified.'
                          : 'The circle will appear in Discover for anyone to find. All members will be notified.'}
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={toggleCirclePrivacy}
                          className="flex-1 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700"
                        >
                          Yes, confirm
                        </button>
                        <button
                          onClick={() => setConfirmPrivacyToggle(false)}
                          className="flex-1 py-2 bg-gray-100 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-200"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Danger zone — all members */}
              <div className="pt-4 border-t border-red-100">
                <h4 className="font-semibold text-red-600 mb-3">Danger Zone</h4>
                {!confirmDeleteCircle ? (
                  <button
                    onClick={() => setConfirmDeleteCircle(true)}
                    className="w-full p-3 text-left bg-red-50 hover:bg-red-100 rounded-xl transition-colors border border-red-200"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-red-700 font-medium text-sm">
                        {members.length <= 1 ? 'Close Circle' : 'Leave Circle'}
                      </span>
                      <span className="text-red-400">→</span>
                    </div>
                    <p className="text-xs text-red-500 mt-0.5">
                      {members.length <= 1
                        ? 'You are the last member. Closing will permanently delete this circle.'
                        : isAdmin
                          ? 'You will leave and ownership will pass to the next member.'
                          : 'You will be removed from this circle.'}
                    </p>
                  </button>
                ) : (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                    <p className="text-sm font-semibold text-red-700 mb-1">
                      {members.length <= 1 ? 'Close this circle?' : 'Leave this circle?'}
                    </p>
                    <p className="text-xs text-red-500 mb-3">
                      {members.length <= 1
                        ? 'This cannot be undone. All messages will be deleted.'
                        : isAdmin
                          ? 'Ownership will transfer to the next most senior member.'
                          : 'You will be removed from the circle.'}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={leaveOrCloseCircle}
                        disabled={deletingCircle}
                        className="flex-1 py-2 bg-red-600 text-white text-sm font-semibold rounded-xl hover:bg-red-700 disabled:opacity-50"
                      >
                        {deletingCircle ? 'Please wait...' : members.length <= 1 ? 'Yes, close' : 'Yes, leave'}
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
            </div>
          </div>
        </div>
      )}

      {/* Member Profile Modal */}
      {profileCardUserId && (
        <ProfileCardModal
          userId={profileCardUserId}
          onClose={() => setProfileCardUserId(null)}
          currentUserId={currentUserId || ''}
        />
      )}

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
                    className="flex-1 px-4 py-3 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-colors text-center"
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

      {/* Circle chat context menu — portal renders above everything */}
      {contextMenuMsg && (
        <MessageContextMenu
          message={contextMenuMsg}
          currentUserId={currentUserId}
          reactions={circleReactions[contextMenuMsg.id] || []}
          onReact={emoji => toggleCircleReaction(contextMenuMsg.id, emoji)}
          onClose={() => setContextMenuMsg(null)}
          onCopy={() => { navigator.clipboard.writeText(contextMenuMsg.content).catch(() => {}); toast('Copied!', 'success'); }}
          onSave={() => { navigator.clipboard.writeText(contextMenuMsg.content).catch(() => {}); toast('Message saved', 'success'); }}
        />
      )}
    </div>
  );
}