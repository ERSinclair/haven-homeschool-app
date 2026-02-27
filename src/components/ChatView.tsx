'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import EmojiPicker from '@/components/EmojiPicker';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

export type ChatMessage = {
  id: string;
  content: string;
  sender_id: string;
  created_at: string;
  file_url?: string | null;
  file_type?: string | null;
  sender_profile?: {
    display_name?: string | null;
    family_name?: string | null;
    avatar_url?: string | null;
  } | null;
};

export type ChatReaction = { emoji: string; users: string[] };

export interface ChatViewProps {
  messages: ChatMessage[];
  currentUserId: string;
  /** reactions[messageId] = array of { emoji, users } */
  reactions?: Record<string, ChatReaction[]>;
  /** Called with the text string when user presses send */
  onSend: (text: string) => Promise<void> | void;
  /** Optional — if omitted the paperclip button is hidden */
  onSendFile?: (file: File) => Promise<void> | void;
  /** Called when user taps a reaction pill or picks from reaction sheet */
  onReact?: (messageId: string, emoji: string) => Promise<void> | void;
  /** Show while message is sending */
  sending?: boolean;
  /** Show while file is uploading */
  uploadingFile?: boolean;
  /** Show sender name above their bubbles (for group chats) */
  showSenderName?: boolean;
  placeholder?: string;
  emptyText?: string;
  /** Increment/change to trigger scroll-to-bottom (e.g. pass messages.length) */
  scrollTrigger?: unknown;
  /** If provided, long-press calls this instead of the built-in reaction sheet */
  onLongPress?: (msg: ChatMessage) => void;
  /** Called when a message bubble is tapped (used for selection mode) */
  onMessageClick?: (msgId: string) => void;
  /** Message IDs to render with a selection ring */
  selectedMessageIds?: string[];
}

function formatTime(ts: string): string {
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
  return (
    d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) +
    ' · ' +
    d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })
  );
}

function getSenderName(msg: ChatMessage): string {
  return msg.sender_profile?.family_name || msg.sender_profile?.display_name || 'Someone';
}

