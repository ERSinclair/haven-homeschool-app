import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function POST(req: NextRequest) {
  try {
    webpush.setVapidDetails(
      process.env.VAPID_EMAIL!,
      process.env.VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!
    );
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { recipientId, title, body, url = '/notifications' } = await req.json();
    if (!recipientId || !title) {
      return NextResponse.json({ error: 'Missing recipientId or title' }, { status: 400 });
    }

    // Fetch all push subscriptions for the recipient
    const subsRes = await fetch(
      `${supabaseUrl}/rest/v1/push_subscriptions?user_id=eq.${recipientId}&select=subscription`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': authHeader,
        },
      }
    );

    if (!subsRes.ok) {
      return NextResponse.json({ sent: 0 });
    }

    const rows = await subsRes.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ sent: 0 });
    }

    const payload = JSON.stringify({ title, body, url });
    let sent = 0;

    await Promise.all(
      rows.map(async (row) => {
        try {
          const sub = typeof row.subscription === 'string'
            ? JSON.parse(row.subscription)
            : row.subscription;
          await webpush.sendNotification(sub, payload);
          sent++;
        } catch (err: any) {
          // Subscription expired / invalid — could clean it up here
          if (err.statusCode === 410 || err.statusCode === 404) {
            // Stale subscription — silently ignore
          }
        }
      })
    );

    return NextResponse.json({ sent });
  } catch (err) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
