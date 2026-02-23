// Push notification utilities

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const arr = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) arr[i] = rawData.charCodeAt(i);
  return arr.buffer;
}

/** Register the service worker (no-op if already registered). Safe to call early. */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined') return null;
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js');
  } catch {
    return null;
  }
}

/** Get the current Notification permission state. */
export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

/**
 * Request permission + subscribe to push + save to API.
 * Returns true if successfully subscribed.
 */
export async function enablePushNotifications(userId: string, accessToken: string): Promise<boolean> {
  return registerPush(userId, accessToken);
}

/**
 * Register service worker + subscribe to push, then save to our API.
 * Safe to call multiple times (no-op if already subscribed).
 */
export async function registerPush(userId: string, accessToken: string): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;

  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return false;

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      try {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(PUBLIC_KEY),
        });
      } catch {
        // Push service unavailable (no FCM connection, dev env, etc.) — silently skip
        return false;
      }
    }

    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ subscription: sub.toJSON(), userId }),
    });

    return true;
  } catch {
    // Silent — push is best-effort and not available in all environments
    return false;
  }
}

/**
 * Send a push notification to another user via our API.
 * Fire-and-forget — errors are silently swallowed.
 */
export async function sendPush(
  accessToken: string,
  recipientId: string,
  title: string,
  body: string,
  url: string = '/'
): Promise<void> {
  try {
    await fetch('/api/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ recipientId, title, body, url }),
    });
  } catch {
    // Silent — push is best-effort
  }
}

/** Compatibility wrapper used by notifications.ts */
export async function sendPushNotification({
  recipientId,
  title,
  body,
  url = '/notifications',
  accessToken,
}: {
  recipientId: string;
  title: string;
  body: string;
  url?: string;
  accessToken: string;
}): Promise<void> {
  return sendPush(accessToken, recipientId, title, body, url);
}
