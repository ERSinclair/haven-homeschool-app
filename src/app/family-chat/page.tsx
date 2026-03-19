'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredSession } from '@/lib/session';
import ProtectedRoute from '@/components/ProtectedRoute';
import AppHeader from '@/components/AppHeader';
import ChatView, { ChatMessage, ChatReaction } from '@/components/ChatView';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function FamilyChatContent() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reactions, setReactions] = useState<Record<string, ChatReaction[]>>({});
  const [sending, setSending] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    init();
  }, []);

  useEffect(() => {
    if (!conversationId) return;
    fetchMessages();
    const interval = setInterval(fetchMessages, 5000);
    return () => clearInterval(interval);
  }, [conversationId]);

  async function init() {
    const session = getStoredSession();
    if (!session?.user) return;
    setUserId(session.user.id);
    const headers = { apikey: supabaseKey, Authorization: `Bearer ${session.access_token}` };

    // Get profile + family_id
    const profileRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${session.user.id}&select=family_id&limit=1`,
      { headers }
    );
    const [profile] = await profileRes.json();
    if (!profile?.family_id) { setLoading(false); return; }
    setFamilyId(profile.family_id);

    // Get family members
    const membersRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?family_id=eq.${profile.family_id}&select=id,family_name,display_name,avatar_url`,
      { headers }
    );
    const memberData = await membersRes.json();
    setMembers(Array.isArray(memberData) ? memberData : []);

    // Upsert family conversation
    const upsertRes = await fetch(`${supabaseUrl}/rest/v1/family_conversations`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=representation,resolution=merge-duplicates' },
      body: JSON.stringify({ family_id: profile.family_id }),
    });
    const [convo] = await upsertRes.json();
    if (convo?.id) setConversationId(convo.id);
    setLoading(false);
  }

  const fetchMessages = useCallback(async () => {
    if (!conversationId) return;
    const session = getStoredSession();
    if (!session) return;
    const headers = { apikey: supabaseKey, Authorization: `Bearer ${session.access_token}` };

    const res = await fetch(
      `${supabaseUrl}/rest/v1/family_messages?conversation_id=eq.${conversationId}&select=id,content,sender_id,created_at,file_url,file_type,profiles!family_messages_sender_id_fkey(display_name,family_name,avatar_url)&order=created_at.asc`,
      { headers }
    );
    const data = await res.json();
    if (!Array.isArray(data)) return;
    setMessages(data.map((m: any) => ({
      id: m.id,
      content: m.content ?? '',
      sender_id: m.sender_id,
      created_at: m.created_at,
      file_url: m.file_url ?? null,
      file_type: m.file_type ?? null,
      sender_profile: m.profiles ?? null,
    })));

    // Fetch reactions
    const msgIds = data.map((m: any) => m.id);
    if (msgIds.length === 0) return;
    const rRes = await fetch(
      `${supabaseUrl}/rest/v1/family_message_reactions?message_id=in.(${msgIds.join(',')})&select=message_id,emoji,user_id`,
      { headers }
    );
    const rData = await rRes.json();
    if (!Array.isArray(rData)) return;
    const grouped: Record<string, ChatReaction[]> = {};
    for (const r of rData) {
      if (!grouped[r.message_id]) grouped[r.message_id] = [];
      const existing = grouped[r.message_id].find(g => g.emoji === r.emoji);
      if (existing) existing.users.push(r.user_id);
      else grouped[r.message_id].push({ emoji: r.emoji, users: [r.user_id] });
    }
    setReactions(grouped);
  }, [conversationId]);

  async function handleSend(text: string) {
    if (!conversationId || !userId || !text.trim()) return;
    const session = getStoredSession();
    if (!session) return;
    setSending(true);
    await fetch(`${supabaseUrl}/rest/v1/family_messages`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ conversation_id: conversationId, sender_id: userId, content: text }),
    });
    await fetchMessages();
    setSending(false);
  }

  async function handleReact(messageId: string, emoji: string) {
    const session = getStoredSession();
    if (!session?.user) return;
    const headers = { apikey: supabaseKey, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' };
    const existing = (reactions[messageId] || []).find(r => r.emoji === emoji);
    const alreadyReacted = existing?.users.includes(session.user.id);
    if (alreadyReacted) {
      await fetch(`${supabaseUrl}/rest/v1/family_message_reactions?message_id=eq.${messageId}&user_id=eq.${session.user.id}&emoji=eq.${encodeURIComponent(emoji)}`, {
        method: 'DELETE', headers,
      });
    } else {
      await fetch(`${supabaseUrl}/rest/v1/family_message_reactions`, {
        method: 'POST', headers: { ...headers, Prefer: 'return=minimal' },
        body: JSON.stringify({ message_id: messageId, user_id: session.user.id, emoji }),
      });
    }
    await fetchMessages();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!familyId) {
    return (
      <div className="flex flex-col items-center justify-center h-64 px-8 text-center">
        <p className="text-gray-500 mb-4">No linked family members yet.</p>
        <button onClick={() => router.push('/profile')} className="px-6 py-2 bg-emerald-600 text-white rounded-xl font-semibold">
          Go to Profile
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-dvh">
      <div className="max-w-md mx-auto w-full px-4 pt-2 pb-2">
        <AppHeader title="Family Chat" onBack={() => router.back()} />
        {members.length > 0 && (
          <p className="text-xs text-gray-400 -mt-2 mb-1">
            {members.map(m => m.family_name || m.display_name).join(', ')}
          </p>
        )}
      </div>
      <div className="flex-1 overflow-hidden max-w-md mx-auto w-full">
        <ChatView
          messages={messages}
          currentUserId={userId ?? ''}
          reactions={reactions}
          onSend={handleSend}
          onReact={handleReact}
          sending={sending}
          showSenderName={true}
          scrollTrigger={messages.length}
          emptyText="No messages yet. Say hello to your family."
        />
      </div>
    </div>
  );
}

export default function FamilyChatPage() {
  return (
    <ProtectedRoute>
      <FamilyChatContent />
    </ProtectedRoute>
  );
}
