import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  const supabase = supabaseAdmin();
  const { data: invite } = await supabase
    .from('pending_invites')
    .select('type, target_id, target_name, invited_by, expires_at, accepted_at')
    .eq('token', token)
    .maybeSingle();

  if (!invite) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (invite.accepted_at) return NextResponse.json({ error: 'Already used' }, { status: 410 });
  if (new Date(invite.expires_at) < new Date()) return NextResponse.json({ error: 'Expired' }, { status: 410 });

  const { data: inviter } = await supabase
    .from('profiles')
    .select('family_name, display_name')
    .eq('id', invite.invited_by)
    .maybeSingle();

  const inviterName = inviter?.family_name || inviter?.display_name || 'Someone';

  return NextResponse.json({ invite, inviterName });
}
