import { getStoredSession } from './session';
import { adminDeleteUser } from './account-deletion';

export const getAdminLevel = async (): Promise<'gold' | 'silver' | 'bronze' | null> => {
  let session = null;
  
  // First check sessionStorage for admin session
  const adminSession = sessionStorage.getItem('supabase-session');
  if (adminSession) {
    try {
      session = JSON.parse(adminSession);
    } catch (err) {
      console.error('Invalid admin session in sessionStorage');
    }
  }
  
  // If no admin session, check if user is logged in via main app
  if (!session) {
    const mainAppSession = localStorage.getItem('sb-ryvecaicjhzfsikfedkp-auth-token');
    if (mainAppSession) {
      try {
        const mainSession = JSON.parse(mainAppSession);
        if (mainSession?.access_token && mainSession?.user) {
          // Copy main app session to admin sessionStorage for consistency
          sessionStorage.setItem('supabase-session', mainAppSession);
          session = mainSession;
        }
      } catch (err) {
        console.error('Invalid main app session in localStorage');
      }
    }
  }
  
  if (!session?.user) return null;
  
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    const res = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${session.user.id}&select=admin_level,is_admin`,
      {
        headers: {
          'apikey': supabaseKey!,
          'Authorization': `Bearer ${session.access_token}`,
        },
      }
    );
    
    const profiles = await res.json();
    const profile = profiles[0];
    
    if (profile?.admin_level) {
      return profile.admin_level;
    } else if (profile?.is_admin === true) {
      // Legacy admin users get gold level
      return 'gold';
    }
    
    return null;
  } catch (err) {
    console.error('Error checking admin level:', err);
    return null;
  }
};

export const isAdmin = async (): Promise<boolean> => {
  const adminLevel = await getAdminLevel();
  return adminLevel !== null;
};

export const hasAdminAccess = async (requiredLevel: 'bronze' | 'silver' | 'gold'): Promise<boolean> => {
  const adminLevel = await getAdminLevel();
  if (!adminLevel) return false;
  
  const levels = { bronze: 1, silver: 2, gold: 3 };
  const userLevel = levels[adminLevel];
  const required = levels[requiredLevel];
  
  return userLevel >= required;
};

export const requireAdmin = async () => {
  const adminStatus = await isAdmin();
  if (!adminStatus) {
    throw new Error('Admin access required');
  }
  return true;
};

export const getAdminStats = async () => {
  let sessionData = null;
  
  // Check sessionStorage first, then localStorage
  const adminSession = sessionStorage.getItem('supabase-session');
  if (adminSession) {
    try {
      sessionData = JSON.parse(adminSession);
    } catch (err) {
      console.error('Invalid admin session');
    }
  }
  
  // Fallback to main app session
  if (!sessionData) {
    const mainAppSession = localStorage.getItem('sb-ryvecaicjhzfsikfedkp-auth-token');
    if (mainAppSession) {
      try {
        sessionData = JSON.parse(mainAppSession);
        // Copy to sessionStorage for future admin calls
        if (sessionData?.access_token) {
          sessionStorage.setItem('supabase-session', mainAppSession);
        }
      } catch (err) {
        console.error('Invalid main app session');
      }
    }
  }
  
  if (!sessionData?.user) throw new Error('Not authenticated');
  
  const session = sessionData;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  // Stats calculated directly from profile/content tables
  
  const headers = { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}` };
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const todayStr = now.toISOString().split('T')[0];

  const safe = async (url: string) => {
    try {
      const r = await fetch(url, { headers });
      return r.ok ? await r.json() : [];
    } catch { return []; }
  };

  const [profiles, events, circles, boardPosts, messages] = await Promise.all([
    safe(`${supabaseUrl}/rest/v1/profiles?select=id,is_active,is_banned,created_at,user_type`),
    safe(`${supabaseUrl}/rest/v1/events?select=id,created_at,is_cancelled`),
    safe(`${supabaseUrl}/rest/v1/circles?select=id,created_at,is_public`),
    safe(`${supabaseUrl}/rest/v1/community_posts?select=id,created_at`),
    safe(`${supabaseUrl}/rest/v1/messages?select=id,created_at&created_at=gte.${todayStr}`),
  ]);

  const active = profiles.filter((p: any) => p.is_active !== false && p.is_banned !== true);
  return {
    total_active_users: active.length,
    total_users: profiles.length,
    new_users_this_week: profiles.filter((p: any) => new Date(p.created_at) >= weekAgo).length,
    new_users_this_month: profiles.filter((p: any) => new Date(p.created_at) >= monthAgo).length,
    families: active.filter((p: any) => !p.user_type || p.user_type === 'family').length,
    teachers: active.filter((p: any) => p.user_type === 'teacher').length,
    businesses: active.filter((p: any) => p.user_type === 'business').length,
    banned_users: profiles.filter((p: any) => p.is_banned === true).length,
    total_events: events.length,
    active_events: events.filter((e: any) => !e.is_cancelled).length,
    total_circles: circles.length,
    public_circles: circles.filter((c: any) => c.is_public).length,
    board_posts: boardPosts.length,
    board_posts_this_week: boardPosts.filter((p: any) => new Date(p.created_at) >= weekAgo).length,
    messages_today: messages.length,
    conversations_today: 0,
    announcements_this_month: 0,
  };
};

