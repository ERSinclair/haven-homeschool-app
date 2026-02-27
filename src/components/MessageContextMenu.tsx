'use client';



export type ContextMenuMessage = {
  id: string;
  content: string;
  sender_id: string;
  file_url?: string | null;
};

export type ContextMenuReaction = { emoji: string; users: string[] };

interface MessageContextMenuProps {
  message: ContextMenuMessage;
  currentUserId: string;
  reactions: ContextMenuReaction[];
  onReact: (emoji: string) => void;
  onClose: () => void;
  onCopy?: () => void;
  onSave?: () => void;
  onDelete?: () => void;
  /** Any extra action rows to render below the standard ones */
  extraActions?: React.ReactNode;
}

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

export default function MessageContextMenu({
  message,
  currentUserId,
  reactions,
  onReact,
  onClose,
  onCopy,
  onSave,
  onDelete,
  extraActions,
}: MessageContextMenuProps) {
  // Strip file URL from content for preview/copy
  const urlPattern = /https?:\/\/\S+/g;
  const textContent = message.content.replace(urlPattern, '').trim();
  const isSender = message.sender_id === currentUserId;

  return (
    <div
      className="fixed inset-0 z-overlay"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Bottom sheet */}
      <div
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl"
        style={{ paddingBottom: 'calc(72px + env(safe-area-inset-bottom, 0px))' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        {/* Quick emoji reactions */}
        <div className="flex justify-center gap-2 px-6 pb-3">
          {QUICK_REACTIONS.map(emoji => {
            const myReact = reactions.find(g => g.emoji === emoji)?.users.includes(currentUserId);
            return (
              <button
                key={emoji}
                type="button"
                onClick={() => { onReact(emoji); onClose(); }}
                className={`w-10 h-10 flex items-center justify-center text-xl rounded-full transition-all ${
                  myReact ? 'bg-emerald-100 ring-2 ring-emerald-400 scale-110' : 'bg-gray-100 hover:bg-gray-200'
                }`}
              >
                {emoji}
              </button>
            );
          })}
        </div>

        {/* Message preview */}
        {textContent && (
          <p className="text-xs text-gray-400 text-center px-6 pb-4 truncate">
            {textContent.length > 60 ? textContent.substring(0, 60) + '...' : textContent}
          </p>
        )}

        {/* Action rows */}
        <div className="divide-y divide-gray-100 border-t border-gray-100">
          {textContent && onCopy && (
            <button
              onClick={() => { onCopy(); onClose(); }}
              className="w-full px-6 py-4 text-left text-gray-900 font-medium text-sm hover:bg-gray-50 active:bg-gray-100"
            >
              Copy text
            </button>
          )}

          {onSave && (
            <button
              onClick={() => { onSave(); onClose(); }}
              className="w-full px-6 py-4 text-left text-gray-900 font-medium text-sm hover:bg-gray-50 active:bg-gray-100"
            >
              Save message
            </button>
          )}

          {extraActions}

          {isSender && onDelete && (
            <button
              onClick={() => { onDelete(); onClose(); }}
              className="w-full px-6 py-4 text-left text-red-600 font-medium text-sm hover:bg-red-50 active:bg-red-100"
            >
              Delete message
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
