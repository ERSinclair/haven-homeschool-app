import { NextRequest, NextResponse } from 'next/server';
import {
  sendConnectionRequestEmail,
  sendRsvpEmail,
  sendCircleInviteEmail,
  sendWelcomeEmail,
} from '@/lib/email';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, ...data } = body;

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
    console.error('Email send error:', err);
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
  }
}
