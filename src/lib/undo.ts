// Undo delete utility
// Usage: undoDelete({ label: 'Note', onDelete: () => fetch(...), onUndo: () => {} })

export interface UndoDeleteOptions {
  label: string;           // e.g. "Note", "Message", "Event"
  onDelete: () => Promise<void> | void;
  onUndo?: () => void;
  delayMs?: number;        // default 5000ms
}

export function undoDelete({ label, onDelete, onUndo, delayMs = 5000 }: UndoDeleteOptions): () => void {
  let cancelled = false;

  // Fire the toast event
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('haven-undo-toast', {
      detail: {
        label,
        delayMs,
        cancel: () => { cancelled = true; onUndo?.(); },
      }
    }));
  }

  // Schedule actual delete
  const timer = setTimeout(async () => {
    if (!cancelled) await onDelete();
  }, delayMs);

  // Return cancel function
  return () => {
    clearTimeout(timer);
    cancelled = true;
    onUndo?.();
  };
}
