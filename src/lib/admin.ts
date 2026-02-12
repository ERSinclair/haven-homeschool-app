import { getStoredSession } from './session';
import { adminDeleteUser } from './account-deletion';

export const isAdmin = async (): Promise<boolean> => {
  // Check sessionStorage for admin session first
  const adminSession = sessionStorage.getItem('supabase-session');
  if (!adminSession) return false;
  
  try {
    const session = JSON.parse(adminSession);
    if (!session?.user) return false;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    const res = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${session.user.id}&select=is_admin`,
      {
        headers: {
          'apikey': supabaseKey!,
          'Authorization': `Bearer ${session.access_token}`,
        },
      }
    );
    
    const profiles = await res.json();
    return profiles[0]?.is_admin === true;
  } catch (err) {
    console.error('Error checking admin status:', err);
    return false;
  }
};

export const requireAdmin = async () => {
  const adminStatus = await isAdmin();
  if (!adminStatus) {
    throw new Error('Admin access required');
  }
  return true;
};

export const getAdminStats = async () => {
  const adminSession = sessionStorage.getItem('supabase-session');
  if (!adminSession) throw new Error('Not authenticated');
  
  const session = JSON.parse(adminSession);
  if (!session?.user) throw new Error('Not authenticated');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  const res = await fetch(
    `${supabaseUrl}/rest/v1/admin_stats?select=*`,
    {
      headers: {
        'apikey': supabaseKey!,
        'Authorization': `Bearer ${session.access_token}`,
      },
    }
  );
  
  const stats = await res.json();
  return stats[0] || {};
};

export const getAllUsers = async (filters: { search?: string; banned?: boolean } = {}) => {
  const adminSession = sessionStorage.getItem('supabase-session');
  if (!adminSession) throw new Error('Not authenticated');
  
  const session = JSON.parse(adminSession);
  if (!session?.user) throw new Error('Not authenticated');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  let url = `${supabaseUrl}/rest/v1/profiles?select=*&order=created_at.desc`;
  
  if (filters.banned !== undefined) {
    url += `&is_banned=eq.${filters.banned}`;
  }
  
  if (filters.search) {
    url += `&or=(name.ilike.%${filters.search}%,location_name.ilike.%${filters.search}%,email.ilike.%${filters.search}%)`;
  }
  
  const res = await fetch(url, {
    headers: {
      'apikey': supabaseKey!,
      'Authorization': `Bearer ${session.access_token}`,
    },
  });
  
  return await res.json();
};

export const banUser = async (userId: string, reason: string) => {
  const adminSession = sessionStorage.getItem('supabase-session');
  if (!adminSession) throw new Error('Not authenticated');
  
  const session = JSON.parse(adminSession);
  if (!session?.user) throw new Error('Not authenticated');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  const res = await fetch(
    `${supabaseUrl}/rest/v1/profiles?id=eq.${userId}`,
    {
      method: 'PATCH',
      headers: {
        'apikey': supabaseKey!,
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        is_banned: true,
        banned_at: new Date().toISOString(),
        banned_by: session.user.id,
        ban_reason: reason,
      }),
    }
  );
  
  if (!res.ok) {
    throw new Error('Failed to ban user');
  }
  
  return true;
};

export const unbanUser = async (userId: string) => {
  const adminSession = sessionStorage.getItem('supabase-session');
  if (!adminSession) throw new Error('Not authenticated');
  
  const session = JSON.parse(adminSession);
  if (!session?.user) throw new Error('Not authenticated');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  const res = await fetch(
    `${supabaseUrl}/rest/v1/profiles?id=eq.${userId}`,
    {
      method: 'PATCH',
      headers: {
        'apikey': supabaseKey!,
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        is_banned: false,
        banned_at: null,
        banned_by: null,
        ban_reason: null,
      }),
    }
  );
  
  if (!res.ok) {
    throw new Error('Failed to unban user');
  }
  
  return true;
};

export const sendBroadcast = async (title: string, content: string, targetType: 'all' | 'location' = 'all', targetValue?: string) => {
  const adminSession = sessionStorage.getItem('supabase-session');
  if (!adminSession) throw new Error('Not authenticated');
  
  const session = JSON.parse(adminSession);
  if (!session?.user) throw new Error('Not authenticated');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  // Create the notification
  const notificationRes = await fetch(
    `${supabaseUrl}/rest/v1/notifications`,
    {
      method: 'POST',
      headers: {
        'apikey': supabaseKey!,
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({
        title,
        content,
        type: 'announcement',
        target_type: targetType,
        target_value: targetValue,
        sent_by: session.user.id,
        sent_at: new Date().toISOString(),
        is_sent: true,
      }),
    }
  );
  
  if (!notificationRes.ok) {
    throw new Error('Failed to create notification');
  }
  
  const [notification] = await notificationRes.json();
  
  // Get target users
  let usersQuery = `${supabaseUrl}/rest/v1/profiles?select=id&is_banned=eq.false`;
  if (targetType === 'location' && targetValue) {
    usersQuery += `&location_name.ilike.%${targetValue}%`;
  }
  
  const usersRes = await fetch(usersQuery, {
    headers: {
      'apikey': supabaseKey!,
      'Authorization': `Bearer ${session.access_token}`,
    },
  });
  
  const users = await usersRes.json();
  
  // Create user_notifications for each target user
  const userNotifications = users.map((user: any) => ({
    user_id: user.id,
    notification_id: notification.id,
  }));
  
  await fetch(
    `${supabaseUrl}/rest/v1/user_notifications`,
    {
      method: 'POST',
      headers: {
        'apikey': supabaseKey!,
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(userNotifications),
    }
  );
  
  return notification;
};

export const deleteUser = async (userId: string, reason?: string): Promise<void> => {
  await adminDeleteUser(userId, reason);
};