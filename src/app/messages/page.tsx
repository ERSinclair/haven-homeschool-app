'use client';
import { toast } from '@/lib/toast';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getStoredSession } from '@/lib/session';
import { sendPush } from '@/lib/push';
import { getAvatarColor } from '@/lib/colors';
import AvatarUpload from '@/components/AvatarUpload';
import AppHeader from '@/components/AppHeader';
import ProtectedRoute from '@/components/ProtectedRoute';

type Conversation = {
  id: string;
  other_user: {
    id: string;
    family_name: string;
    display_name: string;
    avatar_url?: string;
    location_name: string;
  };
  last_message_text: string | null;
  last_message_at: string | null;
  unread: boolean;
};

type Message = {
  id: string;
  content: string;
  sender_id: string;
  created_at: string;
  file_url?: string;
  file_type?: string;
};

function MessagesContent() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [showDeleteMessageModal, setShowDeleteMessageModal] = useState(false);
  const [selectedMessages, setSelectedMessages] = useState<string[]>([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedConversations, setSelectedConversations] = useState<string[]>([]);
  const [conversationSelectionMode, setConversationSelectionMode] = useState(false);
  const [longPressTimer, setLongPressTimer] = useState<NodeJS.Timeout | null>(null);
  const [showDeleteConversationModal, setShowDeleteConversationModal] = useState(false);
  const [connectionRequests, setConnectionRequests] = useState<Map<string, {status: string, isRequester: boolean}>>(new Map());
  const [showSearch, setShowSearch] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [savedMessages, setSavedMessages] = useState<Message[]>([]);
  const [showMessageContextMenu, setShowMessageContextMenu] = useState(false);
  const [contextMenuMessage, setContextMenuMessage] = useState<Message | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [lightboxMsgId, setLightboxMsgId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showSuccessNotification, setShowSuccessNotification] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
  
  // New message modal state
  const [showNewMessageModal, setShowNewMessageModal] = useState(false);
  const [availableConnections, setAvailableConnections] = useState<any[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [contactSearchTerm, setContactSearchTerm] = useState('');
  const [newMessageText, setNewMessageText] = useState('');
  const [loadingConnections, setLoadingConnections] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Reusable function to load conversations
  const reloadConversations = async (signal?: AbortSignal) => {
    const session = getStoredSession();
    if (!session?.user) return;

    try {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/conversations?or=(participant_1.eq.${session.user.id},participant_2.eq.${session.user.id})&select=*`,
        {
          headers: {
            'apikey': supabaseKey!,
            'Authorization': `Bearer ${session.access_token}`,
          },
          signal,
        }
      );
      
      if (signal?.aborted) return;
      
      const convos = await res.json();
      
      const enriched = await Promise.all(convos.map(async (c: any) => {
        const otherId = c.participant_1 === session.user.id ? c.participant_2 : c.participant_1;
        
        const profileRes = await fetch(
          `${supabaseUrl}/rest/v1/profiles?id=eq.${otherId}&select=id,family_name,display_name,avatar_url,location_name`,
          {
            headers: {
              'apikey': supabaseKey!,
              'Authorization': `Bearer ${session.access_token}`,
            },
            signal,
          }
        );
        
        if (signal?.aborted) return null;
        
        const profiles = await profileRes.json();
        
        return {
          id: c.id,
          other_user: profiles[0] || { id: otherId, family_name: 'Unknown', display_name: 'Unknown', location_name: '', avatar_url: null },
          last_message_text: c.last_message_text,
          last_message_at: c.last_message_at,
          unread: c.last_message_by && c.last_message_by !== session.user.id,
        };
      }));
      
      if (!signal?.aborted) {
        setConversations(enriched.filter(Boolean));
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        console.error('Error reloading conversations:', err);
      }
    }
  };

  // Load conversations
  useEffect(() => {
    const abortController = new AbortController();
    
    const loadConversations = async () => {
      const session = getStoredSession();
      if (!session?.user) {
        router.push('/login');
        return;
      }
      setUserId(session.user.id);

      try {
        await reloadConversations(abortController.signal);
        await loadConnectionRequests(abortController.signal);
        await loadPendingRequestsCount(abortController.signal);
        
        const openId = searchParams.get('open');
        if (openId) {
          setSelectedId(openId);
        }
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          console.error('Error loading conversations:', err);
        }
      } finally {
        if (!abortController.signal.aborted) {
          setLoading(false);
        }
      }
    };

    loadConversations();
    
    return () => {
      abortController.abort();
    };
  }, [router, searchParams]);

  useEffect(() => {
    if (!selectedId || !userId) return;
    
    const abortController = new AbortController();
    
    const loadMessages = async () => {
      const session = getStoredSession();
      if (!session) return;

      // Handle saved messages separately - don't query the database
      if (selectedId === 'saved-messages') {
        return; // Let loadSavedMessages handle this
      }

      try {
        const res = await fetch(
          `${supabaseUrl}/rest/v1/messages?conversation_id=eq.${selectedId}&select=*&order=created_at.asc`,
          {
            headers: {
              'apikey': supabaseKey!,
              'Authorization': `Bearer ${session.access_token}`,
            },
            signal: abortController.signal,
          }
        );
        
        if (abortController.signal.aborted) return;
        
        const msgs = await res.json();
        setMessages(msgs);

        // Mark conversation as read by clearing unread status
        // This happens when user opens a conversation
        await fetch(
          `${supabaseUrl}/rest/v1/conversations?id=eq.${selectedId}`,
          {
            method: 'PATCH',
            headers: {
              'apikey': supabaseKey!,
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              // We can use a specific field for marking as read, or just not update last_message_by
              // For now, we'll leave it as is since the main unread logic is in BottomNav
            }),
            signal: abortController.signal,
          }
        );
        
        // Update local conversations state to remove unread indicator  
        if (!abortController.signal.aborted) {
          setConversations(prev => prev.map(c => 
            c.id === selectedId 
              ? { ...c, unread: false }
              : c
          ));
        }
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          console.error('Error loading messages:', err);
        }
      }
    };

    if (selectedId === 'saved-messages') {
      loadSavedMessages();
    } else {
      loadMessages();
    }
    
    return () => {
      abortController.abort();
    };
  }, [selectedId, userId]);

  // Reset to conversation list when Message tab is tapped while already on /messages
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.href === '/messages') setSelectedId(null);
    };
    window.addEventListener('haven-nav-reset', handler);
    return () => window.removeEventListener('haven-nav-reset', handler);
  }, []);

  // Cleanup timer on unmount and clear selection when switching conversations
  useEffect(() => {
    setSelectionMode(false);
    setSelectedMessages([]);
    setConversationSelectionMode(false);
    setSelectedConversations([]);
    return () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
      }
    };
  }, [selectedId]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
      }
    };
  }, [longPressTimer]);

  // Periodic check for new connection requests
  useEffect(() => {
    if (!userId) return;

    // Check every 30 seconds for new requests
    const interval = setInterval(() => {
      loadPendingRequestsCount();
    }, 30000);
    
    return () => clearInterval(interval);
  }, [userId]);

  // Scroll to bottom whenever messages load or a new message arrives
  useEffect(() => {
    if (messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
    }
  }, [messages]);

  const sendMessageHandler = async () => {
    if ((!newMessage.trim() && !selectedFile) || !selectedId || !userId) return;
    
    const session = getStoredSession();
    if (!session) return;

    setSending(true);
    
    try {
      let fileUrl = null;
      let fileType = null;
      
      // Upload file if present
      if (selectedFile) {
        try {
          // Check file size (5MB limit)
          if (selectedFile.size > 5 * 1024 * 1024) {
            throw new Error('File size must be less than 5MB');
          }

          // Generate unique filename
          const fileExt = selectedFile.name.split('.').pop();
          const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
          const filePath = `${userId}/${fileName}`;

          // Upload to Supabase Storage
          const formData = new FormData();
          formData.append('file', selectedFile);

          const uploadResponse = await fetch(
            `${supabaseUrl}/storage/v1/object/message-files/${filePath}`,
            {
              method: 'POST',
              headers: {
                'apikey': supabaseKey!,
                'Authorization': `Bearer ${session.access_token}`,
              },
              body: formData,
            }
          );

          if (!uploadResponse.ok) {
            throw new Error('Failed to upload file');
          }

          // Get public URL
          fileUrl = `${supabaseUrl}/storage/v1/object/public/message-files/${filePath}`;
          fileType = selectedFile.type.startsWith('image/') ? 'image' : 'file';
        } catch (fileError) {
          console.error('File upload error:', fileError);
          toast('Failed to upload file. Please try again.', 'error');
          setSelectedFile(null);
          return;
        }
      }

      // Prepare message data - handle both new schema (with file_url/file_type) and old schema
      const messageData: any = {
        conversation_id: selectedId,
        sender_id: userId,
        content: fileUrl 
          ? `${fileUrl}${newMessage ? ' ' + newMessage : ''}` 
          : newMessage,
      };
      
      // Add file fields if we have a file (will be ignored if columns don't exist)
      if (fileUrl) {
        messageData.file_url = fileUrl;
        messageData.file_type = fileType;
      }

      const res = await fetch(
        `${supabaseUrl}/rest/v1/messages`,
        {
          method: 'POST',
          headers: {
            'apikey': supabaseKey!,
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
          },
          body: JSON.stringify(messageData),
        }
      );
      
      if (res.ok) {
        const [newMsg] = await res.json();
        // Always carry file_url/file_type in local state even if DB column doesn't exist
        const msgWithFile = {
          ...newMsg,
          ...(messageData.file_url ? { file_url: messageData.file_url, file_type: messageData.file_type } : {}),
        };
        setMessages(prev => [...prev, msgWithFile]);
        setNewMessage('');
        setSelectedFile(null);
        
        // Reset textarea height
        const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
        if (textarea) {
          textarea.style.height = '48px';
        }
        
        // Scroll handled by useEffect on messages state change
        
        await fetch(
          `${supabaseUrl}/rest/v1/conversations?id=eq.${selectedId}`,
          {
            method: 'PATCH',
            headers: {
              'apikey': supabaseKey!,
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              last_message_text: newMessage,
              last_message_at: new Date().toISOString(),
              last_message_by: userId,
            }),
          }
        );

        // Push notification to recipient (fire-and-forget)
        const recipientId = conversations.find(c => c.id === selectedId)?.other_user?.id;
        if (recipientId) {
          const senderName = conversations.find(c => c.id === selectedId)
            ? 'New message'
            : 'New message';
          sendPush(
            session.access_token,
            recipientId,
            'New message on Haven',
            newMessage || 'Sent you a photo',
            '/messages'
          );
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        console.error('Error sending message:', err);
      }
    } finally {
      setSending(false);
    }
  };

  const deleteConversation = async () => {
    if (!selectedId || !userId) return;
    
    const session = getStoredSession();
    if (!session) return;

    try {
      // Delete all messages in the conversation first
      const deleteMessagesRes = await fetch(
        `${supabaseUrl}/rest/v1/messages?conversation_id=eq.${selectedId}`,
        {
          method: 'DELETE',
          headers: {
            'apikey': supabaseKey!,
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (!deleteMessagesRes.ok) {
        throw new Error(`Failed to delete messages: ${deleteMessagesRes.status}`);
      }

      // Delete the conversation
      const deleteConvoRes = await fetch(
        `${supabaseUrl}/rest/v1/conversations?id=eq.${selectedId}`,
        {
          method: 'DELETE',
          headers: {
            'apikey': supabaseKey!,
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (!deleteConvoRes.ok) {
        throw new Error(`Failed to delete conversation: ${deleteConvoRes.status}`);
      }

      // Update local state only after successful deletion
      setConversations(prev => prev.filter(c => c.id !== selectedId));
      setSelectedId(null);
      setMessages([]);
      setShowDeleteModal(false);
      setShowOptionsMenu(false);
      
      // Don't reload immediately - trust local state to prevent reappearing items
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        console.error('Error deleting conversation:', err);
        toast('Failed to delete conversation. Please try again.', 'error');
      }
    }
  };

  const deleteSelectedMessages = async () => {
    if (selectedMessages.length === 0 || !userId) return;
    
    const session = getStoredSession();
    if (!session) return;

    try {
      // Delete all selected messages
      for (const messageId of selectedMessages) {
        const deleteRes = await fetch(
          `${supabaseUrl}/rest/v1/messages?id=eq.${messageId}`,
          {
            method: 'DELETE',
            headers: {
              'apikey': supabaseKey!,
              'Authorization': `Bearer ${session.access_token}`,
            },
          }
        );

        if (!deleteRes.ok) {
          throw new Error(`Failed to delete message ${messageId}: ${deleteRes.status}`);
        }
      }

      // Update local state only after successful deletion
      setMessages(prev => prev.filter(m => !selectedMessages.includes(m.id)));
      setSelectedMessages([]);
      setSelectionMode(false);
      setShowDeleteMessageModal(false);
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        console.error('Error deleting messages:', err);
        toast('Failed to delete messages. Please try again.', 'error');
      }
    }
  };

  const handleMessageLongPress = (messageId: string) => {
    const msg = messages.find(m => m.id === messageId);
    if (!msg) return;
    setContextMenuMessage(msg);
    setShowMessageContextMenu(true);
  };

  const getMessageFileUrl = (msg: Message): { fileUrl: string; isImage: boolean } | null => {
    const storagePattern = /(https?:\/\/[^\s]+\/storage\/v1\/object\/public\/message-files\/[^\s]+)/;
    // Only use file_url if it looks like a real URL
    const directUrl = msg.file_url?.startsWith('http') ? msg.file_url : null;
    const fileUrl = directUrl || (storagePattern.exec(msg.content)?.[0]);
    if (!fileUrl) return null;
    const isImage = /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(fileUrl);
    return { fileUrl, isImage };
  };

  const downloadSelectedFiles = () => {
    selectedMessages.forEach(id => {
      const msg = messages.find(m => m.id === id);
      if (!msg) return;
      const file = getMessageFileUrl(msg);
      if (file?.fileUrl) {
        const a = document.createElement('a');
        a.href = file.fileUrl;
        a.download = file.fileUrl.split('/').pop() || 'file';
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    });
  };

  const saveSelectedMessages = async () => {
    const existing = JSON.parse(localStorage.getItem('haven-saved-messages') || '[]');
    const toSave = selectedMessages
      .map(id => messages.find(m => m.id === id))
      .filter(Boolean)
      .map(msg => ({ ...msg, id: `saved-${Date.now()}-${msg!.id}`, savedAt: new Date().toISOString() }));
    const updated = [...existing, ...toSave];
    localStorage.setItem('haven-saved-messages', JSON.stringify(updated));
    setSavedMessages(updated);
    setSelectedMessages([]);
    setSelectionMode(false);
    setSuccessMessage(`${toSave.length} item${toSave.length !== 1 ? 's' : ''} saved!`);
    setShowSuccessNotification(true);
    setTimeout(() => setShowSuccessNotification(false), 3000);
  };

  const saveMessageToSaved = async (message: Message) => {
    try {
      const existing = JSON.parse(localStorage.getItem('haven-saved-messages') || '[]');
      const newSaved = { ...message, id: `saved-${Date.now()}`, savedAt: new Date().toISOString() };
      const updated = [...existing, newSaved];
      localStorage.setItem('haven-saved-messages', JSON.stringify(updated));
      setSavedMessages(updated);
      setShowMessageContextMenu(false);
      setContextMenuMessage(null);
      setSuccessMessage('Message saved!');
      setShowSuccessNotification(true);
      setTimeout(() => setShowSuccessNotification(false), 3000);
    } catch (err) {
      console.error('Error saving message:', err);
      toast('Failed to save message', 'error');
    }
  };

  const handleMessageTap = (messageId: string) => {
    if (selectionMode) {
      setSelectedMessages(prev => 
        prev.includes(messageId) 
          ? prev.filter(id => id !== messageId)
          : [...prev, messageId]
      );
    }
  };

  const handleConversationLongPress = (conversationId: string) => {
    if (!conversationSelectionMode && conversationId !== 'saved-messages') {
      setConversationSelectionMode(true);
      setSelectedConversations([conversationId]);
    }
  };

  const handleConversationTap = (conversationId: string) => {
    if (conversationSelectionMode) {
      setSelectedConversations(prev => 
        prev.includes(conversationId) 
          ? prev.filter(id => id !== conversationId)
          : [...prev, conversationId]
      );
    } else {
      if (conversationId === 'saved-messages') {
        // Load saved messages instead of regular conversation messages
        loadSavedMessages();
      }
      setSelectedId(conversationId);
    }
  };

  const loadSavedMessages = async () => {
    try {
      const saved = JSON.parse(localStorage.getItem('haven-saved-messages') || '[]');
      setMessages(saved);
      setSavedMessages(saved);
    } catch (err) {
      console.error('Error loading saved messages:', err);
    }
  };

  const deleteSelectedConversations = async () => {
    if (selectedConversations.length === 0 || !userId) return;
    
    const session = getStoredSession();
    if (!session) return;

    try {
      // Delete all selected conversations
      for (const conversationId of selectedConversations) {
        // Delete all messages in the conversation first
        const deleteMessagesRes = await fetch(
          `${supabaseUrl}/rest/v1/messages?conversation_id=eq.${conversationId}`,
          {
            method: 'DELETE',
            headers: {
              'apikey': supabaseKey!,
              'Authorization': `Bearer ${session.access_token}`,
            },
          }
        );

        if (!deleteMessagesRes.ok) {
          throw new Error(`Failed to delete messages for conversation ${conversationId}: ${deleteMessagesRes.status}`);
        }

        // Delete the conversation
        const deleteConvoRes = await fetch(
          `${supabaseUrl}/rest/v1/conversations?id=eq.${conversationId}`,
          {
            method: 'DELETE',
            headers: {
              'apikey': supabaseKey!,
              'Authorization': `Bearer ${session.access_token}`,
            },
          }
        );

        if (!deleteConvoRes.ok) {
          throw new Error(`Failed to delete conversation ${conversationId}: ${deleteConvoRes.status}`);
        }
      }

      // Update local state only after successful deletion
      setConversations(prev => prev.filter(c => !selectedConversations.includes(c.id)));
      setSelectedConversations([]);
      setConversationSelectionMode(false);
      setShowDeleteConversationModal(false);
      
      // If we deleted the currently selected conversation, clear it
      if (selectedId && selectedConversations.includes(selectedId)) {
        setSelectedId(null);
        setMessages([]);
      }
      
      // Don't reload immediately - trust local state to prevent reappearing items
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        console.error('Error deleting conversations:', err);
        toast('Failed to delete conversations. Please try again.', 'error');
      }
    }
  };

  const cancelConversationSelection = () => {
    setConversationSelectionMode(false);
    setSelectedConversations([]);
  };

  const cancelSelection = () => {
    setSelectionMode(false);
    setSelectedMessages([]);
  };

  // Helper function to get connection button state
  const getConnectionButtonState = (userId: string) => {
    const connection = connectionRequests.get(userId);
    
    if (!connection) {
      return { text: 'Connect', disabled: false, style: 'bg-emerald-600 text-white hover:bg-emerald-700' };
    }
    
    switch (connection.status) {
      case 'accepted':
        return { text: 'Connected', disabled: true, style: 'bg-green-100 text-green-700 border border-green-200' };
      case 'pending':
        if (connection.isRequester) {
          return { text: 'Requested', disabled: false, style: 'bg-gray-100 text-gray-600 border border-gray-300' };
        } else {
          return { text: 'Accept Request', disabled: false, style: 'bg-blue-600 text-white hover:bg-blue-700' };
        }
      default:
        return { text: 'Connect', disabled: false, style: 'bg-emerald-600 text-white hover:bg-emerald-700' };
    }
  };

  // Connection request functionality
  const sendConnectionRequest = async (userId: string) => {
    try {
      const session = getStoredSession();
      if (!session?.user) {
        toast('Please log in to send connection requests', 'error');
        return;
      }

      const existingConnection = connectionRequests.get(userId);

      // If already connected, do nothing
      if (existingConnection?.status === 'accepted') {
        toast('You are already connected with this user.', 'info');
        return;
      }

      // If pending request exists and user is the requester, allow unsending
      if (existingConnection?.status === 'pending' && existingConnection.isRequester) {
        // Remove/unsend the connection request
        const response = await fetch(
          `${supabaseUrl}/rest/v1/connections?requester_id=eq.${session.user.id}&receiver_id=eq.${userId}`,
          {
            method: 'DELETE',
            headers: {
              'apikey': supabaseKey!,
              'Authorization': `Bearer ${session.access_token}`,
            },
          }
        );

        if (!response.ok) {
          throw new Error('Failed to remove connection request');
        }

        // Update UI state - remove from map
        setConnectionRequests(prev => {
          const newMap = new Map(prev);
          newMap.delete(userId);
          return newMap;
        });
        
        return;
      }

      // If there's a pending request where current user is receiver, don't allow sending back
      if (existingConnection?.status === 'pending' && !existingConnection.isRequester) {
        toast('This user has already sent you a connection request. Please check your connections page to accept it.', 'info');
        return;
      }

      // Create new connection request (only if no connection exists)
      if (!existingConnection) {
        const response = await fetch(
          `${supabaseUrl}/rest/v1/connections`,
          {
            method: 'POST',
            headers: {
              'apikey': supabaseKey!,
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=minimal',
            },
            body: JSON.stringify({
              requester_id: session.user.id,
              receiver_id: userId,
              status: 'pending'
            }),
          }
        );

        if (!response.ok) {
          const error = await response.text();
          throw new Error(error);
        }

        // Update UI state - add to map
        setConnectionRequests(prev => {
          const newMap = new Map(prev);
          newMap.set(userId, { status: 'pending', isRequester: true });
          return newMap;
        });
        
      }
      
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error('Error with connection request:', error);
        if (error.message.includes('duplicate key value')) {
          toast('Connection request already sent to this user.', 'info');
        } else {
          toast('Failed to process connection request. Please try again.', 'error');
        }
      }
    }
  };

  // Load existing connections and requests
  const loadConnectionRequests = async (signal?: AbortSignal) => {
    try {
      const session = getStoredSession();
      if (!session?.user) return;

      // Get ALL connections involving current user (sent, received, accepted, pending)
      const response = await fetch(
        `${supabaseUrl}/rest/v1/connections?or=(requester_id.eq.${session.user.id},receiver_id.eq.${session.user.id})&select=requester_id,receiver_id,status`,
        {
          headers: {
            'apikey': supabaseKey!,
            'Authorization': `Bearer ${session.access_token}`,
          },
          signal,
        }
      );

      if (response.ok && !signal?.aborted) {
        const connections = await response.json();
        const connectionMap = new Map<string, {status: string, isRequester: boolean}>();
        
        connections.forEach((conn: any) => {
          // Map the other person's ID to connection status and role
          if (conn.requester_id === session.user.id) {
            connectionMap.set(conn.receiver_id, {
              status: conn.status,
              isRequester: true
            });
          } else {
            connectionMap.set(conn.requester_id, {
              status: conn.status,
              isRequester: false
            });
          }
        });
        
        setConnectionRequests(connectionMap);
      }
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error('Error loading connection requests:', error);
      }
    }
  };

  // Load pending connection requests count
  const loadPendingRequestsCount = async (signal?: AbortSignal) => {
    try {
      const session = getStoredSession();
      if (!session?.user) return;

      // Get pending connection requests received by current user
      const response = await fetch(
        `${supabaseUrl}/rest/v1/connections?status=eq.pending&receiver_id=eq.${session.user.id}&select=id`,
        {
          headers: {
            'apikey': supabaseKey!,
            'Authorization': `Bearer ${session.access_token}`,
          },
          signal,
        }
      );

      if (response.ok && !signal?.aborted) {
        const requests = await response.json();
        setPendingRequestsCount(requests.length);
      }
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error('Error loading pending requests count:', error);
      }
    }
  };

  // Load connections for new message modal
  const loadAvailableConnections = async () => {
    const session = getStoredSession();
    if (!session?.user) return;

    setLoadingConnections(true);
    try {
      const response = await fetch(
        `${supabaseUrl}/rest/v1/connections?status=eq.accepted&or=(requester_id.eq.${session.user.id},receiver_id.eq.${session.user.id})&select=*,requester:profiles!connections_requester_id_fkey(id,family_name,display_name,location_name,avatar_url),receiver:profiles!connections_receiver_id_fkey(id,family_name,display_name,location_name,avatar_url)`,
        {
          headers: {
            'apikey': supabaseKey!,
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (response.ok) {
        const connections = await response.json();
        const processedConnections = connections.map((conn: any) => {
          // Get the other person in the connection
          const otherUser = conn.requester_id === session.user.id ? conn.receiver : conn.requester;
          return {
            id: otherUser.id,
            family_name: otherUser.family_name,
            display_name: otherUser.display_name,
            location_name: otherUser.location_name,
            avatar_url: otherUser.avatar_url,
          };
        });
        setAvailableConnections(processedConnections);
      }
    } catch (err) {
      console.error('Error loading connections:', err);
    } finally {
      setLoadingConnections(false);
    }
  };

  // Start new conversation
  const startNewConversation = async () => {
    if (selectedContacts.size === 0 || !newMessageText.trim()) return;

    const session = getStoredSession();
    if (!session?.user) return;

    try {
      // For now, handle only single contact (multi-person chats can be added later)
      const contactId = Array.from(selectedContacts)[0];

      // Check if conversation already exists
      const existingConvo = conversations.find(convo => 
        convo.other_user.id === contactId
      );

      if (existingConvo) {
        // Send message to existing conversation
        await fetch(`${supabaseUrl}/rest/v1/messages`, {
          method: 'POST',
          headers: {
            'apikey': supabaseKey!,
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({
            conversation_id: existingConvo.id,
            sender_id: session.user.id,
            content: newMessageText.trim(),
          }),
        });
        await fetch(`${supabaseUrl}/rest/v1/conversations?id=eq.${existingConvo.id}`, {
          method: 'PATCH',
          headers: {
            'apikey': supabaseKey!,
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            last_message_text: newMessageText.trim(),
            last_message_at: new Date().toISOString(),
            last_message_by: session.user.id,
          }),
        });
        await reloadConversations();
        setSelectedId(existingConvo.id);
        setShowNewMessageModal(false);
        setSelectedContacts(new Set());
        setContactSearchTerm('');
        setNewMessageText('');
        return;
      }

      // Create new conversation
      const createConvoResponse = await fetch(
        `${supabaseUrl}/rest/v1/conversations`,
        {
          method: 'POST',
          headers: {
            'apikey': supabaseKey!,
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
          },
          body: JSON.stringify({
            participant_1: session.user.id,
            participant_2: contactId,
          }),
        }
      );

      if (createConvoResponse.ok) {
        const [newConvo] = await createConvoResponse.json();
        
        // Send first message
        const messageResponse = await fetch(
          `${supabaseUrl}/rest/v1/messages`,
          {
            method: 'POST',
            headers: {
              'apikey': supabaseKey!,
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=minimal',
            },
            body: JSON.stringify({
              conversation_id: newConvo.id,
              sender_id: session.user.id,
              content: newMessageText.trim(),
            }),
          }
        );

        if (messageResponse.ok) {
          // Update conversation with last message info
          await fetch(
            `${supabaseUrl}/rest/v1/conversations?id=eq.${newConvo.id}`,
            {
              method: 'PATCH',
              headers: {
                'apikey': supabaseKey!,
                'Authorization': `Bearer ${session.access_token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                last_message_text: newMessageText.trim(),
                last_message_at: new Date().toISOString(),
                last_message_by: session.user.id,
              }),
            }
          );

          // Reload conversations and open the new one
          await reloadConversations();
          setSelectedId(newConvo.id);
          
          // Close modal and reset state
          setShowNewMessageModal(false);
          setSelectedContacts(new Set());
          setContactSearchTerm('');
          setNewMessageText('');
        }
      }
    } catch (err) {
      console.error('Error starting new conversation:', err);
      toast('Failed to start conversation. Please try again.', 'error');
    }
  };

  // Toggle contact selection
  const toggleContactSelection = (contactId: string) => {
    const newSelected = new Set(selectedContacts);
    if (newSelected.has(contactId)) {
      newSelected.delete(contactId);
    } else {
      // For now, only allow single selection (can be updated for group chats later)
      newSelected.clear();
      newSelected.add(contactId);
    }
    setSelectedContacts(newSelected);
  };

  // Filter connections by search term
  const filteredConnections = availableConnections.filter(connection =>
    (connection.family_name?.toLowerCase() || '').includes(contactSearchTerm.toLowerCase()) ||
    (connection.display_name?.toLowerCase() || '').includes(contactSearchTerm.toLowerCase()) ||
    (connection.location_name?.toLowerCase() || '').includes(contactSearchTerm.toLowerCase())
  );

  const selected = conversations.find(c => c.id === selectedId);

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (selected) {
    return (
      <div className="h-dvh bg-gradient-to-b from-emerald-50 to-white flex flex-col overflow-hidden">
        <div className="flex-shrink-0 z-30 bg-white/90 backdrop-blur-sm border-b border-gray-100">
          <div className="max-w-md mx-auto">
            <AppHeader onBack={() => setSelectedId(null)} />

            {/* Conversation Controls */}
            {selectionMode && (
              <div className="flex gap-1 mb-4 px-4 bg-white rounded-xl p-1 border border-gray-200 mx-4">
                <button onClick={cancelSelection} className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all text-gray-500 hover:text-gray-700">
                  Cancel
                </button>
                {selectedMessages.length > 0 && (
                  <button onClick={saveSelectedMessages} className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all bg-emerald-600 text-white shadow-sm">
                    Save
                  </button>
                )}
                {selectedMessages.length > 0 && selectedMessages.some(id => {
                  const msg = messages.find(m => m.id === id);
                  return msg && getMessageFileUrl(msg) !== null;
                }) && (
                  <button onClick={downloadSelectedFiles} className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all bg-emerald-600 text-white shadow-sm">
                    Download
                  </button>
                )}
                <button
                  onClick={() => setShowDeleteMessageModal(true)}
                  disabled={selectedMessages.length === 0}
                  className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all bg-red-600 text-white shadow-sm disabled:opacity-40"
                >
                  Delete
                </button>
              </div>
            )}

            {/* User Info (only show when not in selection mode) */}
            {!selectionMode && (
              <div className="flex items-center gap-3 mb-3 px-4">
                  <AvatarUpload
                    userId={selected.other_user.id}
                    currentAvatarUrl={selected.other_user.avatar_url}
                    name={selected.other_user.family_name || selected.other_user.display_name || 'Unknown'}
                    size="sm"
                    editable={false}
                    viewable={true}
                    showFamilySilhouette={true}
                  />
                  <div className="flex-1">
                    <h2 className="font-semibold text-emerald-600">{selected.other_user.family_name || selected.other_user.display_name || 'Unknown'}</h2>
                    <p className="text-xs text-gray-500">{selected.other_user.location_name}</p>
                  </div>
                  
                  {/* Connect Button */}
                  <button
                    onClick={() => sendConnectionRequest(selected.other_user.id)}
                    disabled={getConnectionButtonState(selected.other_user.id).disabled}
                    className={`px-3 py-1.5 rounded-lg font-medium transition-colors text-sm mr-2 ${getConnectionButtonState(selected.other_user.id).style}`}
                  >
                    {getConnectionButtonState(selected.other_user.id).text}
                  </button>
                  
                  <div className="relative">
                    <button
                      onClick={() => setShowOptionsMenu(!showOptionsMenu)}
                      className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full"
                    >
                      ...
                    </button>
                    {showOptionsMenu && (
                      <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20 min-w-[160px]">
                        <button
                          onClick={() => {
                            setShowDeleteModal(true);
                            setShowOptionsMenu(false);
                          }}
                          className="w-full px-4 py-2 text-left text-red-600 hover:bg-red-50 text-sm"
                        >
                          Delete conversation
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pt-6 pb-36 space-y-4 max-w-md mx-auto w-full messages-container">
          {messages.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p>No messages yet.</p>
              <p className="text-sm mt-1">Send a message to start the conversation!</p>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex w-full ${msg.sender_id === userId ? 'justify-end' : 'justify-start'}`}
              >
                {(() => {
                    const file = getMessageFileUrl(msg);
                    const textContent = file ? msg.content.replace(file.fileUrl, '').trim() : msg.content;
                    const isImageOnly = file?.isImage && !textContent;
                    const isSelected = selectedMessages.includes(msg.id);
                    const selectionClass = isSelected ? 'ring-2 ring-emerald-300 scale-95' : selectionMode ? 'opacity-60' : '';
                    const touchHandlers = {
                      onTouchStart: () => {
                        if (longPressTimer) clearTimeout(longPressTimer);
                        const timer = setTimeout(() => handleMessageLongPress(msg.id), 1000);
                        setLongPressTimer(timer);
                      },
                      onTouchEnd: () => {
                        if (longPressTimer) { clearTimeout(longPressTimer); setLongPressTimer(null); }
                        if (selectionMode) handleMessageTap(msg.id);
                      },
                      onClick: () => { if (selectionMode) handleMessageTap(msg.id); },
                    };

                    return (
                      <div className="relative w-full max-w-full">
                        {/* Selection checkbox */}
                        {selectionMode && (
                          <div
                            className="absolute -left-8 top-1/2 transform -translate-y-1/2 z-10 cursor-pointer"
                            onClick={(e) => { e.stopPropagation(); handleMessageTap(msg.id); }}
                          >
                            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${isSelected ? 'bg-emerald-600 border-emerald-600' : 'bg-white border-gray-300'}`}>
                              {isSelected && <span className="text-white text-xs font-bold">✓</span>}
                            </div>
                          </div>
                        )}

                        {isImageOnly ? (
                          /* Image-only: no bubble */
                          <div
                            className={`cursor-pointer transition-all ${selectionClass}`}
                            {...touchHandlers}
                          >
                            <img
                              src={file.fileUrl}
                              alt="Attachment"
                              className="max-w-[220px] max-h-[220px] rounded-2xl object-cover"
                              onClick={(e) => { if (!selectionMode) { e.stopPropagation(); setLightboxUrl(file.fileUrl); setLightboxMsgId(msg.id); } }}
                              onTouchEnd={(e) => { if (!selectionMode) { e.stopPropagation(); e.preventDefault(); setLightboxUrl(file.fileUrl); setLightboxMsgId(msg.id); } }}
                            />
                            <p className="text-xs text-gray-400 mt-1">{formatTime(msg.created_at)}</p>
                          </div>
                        ) : (
                          /* Regular bubble */
                          <div
                            className={`max-w-[75%] px-4 py-3 rounded-2xl transition-all cursor-pointer ${
                              msg.sender_id === userId
                                ? 'bg-emerald-600 text-white rounded-br-md ml-auto'
                                : 'bg-white text-gray-900 rounded-bl-md shadow-sm mr-auto'
                            } ${selectionClass}`}
                            {...touchHandlers}
                          >
                            {file?.isImage && (
                              <div className="mb-2">
                                <img
                                  src={file.fileUrl}
                                  alt="Attachment"
                                  className="max-w-[200px] max-h-[200px] rounded-xl object-cover cursor-pointer"
                                  onClick={(e) => { if (!selectionMode) { e.stopPropagation(); setLightboxUrl(file.fileUrl); setLightboxMsgId(msg.id); } }}
                                  onTouchEnd={(e) => { if (!selectionMode) { e.stopPropagation(); e.preventDefault(); setLightboxUrl(file.fileUrl); setLightboxMsgId(msg.id); } }}
                                />
                              </div>
                            )}
                            {file && !file.isImage && (
                              <a
                                href={file.fileUrl}
                                download
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 px-3 py-2 bg-white/20 rounded-xl text-sm font-medium mb-2"
                                onClick={(e) => e.stopPropagation()}
                              >
                                Download file
                              </a>
                            )}
                            {textContent && (
                              <p className="text-sm break-words" style={{ wordWrap: 'break-word', overflowWrap: 'break-word' }}>{textContent}</p>
                            )}
                            <p className={`text-xs mt-1 ${msg.sender_id === userId ? 'text-emerald-200' : 'text-gray-400'}`}>
                              {formatTime(msg.created_at)}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })()}
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {!selectionMode && (
          <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-4 pb-24 z-10">
            <div className="max-w-4xl mx-auto">
              {/* File preview */}
              {selectedFile && (
                <div className="mb-3 p-3 bg-gray-50 rounded-xl flex items-center gap-3">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{selectedFile.name}</p>
                    <p className="text-xs text-gray-500">
                      {selectedFile.size > 1024 * 1024 
                        ? `${(selectedFile.size / 1024 / 1024).toFixed(1)} MB`
                        : `${Math.round(selectedFile.size / 1024)} KB`
                      }
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedFile(null)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    ✕
                  </button>
                </div>
              )}
              <div className="flex gap-2">
              <textarea
                value={newMessage}
                onChange={(e) => {
                  setNewMessage(e.target.value);
                  // Auto-resize textarea
                  const textarea = e.target as HTMLTextAreaElement;
                  textarea.style.height = 'auto';
                  textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
                }}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessageHandler()}
                placeholder="Type a message..."
                className="flex-1 p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 resize-none overflow-wrap-anywhere break-words"
                rows={1}
                style={{ 
                  minHeight: '48px',
                  maxHeight: '120px',
                  wordWrap: 'break-word',
                  overflowWrap: 'anywhere'
                }}
              />
              <input
                type="file"
                id="file-input"
                accept="image/*,.pdf,.doc,.docx,.txt"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setSelectedFile(file);
                  }
                }}
                className="hidden"
              />
              <button
                onClick={() => document.getElementById('file-input')?.click()}
                className="px-4 py-3 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 flex items-center justify-center"
                title="Attach file"
              >
                📎
              </button>
              <button
                onClick={sendMessageHandler}
                disabled={(!newMessage.trim() && !selectedFile) || sending}
                className="px-4 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:bg-gray-200 disabled:text-gray-400"
              >
                {sending ? '...' : '→'}
              </button>
              </div>
            </div>
          </div>
        )}

        {/* Lightbox — MUST be inside conversation view return (state-driven, not portal) */}
        {lightboxUrl && (
          <div
            className="fixed inset-0 bg-black/90 flex flex-col items-center justify-center z-[99999] p-4"
            onClick={() => { setLightboxUrl(null); setLightboxMsgId(null); }}
          >
            <button
              className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/20 text-white text-xl flex items-center justify-center hover:bg-white/30"
              onClick={() => { setLightboxUrl(null); setLightboxMsgId(null); }}
            >
              ×
            </button>
            <img
              src={lightboxUrl}
              alt="Attachment"
              className="max-w-full max-h-[75vh] rounded-xl object-contain"
              onClick={(e) => e.stopPropagation()}
            />
            <div className="flex gap-3 mt-4" onClick={(e) => e.stopPropagation()}>
              <a
                href={lightboxUrl}
                download
                target="_blank"
                rel="noopener noreferrer"
                className="px-5 py-2 bg-white text-gray-900 rounded-xl font-medium hover:bg-gray-100 text-sm"
              >
                Download
              </a>
              {lightboxMsgId && (
                <button
                  onClick={() => {
                    const msg = messages.find(m => m.id === lightboxMsgId);
                    if (msg) saveMessageToSaved(msg);
                    setLightboxUrl(null);
                    setLightboxMsgId(null);
                  }}
                  className="px-5 py-2 bg-white/20 text-white rounded-xl font-medium hover:bg-white/30 text-sm"
                >
                  Save
                </button>
              )}
            </div>
          </div>
        )}

      </div>
    );
  }

  return (
    <ProtectedRoute>
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white pb-24">
      <div className="max-w-md mx-auto px-4 pb-8 pt-2">
        <AppHeader />

        {/* Main View Toggle with Search */}
        <div className="flex gap-1 mb-4 bg-white rounded-xl p-1 border border-gray-200">
          <button
            onClick={() => router.push('/connections')}
            className="relative flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all text-gray-500 hover:text-gray-700"
          >
            {pendingRequestsCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full h-4 w-4 flex items-center justify-center border border-white leading-none">
                {pendingRequestsCount > 9 ? '9+' : pendingRequestsCount}
              </span>
            )}
            Connections
          </button>
          <button
            onClick={() => setShowSearch(!showSearch)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              showSearch ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Search
          </button>
          <button
            onClick={() => setShowNewMessageModal(true)}
            className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all text-gray-500 hover:text-gray-700"
          >
            + New
          </button>
        </div>

        {/* Messages Controls */}
        {conversationSelectionMode && (
          <div className="flex gap-1 mb-4 bg-white rounded-xl p-1 border border-gray-200">
            <button onClick={cancelConversationSelection} className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all text-gray-500 hover:text-gray-700">
              Cancel
            </button>
            <button
              onClick={() => setShowDeleteConversationModal(true)}
              disabled={selectedConversations.length === 0}
              className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all bg-red-600 text-white shadow-sm disabled:opacity-40"
            >
              Delete ({selectedConversations.length})
            </button>
          </div>
        )}

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
                placeholder="Search conversations..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                autoFocus
              />
            </div>
          </div>
        )}

        {/* Filter conversations by search term */}
        {(() => {
          // Create saved messages conversation
          const savedMessagesConvo = {
            id: 'saved-messages',
            other_user: {
              id: 'saved',
              family_name: 'Saved Messages',
              display_name: 'Saved Messages',
              avatar_url: null,
              location_name: ''
            },
            last_message_text: 'Your saved messages appear here',
            last_message_at: new Date().toISOString(),
            unread: false
          };

          // Helper function to extract last name
          const getLastName = (conversation: Conversation) => {
            const fullName = conversation.other_user.family_name || conversation.other_user.display_name || '';
            const nameParts = fullName.trim().split(' ');
            return nameParts.length > 1 ? nameParts[nameParts.length - 1] : fullName;
          };

          // Sort conversations alphabetically by last name
          const sortConversationsByLastName = (convos: Conversation[]) => {
            return [...convos].sort((a, b) => {
              const lastNameA = getLastName(a).toLowerCase();
              const lastNameB = getLastName(b).toLowerCase();
              return lastNameA.localeCompare(lastNameB);
            });
          };

          const filteredConversations = conversations.filter(convo =>
            (convo.other_user.family_name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
            (convo.other_user.display_name?.toLowerCase() || '').includes(searchTerm.toLowerCase())
          );

          // Sort filtered conversations by last name
          const sortedConversations = sortConversationsByLastName(filteredConversations);

          // Always add saved messages at the top (unless searching and it doesn't match)
          const shouldShowSaved = !searchTerm || 
            'saved messages'.includes(searchTerm.toLowerCase());
          
          const allConversations = shouldShowSaved 
            ? [savedMessagesConvo, ...sortedConversations]
            : sortedConversations;

          return allConversations.length === 0 ? (
            <div className="text-center py-12">
              <div className="mb-4 flex justify-center">
                <AvatarUpload
                  userId=""
                  currentAvatarUrl=""
                  name=""
                  size="xl"
                  editable={false}
                    viewable={true}
                  showFamilySilhouette={true}
                />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {searchTerm ? 'No Results Found' : 'No conversations yet'}
              </h3>
              <p className="text-gray-600 mb-4">
                {searchTerm 
                  ? `No conversations match "${searchTerm}". Try a different search term.`
                  : 'Start connecting with families in Discover!'
                }
              </p>
              {!searchTerm && (
                <button
                  onClick={() => router.push('/discover')}
                  className="bg-emerald-600 text-white px-2 py-1.5 rounded-xl font-medium hover:bg-emerald-700 text-sm"
                >
                  Find Families
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2 mt-6">
              {allConversations.map((convo) => (
              <div key={convo.id} className="relative">
                {conversationSelectionMode && (
                  <div 
                    className="absolute left-2 top-1/2 transform -translate-y-1/2 z-10 cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleConversationTap(convo.id);
                    }}
                  >
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                      selectedConversations.includes(convo.id) 
                        ? 'bg-emerald-600 border-emerald-600' 
                        : 'bg-white border-gray-300 hover:border-gray-400'
                    }`}>
                      {selectedConversations.includes(convo.id) && (
                        <span className="text-white text-xs font-bold">V</span>
                      )}
                    </div>
                  </div>
                )}
                <button
                  onClick={() => handleConversationTap(convo.id)}
                  onTouchStart={() => {
                    if (longPressTimer) clearTimeout(longPressTimer);
                    if (!conversationSelectionMode && convo.id !== 'saved-messages') {
                      const timer = setTimeout(() => handleConversationLongPress(convo.id), 1000);
                      setLongPressTimer(timer);
                    }
                  }}
                  onTouchEnd={() => {
                    if (longPressTimer) {
                      clearTimeout(longPressTimer);
                      setLongPressTimer(null);
                    }
                  }}
                  className={`w-full bg-white rounded-xl p-4 flex items-center gap-3 transition-all text-left ${
                    conversationSelectionMode
                      ? selectedConversations.includes(convo.id)
                        ? 'ring-2 ring-emerald-300 scale-95 ml-8'
                        : 'opacity-60 ml-8'
                      : 'hover:bg-gray-50'
                  }`}
                >
                <div className="flex-shrink-0">
                  <AvatarUpload
                    userId={convo.other_user.id}
                    currentAvatarUrl={convo.other_user.avatar_url}
                    name={convo.other_user.family_name || convo.other_user.display_name || 'Unknown'}
                    size="md"
                    editable={false}
                    viewable={true}
                    showFamilySilhouette={true}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start">
                    <h3 className={`font-semibold ${convo.unread ? 'text-emerald-600' : 'text-emerald-600'}`}>
                      {convo.other_user.family_name || convo.other_user.display_name || 'Unknown'}
                    </h3>
                    <span className="text-xs text-gray-400">
                      {formatTime(convo.last_message_at)}
                    </span>
                  </div>
                  <p className={`text-sm truncate ${convo.unread ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>
                    {convo.last_message_text || 'No messages yet'}
                  </p>
                </div>
                {convo.unread && !conversationSelectionMode && (
                  <div className="w-3 h-3 bg-emerald-600 rounded-full flex-shrink-0"></div>
                )}
                </button>
              </div>
            ))}
            </div>
          );
        })()}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6">
            <div className="text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">🗑️</span>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Delete conversation?</h3>
              <p className="text-gray-600 mb-6">
                This will permanently delete all messages with {(selected as Conversation).other_user.family_name || (selected as Conversation).other_user.display_name || 'Unknown'}. This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteModal(false)}
                  className="flex-1 px-2 py-1.5 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={deleteConversation}
                  className="flex-1 px-2 py-1.5 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 text-sm"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Messages Modal */}
      {showDeleteMessageModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6">
            <div className="text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">🗑️</span>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                Delete {selectedMessages.length} message{selectedMessages.length === 1 ? '' : 's'}?
              </h3>
              <p className="text-gray-600 mb-6">
                {selectedMessages.length === 1 
                  ? 'This message will be permanently deleted.'
                  : `These ${selectedMessages.length} messages will be permanently deleted.`
                } This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowDeleteMessageModal(false);
                  }}
                  className="flex-1 px-2 py-1.5 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={deleteSelectedMessages}
                  className="flex-1 px-2 py-1.5 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 text-sm"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Conversations Modal */}
      {showDeleteConversationModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6">
            <div className="text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">🗑️</span>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                Delete {selectedConversations.length} conversation{selectedConversations.length === 1 ? '' : 's'}?
              </h3>
              <p className="text-gray-600 mb-6">
                {selectedConversations.length === 1 
                  ? 'This will permanently delete this conversation and all its messages.'
                  : `This will permanently delete these ${selectedConversations.length} conversations and all their messages.`
                } This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConversationModal(false)}
                  className="flex-1 px-2 py-1.5 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={deleteSelectedConversations}
                  className="flex-1 px-2 py-1.5 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 text-sm"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Message Context Menu — bottom sheet */}
      {showMessageContextMenu && contextMenuMessage && (
        <div
          className="fixed inset-0 z-[9999]"
          onClick={() => { setShowMessageContextMenu(false); setContextMenuMessage(null); }}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40" />
          {/* Sheet */}
          <div
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </div>
            {/* Message preview */}
            {contextMenuMessage.content && (
              <p className="text-xs text-gray-400 text-center px-6 pb-4 truncate">
                {contextMenuMessage.content.length > 60
                  ? contextMenuMessage.content.substring(0, 60) + '...'
                  : contextMenuMessage.content}
              </p>
            )}
            {/* Actions */}
            <div className="divide-y divide-gray-100 border-t border-gray-100">
              {/* Copy text — only if there's text content */}
              {contextMenuMessage.content && (() => {
                const file = getMessageFileUrl(contextMenuMessage);
                const textContent = file ? contextMenuMessage.content.replace(file.fileUrl, '').trim() : contextMenuMessage.content;
                if (!textContent) return null;
                return (
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(textContent).catch(() => {});
                      setShowMessageContextMenu(false);
                      setContextMenuMessage(null);
                      setSuccessMessage('Copied!');
                      setShowSuccessNotification(true);
                      setTimeout(() => setShowSuccessNotification(false), 2000);
                    }}
                    className="w-full px-6 py-4 text-left text-gray-900 font-medium text-sm hover:bg-gray-50 active:bg-gray-100"
                  >
                    Copy text
                  </button>
                );
              })()}
              <button
                onClick={() => saveMessageToSaved(contextMenuMessage)}
                className="w-full px-6 py-4 text-left text-gray-900 font-medium text-sm hover:bg-gray-50 active:bg-gray-100"
              >
                Save message
              </button>
              {/* Delete — only for own messages */}
              {contextMenuMessage.sender_id === userId && (
                <button
                  onClick={async () => {
                    setShowMessageContextMenu(false);
                    const msgToDelete = contextMenuMessage;
                    setContextMenuMessage(null);
                    const session = getStoredSession();
                    if (!session) return;
                    try {
                      const res = await fetch(
                        `${supabaseUrl}/rest/v1/messages?id=eq.${msgToDelete.id}`,
                        {
                          method: 'DELETE',
                          headers: {
                            'apikey': supabaseKey!,
                            'Authorization': `Bearer ${session.access_token}`,
                          },
                        }
                      );
                      if (res.ok) {
                        setMessages(prev => prev.filter(m => m.id !== msgToDelete.id));
                      } else {
                        toast('Could not delete message', 'error');
                      }
                    } catch {
                      toast('Could not delete message', 'error');
                    }
                  }}
                  className="w-full px-6 py-4 text-left text-red-600 font-medium text-sm hover:bg-red-50 active:bg-red-100"
                >
                  Delete message
                </button>
              )}
              <button
                onClick={() => { setShowMessageContextMenu(false); setContextMenuMessage(null); }}
                className="w-full px-6 py-4 text-left text-gray-400 font-medium text-sm hover:bg-gray-50 active:bg-gray-100"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 bg-black/90 flex flex-col items-center justify-center z-[9999] p-4"
          onClick={() => { setLightboxUrl(null); setLightboxMsgId(null); }}
        >
          <img
            src={lightboxUrl}
            alt="Attachment"
            className="max-w-full max-h-[75vh] rounded-xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <div className="flex gap-3 mt-4" onClick={(e) => e.stopPropagation()}>
            <a
              href={lightboxUrl}
              download
              target="_blank"
              rel="noopener noreferrer"
              className="px-5 py-2 bg-white text-gray-900 rounded-xl font-medium hover:bg-gray-100 text-sm"
            >
              Download
            </a>
            {lightboxMsgId && (
              <button
                onClick={() => {
                  const msg = messages.find(m => m.id === lightboxMsgId);
                  if (msg) saveMessageToSaved(msg);
                  setLightboxUrl(null);
                  setLightboxMsgId(null);
                }}
                className="px-5 py-2 bg-white/20 text-white rounded-xl font-medium hover:bg-white/30 text-sm"
              >
                Save
              </button>
            )}
            <button
              onClick={() => { setLightboxUrl(null); setLightboxMsgId(null); }}
              className="px-5 py-2 bg-white/20 text-white rounded-xl font-medium hover:bg-white/30 text-sm"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Success Notification */}
      {showSuccessNotification && (
        <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
          <div className="bg-emerald-600 text-white px-6 py-3 rounded-xl shadow-lg flex items-center gap-2 pointer-events-auto">
            <span className="text-lg">✓</span>
            <span className="font-medium">{successMessage}</span>
          </div>
        </div>
      )}

      {/* New Message Modal */}
      {showNewMessageModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-100">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-900">New Message</h2>
                <button 
                  onClick={() => {
                    setShowNewMessageModal(false);
                    setSelectedContacts(new Set());
                    setContactSearchTerm('');
                    setNewMessageText('');
                  }}
                  className="text-gray-400 hover:text-gray-600 text-2xl"
                >
                  ×
                </button>
              </div>

              {/* Search contacts */}
              <div className="mb-4">
                <input
                  type="text"
                  placeholder="Search connections..."
                  value={contactSearchTerm}
                  onChange={(e) => setContactSearchTerm(e.target.value)}
                  onFocus={() => !availableConnections.length && loadAvailableConnections()}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  autoFocus
                />
              </div>

              {/* Selected contacts */}
              {selectedContacts.size > 0 && (
                <div className="mb-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">To:</p>
                  <div className="flex flex-wrap gap-2">
                    {Array.from(selectedContacts).map(contactId => {
                      const contact = availableConnections.find(c => c.id === contactId);
                      if (!contact) return null;
                      return (
                        <div key={contactId} className="flex items-center gap-1 bg-emerald-50 px-2 py-1 rounded-full">
                          <span className="text-sm font-medium text-emerald-700">
                            {contact.family_name || contact.display_name}
                          </span>
                          <button
                            onClick={() => toggleContactSelection(contactId)}
                            className="text-emerald-500 hover:text-emerald-700 ml-1"
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Contacts list */}
            <div className="flex-1 overflow-y-auto p-6 pt-4">
              {loadingConnections ? (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : filteredConnections.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p className="mb-2">
                    {contactSearchTerm ? 'No matching connections' : 'No connections yet'}
                  </p>
                  <p className="text-sm">
                    {contactSearchTerm 
                      ? 'Try a different search term'
                      : 'Connect with families in Discover to start messaging'
                    }
                  </p>
                  {!contactSearchTerm && (
                    <button
                      onClick={() => {
                        setShowNewMessageModal(false);
                        router.push('/discover');
                      }}
                      className="mt-4 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
                    >
                      Find Families
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredConnections.map(connection => (
                    <button
                      key={connection.id}
                      onClick={() => toggleContactSelection(connection.id)}
                      className={`w-full p-3 rounded-xl text-left flex items-center gap-3 transition-colors ${
                        selectedContacts.has(connection.id)
                          ? 'bg-emerald-50 border border-emerald-200'
                          : 'hover:bg-gray-50 border border-transparent'
                      }`}
                    >
                      <AvatarUpload
                        userId={connection.id}
                        currentAvatarUrl={connection.avatar_url}
                        name={connection.family_name || connection.display_name || 'Unknown'}
                        size="sm"
                        editable={false}
                    viewable={true}
                        showFamilySilhouette={true}
                      />
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">
                          {connection.family_name || connection.display_name}
                        </p>
                        <p className="text-sm text-gray-500">{connection.location_name}</p>
                      </div>
                      {selectedContacts.has(connection.id) && (
                        <div className="w-6 h-6 bg-emerald-600 rounded-full flex items-center justify-center">
                          <span className="text-white text-sm">✓</span>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Message input */}
            <div className="p-6 border-t border-gray-100">
              <textarea
                value={newMessageText}
                onChange={(e) => setNewMessageText(e.target.value)}
                placeholder="Write your message..."
                className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
                rows={3}
              />
              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => {
                    setShowNewMessageModal(false);
                    setSelectedContacts(new Set());
                    setContactSearchTerm('');
                    setNewMessageText('');
                  }}
                  className="flex-1 px-2 py-1.5 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={startNewConversation}
                  disabled={selectedContacts.size === 0 || !newMessageText.trim()}
                  className="flex-1 px-2 py-1.5 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm"
                >
                  Send Message
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Bottom spacing for mobile nav */}
      <div className="h-20"></div>
    </div>
    </ProtectedRoute>
  );
}

export default function MessagesPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    }>
      <MessagesContent />
    </Suspense>
  );
}
