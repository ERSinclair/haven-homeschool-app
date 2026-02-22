import { sendPushNotification } from './push';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export type NotifType =
  | 'connection_request'
  | 'connection_accepted'
  | 'circle_invite'
  | 'event_rsvp'
  | 'message';

export interface CreateNotifParams {
  userId: string;       // recipient
  actorId: string;      // who triggered it
  type: NotifType;
  title: string;
  body?: string;
  link?: string;
  referenceId?: string;
  accessToken: string;
}

export async function createNotification(params: CreateNotifParams): Promise<void> {
  try {
    await fetch(`${supabaseUrl}/rest/v1/notifications`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey!,
        'Authorization': `Bearer ${params.accessToken}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        user_id: params.userId,
        actor_id: params.actorId,
        type: params.type,
        title: params.title,
        body: params.body,
        link: params.link,
        reference_id: params.referenceId,
        read: false,
      }),
    });

    // Fire push notification — non-blocking, silent failure
    sendPushNotification({
      recipientId: params.userId,
      title: params.title,
      body: params.body ?? '',
      url: params.link ?? '/notifications',
      accessToken: params.accessToken,
    });
  } catch {
    // Non-critical — never let notification failure break the main action
  }
}

export async function getUnreadCount(userId: string, accessToken: string): Promise<number> {
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/notifications?user_id=eq.${userId}&read=eq.false&select=id`,
      {
        headers: {
          'apikey': supabaseKey!,
          'Authorization': `Bearer ${accessToken}`,
          'Prefer': 'count=exact',
          'Range': '0-0',
        },
      }
    );
    const contentRange = res.headers.get('Content-Range');
    if (contentRange) {
      const total = contentRange.split('/')[1];
      return parseInt(total) || 0;
    }
    return 0;
  } catch {
    return 0;
  }
}

export async function markAllNotificationsRead(userId: string, accessToken: string): Promise<void> {
  try {
    await fetch(
      `${supabaseUrl}/rest/v1/notifications?user_id=eq.${userId}&read=eq.false`,
      {
        method: 'PATCH',
        headers: {
          'apikey': supabaseKey!,
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({ read: true }),
      }
    );
  } catch {
    // Silent
  }
}
