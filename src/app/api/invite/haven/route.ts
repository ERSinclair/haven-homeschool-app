import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const supabaseAdmin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BASE_URL = 'https://familyhaven.app';
const FROM = 'Haven <hello@familyhaven.app>';

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get('Authorization')?.replace('Bearer ', '').trim();
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { error: authErr } = await supabaseAdmin().auth.getUser(token);
    if (authErr) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { invitedBy, inviteeEmail } = await req.json();
    if (!invitedBy || !inviteeEmail) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

    const supabase = supabaseAdmin();

    // Check not already a member
    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', inviteeEmail)
      .maybeSingle();
    if (existing) return NextResponse.json({ error: 'exists' }, { status: 409 });

    // Get inviter name
    const { data: inviter } = await supabase
      .from('profiles')
      .select('family_name, display_name')
      .eq('id', invitedBy)
      .maybeSingle();
    const inviterName = inviter?.family_name || inviter?.display_name || 'Someone';

    if (!process.env.RESEND_API_KEY) return NextResponse.json({ ok: true });

    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: FROM,
      to: inviteeEmail,
      subject: `${inviterName} invited you to join Haven`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
          <h2 style="color:#059669;margin-bottom:8px">You're invited to Haven</h2>
          <p style="color:#374151"><strong>${inviterName}</strong> thinks you'd love Haven — a community app for homeschool families to find each other, organise events, and connect locally.</p>
          <a href="${BASE_URL}/signup" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#059669;color:#fff;border-radius:10px;text-decoration:none;font-weight:600">
            Create your free account
          </a>
          <p style="color:#9ca3af;font-size:12px;margin-top:24px">Haven · Find your homeschool community · <a href="${BASE_URL}" style="color:#9ca3af">familyhaven.app</a></p>
        </div>
      `,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Haven invite error:', err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
