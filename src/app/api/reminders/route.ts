import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const BASE_URL = 'https://familyhaven.app';
const FROM = 'Haven <hello@familyhaven.app>';

const supabaseAdmin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = supabaseAdmin();
  const now = new Date();
  const windowEnd = new Date(now.getTime() + 15 * 60 * 1000); // next 15 min

  // Find unfired reminders due in this window
  const { data: reminders } = await supabase
    .from('reminders')
    .select('*, profiles(email, family_name, display_name, push_subscriptions(endpoint, p256dh, auth))')
    .is('fired_at', null)
    .lte('remind_at', windowEnd.toISOString())
    .lte('remind_at', now.toISOString()); // only past-due or now

  if (!reminders?.length) return NextResponse.json({ ok: true, fired: 0 });

  const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
  let fired = 0;

  for (const reminder of reminders) {
    const profile = (reminder as any).profiles;
    const delivery: string[] = reminder.delivery || ['push', 'notification'];
    const title = `Reminder: ${reminder.target_title}`;
    const body = `You have an upcoming item on your calendar.`;

    // In-app notification
    if (delivery.includes('notification')) {
      await supabase.from('notifications').insert({
        user_id: reminder.user_id,
        actor_id: reminder.user_id,
        type: 'reminder',
        title,
        body,
        link: '/calendar',
        read: false,
      });
    }

    // Email
    if (delivery.includes('email') && profile?.email && resend) {
      await resend.emails.send({
        from: FROM,
        to: profile.email,
        subject: title,
        html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
          <h2 style="color:#059669">${title}</h2>
          <p style="color:#374151">${body}</p>
          <a href="${BASE_URL}/calendar" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#059669;color:#fff;border-radius:10px;text-decoration:none;font-weight:600">View calendar</a>
        </div>`,
      }).catch(() => {});
    }

    // Mark fired
    await supabase.from('reminders').update({ fired_at: now.toISOString() }).eq('id', reminder.id);
    fired++;
  }

  return NextResponse.json({ ok: true, fired });
}
