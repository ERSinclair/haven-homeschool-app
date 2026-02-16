import { getStoredSession } from './session';
import { supabase } from './supabase';

/**
 * Delete a user account and all associated data
 * Can be called by admin (for any user) or user (for their own account)
 */
export const deleteAccount = async (userId: string, isAdminAction: boolean = false): Promise<void> => {
  const session = getStoredSession();
  if (!session?.user) {
    throw new Error('Not authenticated');
  }

  // Authorization check
  if (!isAdminAction && session.user.id !== userId) {
    throw new Error('You can only delete your own account');
  }

  if (isAdminAction) {
    // Check if current user is admin
    const { data: adminProfile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', session.user.id)
      .single();
    
    if (!adminProfile?.is_admin) {
      throw new Error('Admin access required');
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  try {
    // Start transaction-like cleanup (order matters due to foreign key constraints)
    
    // 1. Delete from blocked_users (both as blocker and blocked)
    await fetch(`${supabaseUrl}/rest/v1/blocked_users?or=(blocker_id.eq.${userId},blocked_id.eq.${userId})`, {
      method: 'DELETE',
      headers: {
        'apikey': supabaseKey!,
        'Authorization': `Bearer ${session.access_token}`,
      },
    });

    // 2. Delete reports (both as reporter and reported)
    await fetch(`${supabaseUrl}/rest/v1/reports?or=(reporter_id.eq.${userId},reported_id.eq.${userId})`, {
      method: 'DELETE',
      headers: {
        'apikey': supabaseKey!,
        'Authorization': `Bearer ${session.access_token}`,
      },
    });

    // 3. Delete event RSVPs
    await fetch(`${supabaseUrl}/rest/v1/event_rsvps?profile_id=eq.${userId}`, {
      method: 'DELETE',
      headers: {
        'apikey': supabaseKey!,
        'Authorization': `Bearer ${session.access_token}`,
      },
    });

    // 4. Delete events hosted by user
    await fetch(`${supabaseUrl}/rest/v1/events?host_id=eq.${userId}`, {
      method: 'DELETE',
      headers: {
        'apikey': supabaseKey!,
        'Authorization': `Bearer ${session.access_token}`,
      },
    });

    // 5. Delete messages sent by user
    await fetch(`${supabaseUrl}/rest/v1/messages?sender_id=eq.${userId}`, {
      method: 'DELETE',
      headers: {
        'apikey': supabaseKey!,
        'Authorization': `Bearer ${session.access_token}`,
      },
    });

    // 6. Delete conversations where user is participant
    await fetch(`${supabaseUrl}/rest/v1/conversations?or=(participant_1.eq.${userId},participant_2.eq.${userId})`, {
      method: 'DELETE',
      headers: {
        'apikey': supabaseKey!,
        'Authorization': `Bearer ${session.access_token}`,
      },
    });

    // 7. Delete user notifications
    await fetch(`${supabaseUrl}/rest/v1/user_notifications?user_id=eq.${userId}`, {
      method: 'DELETE',
      headers: {
        'apikey': supabaseKey!,
        'Authorization': `Bearer ${session.access_token}`,
      },
    });

    // 8. Delete profile photo from storage if exists
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('avatar_url')
        .eq('id', userId)
        .single();

      if (profile?.avatar_url) {
        const path = profile.avatar_url.split('/').slice(-2).join('/'); // Get userId/filename
        await supabase.storage.from('profile-photos').remove([path]);
      }
    } catch (storageError) {
      console.warn('Could not delete profile photo:', storageError);
      // Continue with deletion even if photo deletion fails
    }

    // 9. Delete profile (this should cascade to auth.users via trigger)
    const deleteResponse = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${userId}`, {
      method: 'DELETE',
      headers: {
        'apikey': supabaseKey!,
        'Authorization': `Bearer ${session.access_token}`,
      },
    });

    if (!deleteResponse.ok) {
      const error = await deleteResponse.text();
      throw new Error(`Failed to delete profile: ${error}`);
    }

    // 10. Delete from auth.users (requires service role or admin function)
    // Note: This might need to be done via a Database Function or Edge Function
    // For now, we soft-delete by removing the profile which is the main concern

    console.log(`Account ${userId} successfully deleted`);

  } catch (error) {
    console.error('Account deletion failed:', error);
    throw new Error(`Account deletion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Admin function to delete any user account
 */
export const adminDeleteUser = async (userId: string, reason?: string): Promise<void> => {
  console.log(`Admin deleting user ${userId}${reason ? ` - Reason: ${reason}` : ''}`);
  await deleteAccount(userId, true);
};

/**
 * User function to delete their own account
 */
export const deleteMyAccount = async (): Promise<void> => {
  const session = getStoredSession();
  if (!session?.user) {
    throw new Error('Not authenticated');
  }
  
  console.log(`User ${session.user.id} deleting their own account`);
  await deleteAccount(session.user.id, false);
  
  // Clear local session after successful deletion
  localStorage.clear();
  sessionStorage.clear();
};

/**
 * Quick cleanup for test accounts
 * Admin can call this to delete multiple test accounts at once
 */
export const cleanupTestAccounts = async (testUserIds: string[]): Promise<{ deleted: string[], failed: { id: string, error: string }[] }> => {
  const deleted: string[] = [];
  const failed: { id: string, error: string }[] = [];

  for (const userId of testUserIds) {
    try {
      await adminDeleteUser(userId, 'Test account cleanup');
      deleted.push(userId);
    } catch (error) {
      failed.push({ 
        id: userId, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }

  return { deleted, failed };
};