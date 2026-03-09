import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function DELETE(request: Request) {
  // Verify the caller's JWT
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const token = auth.slice(7);
  const admin = supabaseAdmin();

  const { data: { user }, error: authError } = await admin.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  const userId = user.id;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  // Helper: silently DELETE rows (uses service role to bypass RLS)
  const del = async (path: string) => {
    try {
      await fetch(`${supabaseUrl}/rest/v1/${path}`, {
        method: 'DELETE',
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      });
    } catch { /* best-effort */ }
  };

  try {
    // Clean up all user data in dependency order
    await del(`blocked_users?or=(blocker_id.eq.${userId},blocked_id.eq.${userId})`);
    await del(`reports?or=(reporter_id.eq.${userId},reported_id.eq.${userId})`);
    await del(`push_subscriptions?user_id=eq.${userId}`);
    await del(`message_reactions?user_id=eq.${userId}`);
    await del(`circle_messages?sender_id=eq.${userId}`);
    await del(`event_messages?sender_id=eq.${userId}`);
    await del(`circle_members?member_id=eq.${userId}`);
    await del(`circle_invitations?or=(inviter_id.eq.${userId},invitee_id.eq.${userId})`);
    await del(`event_invitations?or=(inviter_id.eq.${userId},invitee_id.eq.${userId})`);
    await del(`event_rsvps?profile_id=eq.${userId}`);
    await del(`events?host_id=eq.${userId}`);
    await del(`community_posts?author_id=eq.${userId}`);
    await del(`calendar_notes?profile_id=eq.${userId}`);
    await del(`messages?sender_id=eq.${userId}`);
    await del(`conversations?or=(participant_1.eq.${userId},participant_2.eq.${userId})`);
    await del(`connections?or=(requester_id.eq.${userId},receiver_id.eq.${userId})`);
    await del(`notifications?user_id=eq.${userId}`);
    await del(`search_insights?user_id=eq.${userId}`);
    await del(`waitlist?or=(profile_id.eq.${userId})`);

    // Delete profile photo from storage
    try {
      const { data: profile } = await admin
        .from('profiles')
        .select('avatar_url')
        .eq('id', userId)
        .single();
      if (profile?.avatar_url) {
        const parts = profile.avatar_url.split('/');
        const path = parts.slice(-2).join('/');
        await admin.storage.from('profile-photos').remove([path]);
      }
    } catch { /* ignore storage errors */ }

    // Delete profile row
    await del(`profiles?id=eq.${userId}`);

    // Delete the auth user — this is the critical step that the client-side can't do
    const { error: deleteAuthError } = await admin.auth.admin.deleteUser(userId);
    if (deleteAuthError) {
      console.error('Failed to delete auth user:', deleteAuthError);
      // Profile is already gone — auth user is now orphaned and can't do anything useful, but log it
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Account deletion error:', err);
    return NextResponse.json({ error: 'Deletion failed' }, { status: 500 });
  }
}
