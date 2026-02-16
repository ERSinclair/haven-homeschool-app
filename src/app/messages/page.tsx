'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getStoredSession } from '@/lib/session';
import { getAvatarColor } from '@/lib/colors';
import AvatarUpload from '@/components/AvatarUpload';
import HavenHeader from '@/components/HavenHeader';
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
};

function MessagesContent() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
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
  const [connectionRequests, setConnectionRequests] = useState<Set<string>>(new Set());
  const [showSearch, setShowSearch] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [savedMessages, setSavedMessages] = useState<Message[]>([]);
  const [showMessageContextMenu, setShowMessageContextMenu] = useState(false);
  const [contextMenuMessage, setContextMenuMessage] = useState<Message | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showSuccessNotification, setShowSuccessNotification] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
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

    loadMessages();
    
    return () => {
      abortController.abort();
    };
  }, [selectedId, userId]);

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

          console.log('File uploaded successfully:', fileUrl);
        } catch (fileError) {
          console.error('File upload error:', fileError);
          // For now, fall back to placeholder until storage bucket is set up
          const sizeDisplay = selectedFile.size > 1024 * 1024 
            ? `${(selectedFile.size / 1024 / 1024).toFixed(1)}MB`
            : `${Math.round(selectedFile.size / 1024)}KB`;
          
          // Show user-friendly error
          setSuccessMessage(`File sharing not set up yet. File "${selectedFile.name}" (${sizeDisplay}) will be shared as text placeholder.`);
          setShowSuccessNotification(true);
          setTimeout(() => setShowSuccessNotification(false), 4000);
          
          fileUrl = `📎 File: ${selectedFile.name} (${sizeDisplay}) - File sharing coming soon!`;
          fileType = 'file';
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
        setMessages(prev => [...prev, newMsg]);
        setNewMessage('');
        setSelectedFile(null);
        
        // Reset textarea height
        const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
        if (textarea) {
          textarea.style.height = '48px';
        }
        
        // Auto-scroll to bottom to show the new message
        setTimeout(() => {
          const messagesContainer = document.querySelector('.messages-container');
          if (messagesContainer) {
            messagesContainer.scrollTo({
              top: messagesContainer.scrollHeight,
              behavior: 'smooth'
            });
          }
        }, 100);
        
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
        alert('Failed to delete conversation. Please try again.');
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
        alert('Failed to delete messages. Please try again.');
      }
    }
  };

  const handleMessageLongPress = (messageId: string) => {
    if (!selectionMode) {
      const message = messages.find(m => m.id === messageId);
      if (message) {
        setContextMenuMessage(message);
        setShowMessageContextMenu(true);
      }
    }
  };

  const saveMessageToSaved = async (message: Message) => {
    try {
      // In a real implementation, this would save to a database
      setSavedMessages(prev => [...prev, { ...message, id: `saved-${Date.now()}` }]);
      setShowMessageContextMenu(false);
      setContextMenuMessage(null);
      
      // Show success feedback
      setSuccessMessage('Message saved to Saved Messages!');
      setShowSuccessNotification(true);
      setTimeout(() => setShowSuccessNotification(false), 3000);
    } catch (err) {
      console.error('Error saving message:', err);
      alert('Failed to save message');
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
    if (!conversationSelectionMode) {
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
      const session = getStoredSession();
      if (!session?.user) return;

      // For now, create some placeholder saved messages
      // In a real implementation, this would load from a saved_messages table
      const mockSavedMessages = [
        {
          id: 'saved-1',
          content: 'This is a saved message example',
          sender_id: session.user.id,
          created_at: new Date().toISOString(),
        }
      ];
      
      setMessages(mockSavedMessages);
      setSavedMessages(mockSavedMessages);
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
        alert('Failed to delete conversations. Please try again.');
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

  // Connection request functionality
  const sendConnectionRequest = async (userId: string) => {
    try {
      const session = getStoredSession();
      if (!session?.user) {
        alert('Please log in to send connection requests');
        return;
      }

      // Check if request already exists - if so, remove it (unsend)
      if (connectionRequests.has(userId)) {
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

        // Update UI state - remove from set
        setConnectionRequests(prev => {
          const newSet = new Set(prev);
          newSet.delete(userId);
          return newSet;
        });
        
        console.log('Connection request removed for user:', userId);
        return;
      }

      // Create new connection request
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

      // Update UI state - add to set
      setConnectionRequests(prev => new Set(prev).add(userId));
      
      console.log('Connection request sent to user:', userId);
      
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error('Error with connection request:', error);
        if (error.message.includes('duplicate key value')) {
          alert('Connection request already sent to this user.');
        } else {
          alert('Failed to process connection request. Please try again.');
        }
      }
    }
  };

  // Load existing connection requests
  const loadConnectionRequests = async (signal?: AbortSignal) => {
    try {
      const session = getStoredSession();
      if (!session?.user) return;

      // Get connection requests sent by current user
      const response = await fetch(
        `${supabaseUrl}/rest/v1/connections?requester_id=eq.${session.user.id}&select=receiver_id`,
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
        const requestedUserIds = new Set<string>(requests.map((req: any) => req.receiver_id as string));
        setConnectionRequests(requestedUserIds);
      }
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error('Error loading connection requests:', error);
      }
    }
  };

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
        <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (selected) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white flex flex-col">
        <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
          <div className="max-w-md mx-auto px-4 py-4">
            {/* Header with back button */}
            <div className="mb-8">
              <HavenHeader />
              <div className="flex items-center justify-between mb-6 mt-4">
                <button 
                  onClick={() => setSelectedId(null)} 
                  className="text-emerald-600 hover:text-emerald-700 font-medium"
                >
                  ← Back
                </button>
                <div></div>
              </div>
            </div>

            {/* Conversation Controls */}
            <div className="flex gap-2 mb-4 overflow-x-auto pb-2 scrollbar-hide justify-center">
              {selectionMode ? (
                <>
                  <button 
                    onClick={cancelSelection}
                    className="px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all shadow-sm min-w-fit flex items-center justify-center bg-white text-gray-700 hover:bg-teal-50 hover:text-teal-700 border border-gray-200 hover:border-teal-200 hover:shadow-md hover:scale-105"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => setShowDeleteMessageModal(true)}
                    className="px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all shadow-sm min-w-fit flex items-center justify-center bg-red-600 text-white shadow-md scale-105 hover:bg-red-700 disabled:bg-gray-300"
                    disabled={selectedMessages.length === 0}
                  >
                    Delete ({selectedMessages.length})
                  </button>
                </>
              ) : (
                <></>
              )}
            </div>

            {/* User Info (only show when not in selection mode) */}
            {!selectionMode && (
              <div className="flex items-center gap-3 mb-4 mt-6">
                  <AvatarUpload
                    userId={selected.other_user.id}
                    currentAvatarUrl={selected.other_user.avatar_url}
                    name={selected.other_user.family_name || selected.other_user.display_name || 'Unknown'}
                    size="sm"
                    editable={false}
                    showFamilySilhouette={true}
                  />
                  <div className="flex-1">
                    <h2 className="font-semibold text-emerald-600">{selected.other_user.family_name || selected.other_user.display_name || 'Unknown'}</h2>
                    <p className="text-xs text-gray-500">{selected.other_user.location_name}</p>
                  </div>
                  
                  {/* Connect Button */}
                  <button
                    onClick={() => sendConnectionRequest(selected.other_user.id)}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors text-sm mr-2 ${
                      connectionRequests.has(selected.other_user.id)
                        ? 'bg-gray-100 text-gray-600 border border-gray-300'
                        : 'bg-teal-600 text-white hover:bg-teal-700'
                    }`}
                  >
                    {connectionRequests.has(selected.other_user.id) ? 'Requested' : 'Connect'}
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

        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4 max-w-md mx-auto w-full messages-container">
          {messages.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p>No messages yet.</p>
              <p className="text-sm mt-1">Send a message to start the conversation!</p>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.sender_id === userId ? 'justify-end' : 'justify-start'}`}
              >
                <div className="relative">
                  {selectionMode && (
                    <div 
                      className="absolute -left-8 top-1/2 transform -translate-y-1/2 z-10 cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMessageTap(msg.id);
                      }}
                    >
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                        selectedMessages.includes(msg.id) 
                          ? 'bg-teal-600 border-teal-600' 
                          : 'bg-white border-gray-300 hover:border-gray-400'
                      }`}>
                        {selectedMessages.includes(msg.id) && (
                          <span className="text-white text-xs font-bold">V</span>
                        )}
                      </div>
                    </div>
                  )}
                  <div
                    className={`max-w-[75%] px-4 py-3 rounded-2xl transition-all cursor-pointer ${
                      msg.sender_id === userId
                        ? 'bg-teal-600 text-white rounded-br-md ml-auto'
                        : 'bg-white text-gray-900 rounded-bl-md shadow-sm mr-auto'
                    } ${
                      selectedMessages.includes(msg.id) 
                        ? 'ring-2 ring-teal-300 scale-95' 
                        : selectionMode 
                          ? 'opacity-60' 
                          : ''
                    }`}
                    onTouchStart={(e) => {
                      if (longPressTimer) clearTimeout(longPressTimer);
                      const timer = setTimeout(() => handleMessageLongPress(msg.id), 1000);
                      setLongPressTimer(timer);
                    }}
                    onTouchEnd={() => {
                      if (longPressTimer) {
                        clearTimeout(longPressTimer);
                        setLongPressTimer(null);
                      }
                      if (selectionMode) handleMessageTap(msg.id);
                    }}
                    onClick={() => {
                      if (selectionMode) handleMessageTap(msg.id);
                    }}
                  >
                    <p className="text-sm break-words overflow-wrap-anywhere" style={{ wordWrap: 'break-word', overflowWrap: 'anywhere' }}>{msg.content}</p>
                    <p className={`text-xs mt-1 ${msg.sender_id === userId ? 'text-teal-200' : 'text-gray-400'}`}>
                      {formatTime(msg.created_at)}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
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
                className="flex-1 p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 resize-none overflow-wrap-anywhere break-words"
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
                    console.log('File selected:', file.name, file.size, 'bytes');
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
                className="px-4 py-3 bg-teal-600 text-white rounded-xl hover:bg-teal-700 disabled:bg-gray-200 disabled:text-gray-400"
              >
                {sending ? '...' : '→'}
              </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <ProtectedRoute>
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white pb-24">
      <div className="max-w-md mx-auto px-4 py-8">
        <HavenHeader />

        {/* Main View Toggle with Search */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-hide justify-center">
          <button
            onClick={() => router.push('/connections')}
            className="px-6 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all shadow-sm min-w-fit flex items-center justify-center bg-white text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 border border-gray-200 hover:border-emerald-200 hover:shadow-md hover:scale-105"
          >
            Connections
          </button>
          <button
            onClick={() => setShowSearch(!showSearch)}
            className={`px-6 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all shadow-sm min-w-fit flex items-center justify-center ${
              showSearch
                ? 'bg-teal-600 text-white shadow-md scale-105'
                : 'bg-white text-gray-700 hover:bg-teal-50 hover:text-teal-700 border border-gray-200 hover:border-teal-200 hover:shadow-md hover:scale-105'
            }`}
          >
            Search
          </button>
          <button
            onClick={() => router.push('/discover')}
            className="px-6 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all shadow-sm min-w-fit flex items-center justify-center bg-white text-gray-700 hover:bg-teal-50 hover:text-teal-700 border border-gray-200 hover:border-teal-200 hover:shadow-md hover:scale-105"
          >
            + New
          </button>
        </div>

        {/* Messages Controls */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-2 scrollbar-hide justify-center">
          {conversationSelectionMode ? (
            <>
              <button 
                onClick={cancelConversationSelection}
                className="px-6 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all shadow-sm min-w-fit flex items-center justify-center bg-white text-gray-700 hover:bg-teal-50 hover:text-teal-700 border border-gray-200 hover:border-teal-200 hover:shadow-md hover:scale-105"
              >
                Cancel
              </button>
              <button
                onClick={() => setShowDeleteConversationModal(true)}
                className="px-6 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all shadow-sm min-w-fit flex items-center justify-center bg-red-600 text-white shadow-md scale-105 hover:bg-red-700 disabled:bg-gray-300"
                disabled={selectedConversations.length === 0}
              >
                Delete ({selectedConversations.length})
              </button>
            </>
          ) : (
            <></>
          )}
        </div>

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
                  className="bg-teal-600 text-white px-6 py-2 rounded-xl font-medium hover:bg-teal-700"
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
                        ? 'bg-teal-600 border-teal-600' 
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
                    if (!conversationSelectionMode) {
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
                        ? 'ring-2 ring-teal-300 scale-95 ml-8'
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
                  <div className="w-3 h-3 bg-teal-600 rounded-full flex-shrink-0"></div>
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
                  className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={deleteConversation}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700"
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
                  className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={deleteSelectedMessages}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700"
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
                  className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={deleteSelectedConversations}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Message Context Menu Modal */}
      {showMessageContextMenu && contextMenuMessage && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6">
            <div className="text-center mb-6">
              <h3 className="text-lg font-bold text-gray-900 mb-2">Message Options</h3>
              <p className="text-gray-600 text-sm">
                "{contextMenuMessage.content.length > 50 
                  ? contextMenuMessage.content.substring(0, 50) + '...' 
                  : contextMenuMessage.content}"
              </p>
            </div>
            <div className="space-y-3">
              <button
                onClick={() => saveMessageToSaved(contextMenuMessage)}
                className="w-full px-4 py-3 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 flex items-center justify-center gap-2"
              >
                Save to Saved Messages
              </button>
              <button
                onClick={() => {
                  setSelectionMode(true);
                  setSelectedMessages([contextMenuMessage.id]);
                  setShowMessageContextMenu(false);
                  setContextMenuMessage(null);
                }}
                className="w-full px-4 py-3 bg-teal-600 text-white rounded-xl font-medium hover:bg-teal-700 flex items-center justify-center gap-2"
              >
                Select Message
              </button>
              <button
                onClick={() => {
                  setShowMessageContextMenu(false);
                  setContextMenuMessage(null);
                }}
                className="w-full px-4 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Notification */}
      {showSuccessNotification && (
        <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
          <div className="bg-teal-600 text-white px-6 py-3 rounded-xl shadow-lg flex items-center gap-2 pointer-events-auto">
            <span className="text-lg">✓</span>
            <span className="font-medium">{successMessage}</span>
          </div>
        </div>
      )}

      {/* Compose modal removed - users can start conversations from discover page */}
    </div>
    </ProtectedRoute>
  );
}

export default function MessagesPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    }>
      <MessagesContent />
    </Suspense>
  );
}
