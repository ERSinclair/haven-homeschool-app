import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  sendConnectionRequestEmail,
  sendRsvpEmail,
  sendCircleInviteEmail,
  sendWelcomeEmail,
} from '@/lib/email';

const supabaseAdmin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

export async function POST(req: NextRequest) {
  try {
    // Require a valid Supabase JWT — prevents unauthenticated email abuse
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '').trim();

    // Welcome emails are sent server-side during signup (no user session yet).
    // They include a one-time key to prevent abuse.
    const body = await req.json();
    const { type, ...data } = body;

    // All email types require a valid Supabase JWT
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { error: authError } = await supabaseAdmin().auth.getUser(token);
    if (authError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    switch (type) {
      case 'connection_request':
        await sendConnectionRequestEmail(data.to, data.fromName);
        break;
      case 'rsvp':
        await sendRsvpEmail(data.to, data.eventTitle, data.eventDate, data.attendeeName);
        break;
      case 'circle_invite':
        await sendCircleInviteEmail(data.to, data.fromName, data.circleName, data.circleId);
        break;
      case 'welcome':
        await sendWelcomeEmail(data.to, data.name);
        break;
      default:
        return NextResponse.json({ error: 'Unknown email type' }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[email route]', err);
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
  }
}
