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

  // Helper: DELETE a resource but silently ignore 404 (table may not exist yet)
  const softDelete = async (url: string) => {
    const res = await fetch(url, {
      method: 'DELETE',
      headers: {
        'apikey': supabaseKey!,
        'Authorization': `Bearer ${session!.access_token}`,
      },
    });
    if (!res.ok && res.status !== 404) {
      console.warn(`Cleanup warning (${res.status}): ${url}`);
    }
  };

  try {
    // Start transaction-like cleanup (order matters due to foreign key constraints)
    
    // 1. Delete from blocked_users (both as blocker and blocked)
    await softDelete(`${supabaseUrl}/rest/v1/blocked_users?or=(blocker_id.eq.${userId},blocked_id.eq.${userId})`);

    // 2. Delete reports (both as reporter and reported)
    await softDelete(`${supabaseUrl}/rest/v1/reports?or=(reporter_id.eq.${userId},reported_id.eq.${userId})`);

    // 3. Delete push notification subscriptions
    await softDelete(`${supabaseUrl}/rest/v1/push_subscriptions?user_id=eq.${userId}`);

    // 4. Delete circle messages sent by user
    await softDelete(`${supabaseUrl}/rest/v1/circle_messages?sender_id=eq.${userId}`);

    // 5. Delete event messages sent by user
    await softDelete(`${supabaseUrl}/rest/v1/event_messages?sender_id=eq.${userId}`);

    // 6. Delete circle memberships
    await softDelete(`${supabaseUrl}/rest/v1/circle_members?member_id=eq.${userId}`);

    // 7. Delete circle invitations (sent or received)
    await softDelete(`${supabaseUrl}/rest/v1/circle_invitations?or=(inviter_id.eq.${userId},invitee_id.eq.${userId})`);

    // 8. Delete event invitations (sent or received)
    await softDelete(`${supabaseUrl}/rest/v1/event_invitations?or=(inviter_id.eq.${userId},invitee_id.eq.${userId})`);

    // 9. Delete event RSVPs
    await softDelete(`${supabaseUrl}/rest/v1/event_rsvps?profile_id=eq.${userId}`);

    // 10. Delete events hosted by user
    await softDelete(`${supabaseUrl}/rest/v1/events?host_id=eq.${userId}`);

    // 11. Delete community posts by user
    await softDelete(`${supabaseUrl}/rest/v1/community_posts?author_id=eq.${userId}`);

    // 12. Delete calendar notes
    await softDelete(`${supabaseUrl}/rest/v1/calendar_notes?profile_id=eq.${userId}`);

    // 13. Delete direct messages sent by user
    await softDelete(`${supabaseUrl}/rest/v1/messages?sender_id=eq.${userId}`);

    // 14. Delete conversations where user is participant
    await softDelete(`${supabaseUrl}/rest/v1/conversations?or=(participant_1.eq.${userId},participant_2.eq.${userId})`);

    // 15. Delete connections (sent or received)
    await softDelete(`${supabaseUrl}/rest/v1/connections?or=(requester_id.eq.${userId},receiver_id.eq.${userId})`);

    // 16. Delete notifications for this user
    await softDelete(`${supabaseUrl}/rest/v1/notifications?user_id=eq.${userId}`);

    // 17. Delete profile photo from storage if exists
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

    // 18. Delete profile (this should cascade to auth.users via trigger)
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

    // 19. Delete from auth.users (requires service role or admin function)
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