export default function ChatView({
  messages,
  currentUserId,
  reactions = {},
  onSend,
  onSendFile,
  onReact,
  sending = false,
  uploadingFile = false,
  showSenderName = false,
  placeholder = 'Type a message...',
  emptyText = 'No messages yet. Say hi!',
  scrollTrigger,
  onLongPress,
  onMessageClick,
  selectedMessageIds,
}: ChatViewProps) {
  const [text, setText] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [selectedMsg, setSelectedMsg] = useState<ChatMessage | null>(null);
  const [showReactionSheet, setShowReactionSheet] = useState(false);
  const [mounted, setMounted] = useState(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => { setMounted(true); }, []);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when new messages arrive or trigger changes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, scrollTrigger]);

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed && !pendingFile) return;

    if (pendingFile && onSendFile) {
      await onSendFile(pendingFile);
      setPendingFile(null);
      if (fileRef.current) fileRef.current.value = '';
    }
    if (trimmed) {
      await onSend(trimmed);
    }
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = '40px';
    }
  }, [text, pendingFile, onSend, onSendFile]);

  const handleLongPressStart = (msg: ChatMessage, e: React.TouchEvent) => {
    touchStartPosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      setSelectedMsg(msg);
      if (onLongPress) {
        onLongPress(msg);
      } else {
        setShowReactionSheet(true);
      }
    }, 600);
  };

  const handleLongPressEnd = () => {
    touchStartPosRef.current = null;
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  // Only cancel long-press if finger moved more than 8px (real scroll, not micro-jitter)
  const handleLongPressMoved = (e: React.TouchEvent) => {
    if (!touchStartPosRef.current || !longPressTimerRef.current) return;
    const dx = Math.abs(e.touches[0].clientX - touchStartPosRef.current.x);
    const dy = Math.abs(e.touches[0].clientY - touchStartPosRef.current.y);
    if (dx > 8 || dy > 8) handleLongPressEnd();
  };

  const handleEmojiInsert = (emoji: string) => {
    const el = textareaRef.current;
    if (el) {
      const start = el.selectionStart ?? text.length;
      const end = el.selectionEnd ?? text.length;
      const next = text.slice(0, start) + emoji + text.slice(end);
      setText(next);
      setTimeout(() => {
        el.focus();
        el.setSelectionRange(start + emoji.length, start + emoji.length);
      }, 0);
    } else {
      setText(v => v + emoji);
    }
  };

  return (
    <div className="flex flex-col h-full">

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full py-16">
            <p className="text-gray-400 text-sm text-center">{emptyText}</p>
          </div>
        ) : (
          messages.map(msg => {
            const isMe = msg.sender_id === currentUserId;
            const msgReactions = reactions[msg.id] || [];
            const senderName = getSenderName(msg);
            const avatarUrl = msg.sender_profile?.avatar_url;

            return (
              <div
                key={msg.id}
                className={`flex gap-2 ${isMe ? 'flex-row-reverse' : ''}${selectedMessageIds?.includes(msg.id) ? ' ring-2 ring-emerald-300' : ''}`}
                onClick={() => onMessageClick?.(msg.id)}
                onTouchStart={e => handleLongPressStart(msg, e)}
                onTouchEnd={handleLongPressEnd}
                onTouchMove={handleLongPressMoved}
                onTouchCancel={handleLongPressEnd}
                onContextMenu={e => {
                  e.preventDefault();
                  setSelectedMsg(msg);
                  setShowReactionSheet(true);
                }}
              >
                {/* Avatar — shown for others only */}
                {!isMe && (
                  <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center text-xs font-bold text-emerald-700 flex-shrink-0 self-end overflow-hidden">
                    {avatarUrl
                      ? <img src={avatarUrl} className="w-7 h-7 rounded-full object-cover" alt="" />
                      : senderName[0]?.toUpperCase() || '?'
                    }
                  </div>
                )}

                {/* Bubble column */}
                <div className={`max-w-[75%] flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>

                  {/* Sender name — group chats only */}
                  {showSenderName && !isMe && (
                    <span className="text-xs text-gray-400 mb-0.5 ml-1">{senderName}</span>
                  )}

                  {/* Content */}
                  {msg.file_url && (msg.file_type?.startsWith('image/') || msg.file_type === 'image' || /\.(jpg|jpeg|png|gif|webp|heic)(\?|$)/i.test(msg.file_url)) ? (
                    <img
                      src={msg.file_url}
                      alt="Attachment"
                      className="max-w-[200px] max-h-[200px] object-cover rounded-2xl cursor-pointer"
                      onClick={() => window.open(msg.file_url!, '_blank')}
                    />
                  ) : msg.file_url ? (
                    <div className={`px-4 py-3 rounded-2xl text-sm ${isMe ? 'bg-emerald-600 text-white rounded-br-sm' : 'bg-white text-gray-900 shadow-sm rounded-bl-sm'}`}>
                      <a
                        href={msg.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`flex items-center gap-2 underline ${isMe ? 'text-emerald-100' : 'text-emerald-700'}`}
                      >
                        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                        </svg>
                        <span className="text-xs truncate max-w-[150px]">{msg.content || 'File'}</span>
                      </a>
                      <p className={`text-xs mt-1 ${isMe ? 'text-emerald-200' : 'text-gray-400'}`}>{formatTime(msg.created_at)}</p>
                    </div>
                  ) : (
                    <div className={`px-4 py-3 rounded-2xl text-sm ${isMe ? 'bg-emerald-600 text-white rounded-br-sm' : 'bg-white text-gray-900 shadow-sm rounded-bl-sm'}`}>
                      <p className="break-words">{msg.content}</p>
                      <p className={`text-xs mt-1 ${isMe ? 'text-emerald-200' : 'text-gray-400'}`}>{formatTime(msg.created_at)}</p>
                    </div>
                  )}

                  {/* Reaction pills — emoji only, no outline, glued to bubble */}
                  {msgReactions.length > 0 && (
                    <div className={`flex flex-wrap gap-0.5 -mt-1 ${isMe ? 'justify-end mr-2' : 'justify-start ml-2'}`}>
                      {msgReactions.map(r => (
                        <button
                          key={r.emoji}
                          type="button"
                          onClick={() => onReact?.(msg.id, r.emoji)}
                          className={`flex items-center gap-0.5 text-sm leading-none px-1 py-0.5 rounded-full transition-opacity ${
                            r.users.includes(currentUserId) ? 'opacity-100' : 'opacity-70 hover:opacity-100'
                          }`}
                          style={{ background: 'transparent' }}
                        >
                          {r.emoji}
                          {r.users.length > 1 && (
                            <span className="text-xs text-gray-500 font-medium">{r.users.length}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* ── Input bar ── */}
      <div
        className="relative flex-shrink-0 bg-white border-t border-gray-100 px-4 py-3"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
      >
        {/* Pending file preview */}
        {pendingFile && (
          <div className="mb-2 px-3 py-2 bg-gray-50 rounded-xl flex items-center gap-2 text-sm">
            <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
            <span className="flex-1 truncate text-gray-700">{pendingFile.name}</span>
            <button
              onClick={() => { setPendingFile(null); if (fileRef.current) fileRef.current.value = ''; }}
              className="text-gray-400 hover:text-red-400 text-lg leading-none"
            >
              ×
            </button>
          </div>
        )}

        {/* Emoji picker (floats above input) */}
        {showEmojiPicker && (
          <EmojiPicker
            onSelect={emoji => { handleEmojiInsert(emoji); }}
            onClose={() => setShowEmojiPicker(false)}
          />
        )}

        <div className="flex gap-2 items-end">
          {/* Hidden file input */}
          <input
            ref={fileRef}
            type="file"
            accept="image/*,.pdf,.doc,.docx,.txt"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) setPendingFile(f);
            }}
          />

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={e => {
              setText(e.target.value);
              const el = e.target as HTMLTextAreaElement;
              el.style.height = 'auto';
              el.style.height = Math.min(el.scrollHeight, 120) + 'px';
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={pendingFile ? 'Add a caption (optional)...' : placeholder}
            rows={1}
            className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
            style={{ minHeight: '40px', maxHeight: '120px' }}
          />

          {/* Emoji button */}
          <button
            type="button"
            onClick={() => setShowEmojiPicker(v => !v)}
            className="p-2 text-gray-400 hover:text-emerald-600 flex-shrink-0 transition-colors"
            title="Emoji"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>

          {/* Paperclip — only rendered when onSendFile is provided */}
          {onSendFile && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploadingFile}
              className="p-2 text-gray-400 hover:text-emerald-600 disabled:opacity-40 flex-shrink-0 transition-colors"
              title="Attach file"
            >
              {uploadingFile ? (
                <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
              )}
            </button>
          )}

          {/* Send */}
          <button
            onClick={handleSend}
            disabled={(!text.trim() && !pendingFile) || sending || uploadingFile}
            className="w-10 h-10 flex items-center justify-center flex-shrink-0 bg-emerald-600 text-white rounded-xl disabled:bg-gray-200 disabled:text-gray-400 transition-colors"
          >
            {sending ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* ── Reaction sheet (bottom sheet) — rendered via portal to escape stacking context ── */}
      {showReactionSheet && selectedMsg && mounted && createPortal(
        <div
          className="fixed inset-0 z-overlay"
          onClick={() => { setShowReactionSheet(false); setSelectedMsg(null); }}
        >
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl pb-8"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </div>
            <div className="flex justify-center gap-2 px-6 pb-2">
              {QUICK_REACTIONS.map(emoji => {
                const myReact = (reactions[selectedMsg.id] || [])
                  .find(g => g.emoji === emoji)
                  ?.users.includes(currentUserId);
                return (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      onReact?.(selectedMsg.id, emoji);
                      setShowReactionSheet(false);
                      setSelectedMsg(null);
                    }}
                    className={`w-11 h-11 flex items-center justify-center text-2xl rounded-full transition-all ${
                      myReact
                        ? 'bg-emerald-100 ring-2 ring-emerald-400 scale-110'
                        : 'bg-gray-100 hover:bg-gray-200 active:scale-95'
                    }`}
                  >
                    {emoji}
                  </button>
                );
              })}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
