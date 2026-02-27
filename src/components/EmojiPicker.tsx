'use client';
import { useEffect, useRef } from 'react';

const EMOJI_GROUPS = [
  { label: 'Smileys', emojis: ['😀','😂','😍','🥰','😊','😎','🤗','😅','😭','😤','🤔','😴','🥳','😋','🤩','😮','😱','🤣','😇'] },
  { label: 'Hands', emojis: ['👍','👎','👋','🙌','🤝','💪','🙏','✌️','🤞','👏','🫶','🤜'] },
  { label: 'Hearts', emojis: ['❤️','🧡','💛','💚','💙','💜','🤍','💯','🔥','✨','⭐','🌟'] },
  { label: 'Family', emojis: ['👶','🧒','👧','👦','👨‍👩‍👧‍👦','👪','🎒','🏡','🫂'] },
  { label: 'Learning', emojis: ['📚','✏️','🎨','📝','🔬','🌍','🎭','🧩','🎯','🏆','📖','💡'] },
  { label: 'Nature', emojis: ['🌈','🌻','🌿','🍀','🌸','🌊','☀️','🌙','🦋','🐝','🌱','⛅'] },
  { label: 'Fun', emojis: ['🎉','🎊','🏃','🚴','🏊','⚽','🎵','🍕','🍎','☕','✅','❌'] },
];

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
  position?: 'above' | 'below';
}

export default function EmojiPicker({ onSelect, onClose, position = 'above' }: EmojiPickerProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Slight delay so the click that opened the picker doesn't immediately close it
    const id = setTimeout(() => document.addEventListener('mousedown', handler), 50);
    return () => { clearTimeout(id); document.removeEventListener('mousedown', handler); };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className={`absolute ${position === 'above' ? 'bottom-full mb-2' : 'top-full mt-2'} left-0 z-overlay bg-white border border-gray-200 rounded-2xl shadow-xl p-3 w-72 max-h-72 overflow-y-auto`}
    >
      <div className="space-y-2">
        {EMOJI_GROUPS.map(group => (
          <div key={group.label}>
            <p className="text-xs text-gray-400 font-semibold mb-1 uppercase tracking-wide">{group.label}</p>
            <div className="flex flex-wrap gap-0.5">
              {group.emojis.map(emoji => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => { onSelect(emoji); onClose(); }}
                  className="w-8 h-8 flex items-center justify-center text-lg hover:bg-gray-100 rounded-lg transition-colors"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
