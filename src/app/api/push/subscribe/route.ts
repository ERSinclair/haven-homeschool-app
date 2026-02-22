import { NextRequest, NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { subscription, userId } = await req.json();
    if (!subscription || !userId) {
      return NextResponse.json({ error: 'Missing subscription or userId' }, { status: 400 });
    }

    // Upsert subscription — keyed on (user_id, endpoint) so we don't duplicate
    const res = await fetch(
      `${supabaseUrl}/rest/v1/push_subscriptions?user_id=eq.${userId}&endpoint=eq.${encodeURIComponent(subscription.endpoint)}`,
      {
        method: 'GET',
        headers: {
          'apikey': supabaseKey,
          'Authorization': authHeader,
        },
      }
    );
    const existing = await res.json();

    if (Array.isArray(existing) && existing.length > 0) {
      // Update existing
      await fetch(
        `${supabaseUrl}/rest/v1/push_subscriptions?user_id=eq.${userId}&endpoint=eq.${encodeURIComponent(subscription.endpoint)}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': supabaseKey,
            'Authorization': authHeader,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({ subscription: JSON.stringify(subscription), updated_at: new Date().toISOString() }),
        }
      );
    } else {
      // Insert new
      await fetch(`${supabaseUrl}/rest/v1/push_subscriptions`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': authHeader,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          user_id: userId,
          endpoint: subscription.endpoint,
          subscription: JSON.stringify(subscription),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { userId, endpoint } = await req.json();
    if (!userId || !endpoint) return NextResponse.json({ error: 'Missing params' }, { status: 400 });

    await fetch(
      `${supabaseUrl}/rest/v1/push_subscriptions?user_id=eq.${userId}&endpoint=eq.${encodeURIComponent(endpoint)}`,
      {
        method: 'DELETE',
        headers: { 'apikey': supabaseKey, 'Authorization': authHeader },
      }
    );

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
