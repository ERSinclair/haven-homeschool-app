import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendExternalInviteEmail, sendCircleInviteEmail } from '@/lib/email';

const supabaseAdmin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { invitedBy, inviteeEmail, type, targetId, targetName } = await req.json();

    if (!invitedBy || !inviteeEmail || !type || !targetId || !targetName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = supabaseAdmin();

    // Get inviter profile
    const { data: inviter } = await supabase
      .from('profiles')
      .select('family_name, display_name')
      .eq('id', invitedBy)
      .maybeSingle();
    const inviterName = inviter?.family_name || inviter?.display_name || 'Someone';

    // Check if user already has a Haven account
    const { data: existing } = await supabase
      .from('profiles')
      .select('id, email')
      .eq('email', inviteeEmail)
      .maybeSingle();

    if (existing) {
      if (type === 'circle') {
        // Already a member?
        const { data: member } = await supabase
          .from('circle_members')
          .select('id')
          .eq('circle_id', targetId)
          .eq('member_id', existing.id)
          .maybeSingle();
        if (member) return NextResponse.json({ error: 'already_member' }, { status: 409 });

        await supabase.from('circle_invitations').insert({
          circle_id: targetId,
          inviter_id: invitedBy,
          invitee_id: existing.id,
          status: 'pending',
        });
        await sendCircleInviteEmail(inviteeEmail, inviterName, targetName, targetId);

      } else if (type === 'event') {
        // Already RSVPd?
        const { data: rsvp } = await supabase
          .from('event_rsvps')
          .select('id')
          .eq('event_id', targetId)
          .eq('user_id', existing.id)
          .maybeSingle();
        if (rsvp) return NextResponse.json({ error: 'already_attending' }, { status: 409 });

        await supabase.from('event_invitations').insert({
          event_id: targetId,
          inviter_id: invitedBy,
          invitee_id: existing.id,
          status: 'pending',
        });
      }
      return NextResponse.json({ ok: true, inApp: true });
    }

    // External user — create pending invite + send email
    const { data: invite, error } = await supabase
      .from('pending_invites')
      .insert({ invited_by: invitedBy, invitee_email: inviteeEmail, type, target_id: targetId, target_name: targetName })
      .select('token')
      .single();

    if (error) throw error;

    await sendExternalInviteEmail(inviteeEmail, inviterName, type, targetName, invite.token);

    return NextResponse.json({ ok: true, inApp: false });
  } catch (err) {
    console.error('Invite error:', err);
    return NextResponse.json({ error: 'Failed to send invite' }, { status: 500 });
  }
}
