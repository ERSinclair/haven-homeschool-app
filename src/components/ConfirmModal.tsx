'use client';

interface Props {
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-md" onClick={onCancel} />
      <div
        className="relative w-full max-w-xs rounded-3xl shadow-2xl border border-white/40 px-5 py-6"
        style={{ background: 'rgba(255,255,255,0.88)', backdropFilter: 'blur(32px) saturate(1.6)', WebkitBackdropFilter: 'blur(32px) saturate(1.6)' }}
      >
        <p className="text-sm font-medium text-gray-800 text-center mb-5 leading-relaxed">{message}</p>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 bg-white/60 text-gray-600 rounded-2xl font-semibold text-sm border border-white/60 hover:bg-white/80 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 py-2.5 rounded-2xl font-semibold text-sm shadow-sm transition-colors ${
              destructive
                ? 'bg-red-500 text-white hover:bg-red-600'
                : 'bg-emerald-600 text-white hover:bg-emerald-700'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
