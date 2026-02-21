export type ToastType = 'success' | 'error' | 'info';

export function toast(message: string, type: ToastType = 'info') {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('haven-toast', { detail: { message, type } }));
  }
}