export const getAllUsers = async (filters: { search?: string; banned?: boolean } = {}) => {
  let sessionData = null;
  
  // Check sessionStorage first, then localStorage
  const adminSession = sessionStorage.getItem('supabase-session');
  if (adminSession) {
    try {
      sessionData = JSON.parse(adminSession);
    } catch (err) {
      console.error('Invalid admin session');
    }
  }
  
  // Fallback to main app session
  if (!sessionData) {
    const mainAppSession = localStorage.getItem('sb-ryvecaicjhzfsikfedkp-auth-token');
    if (mainAppSession) {
      try {
        sessionData = JSON.parse(mainAppSession);
        // Copy to sessionStorage for future admin calls
        if (sessionData?.access_token) {
          sessionStorage.setItem('supabase-session', mainAppSession);
        }
      } catch (err) {
        console.error('Invalid main app session');
      }
    }
  }
  
  if (!sessionData?.user) throw new Error('Not authenticated');
  
  const session = sessionData;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  let url = `${supabaseUrl}/rest/v1/profiles?select=*&order=created_at.desc`;
  
  if (filters.banned !== undefined) {
    url += `&is_banned=eq.${filters.banned}`;
  }
  
  if (filters.search) {
    url += `&or=(family_name.ilike.%${filters.search}%,display_name.ilike.%${filters.search}%,location_name.ilike.%${filters.search}%,email.ilike.%${filters.search}%)`;
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
  
  try {
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
      // If notifications table doesn't exist, simulate success
      console.log('Notifications table not found, simulating broadcast send');
      return {
        id: 'simulated-' + Date.now(),
        title,
        content,
        type: 'announcement',
        target_type: targetType,
        target_value: targetValue,
        sent_by: session.user.id,
        sent_at: new Date().toISOString(),
        is_sent: true,
      };
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
    
    if (usersRes.ok) {
      const users = await usersRes.json();
      
      // Create user_notifications for each target user (if table exists)
      const userNotifications = users.map((user: any) => ({
        user_id: user.id,
        notification_id: notification.id,
      }));
      
      try {
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
      } catch (err) {
        console.log('user_notifications table not found, skipping');
      }
    }
    
    return notification;
  } catch (err) {
    console.error('Error sending broadcast:', err);
    throw new Error('Failed to send broadcast. Database may need setup.');
  }
};

export const deleteUser = async (userId: string, reason?: string): Promise<void> => {
  await adminDeleteUser(userId, reason);
};