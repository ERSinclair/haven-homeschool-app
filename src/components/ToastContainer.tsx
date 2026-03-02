'use client';

import { useState, useEffect, useRef } from 'react';

type Toast = { id: number; message: string; type: 'success' | 'error' | 'info' };
type UndoToast = { id: number; label: string; cancel: () => void; delayMs: number };

export default function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [undoToasts, setUndoToasts] = useState<UndoToast[]>([]);
  const progressRefs = useRef<Record<number, HTMLDivElement | null>>({});

  useEffect(() => {
    const handler = (e: Event) => {
      const { message, type } = (e as CustomEvent).detail;
      const id = Date.now();
      setToasts(prev => [...prev, { id, message, type }]);
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
    };
    window.addEventListener('haven-toast', handler);
    return () => window.removeEventListener('haven-toast', handler);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const { label, cancel, delayMs } = (e as CustomEvent).detail;
      const id = Date.now();
      setUndoToasts(prev => [...prev, { id, label, cancel, delayMs }]);
      setTimeout(() => setUndoToasts(prev => prev.filter(t => t.id !== id)), delayMs);
    };
    window.addEventListener('haven-undo-toast', handler);
    return () => window.removeEventListener('haven-undo-toast', handler);
  }, []);

  const handleUndo = (t: UndoToast) => {
    t.cancel();
    setUndoToasts(prev => prev.filter(u => u.id !== t.id));
  };

  return (
    <div className="fixed bottom-24 left-0 right-0 z-[100] flex flex-col items-center gap-2 pointer-events-none px-4">
      {undoToasts.map(t => (
        <div key={t.id} className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl shadow-lg bg-gray-900 text-white text-sm font-medium max-w-sm w-full pointer-events-auto">
          <span>{t.label} deleted</span>
          <button
            onClick={() => handleUndo(t)}
            className="text-emerald-400 font-bold hover:text-emerald-300 flex-shrink-0"
          >
            Undo
          </button>
          {/* Progress bar */}
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/20 rounded-b-xl overflow-hidden">
            <div
              className="h-full bg-emerald-400"
              style={{ animation: `shrink ${t.delayMs}ms linear forwards` }}
            />
          </div>
        </div>
      ))}
      {toasts.map(t => (
        <div
          key={t.id}
          className={`px-4 py-3 rounded-xl shadow-lg text-sm font-medium max-w-sm w-full text-center pointer-events-auto ${
            t.type === 'error'   ? 'bg-red-600 text-white' :
            t.type === 'success' ? 'bg-emerald-600 text-white' :
                                   'bg-gray-800 text-white'
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
