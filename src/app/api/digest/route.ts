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

  // Fetch all profiles (including those without email in profiles table)
  const { data: allProfiles } = await supabase
    .from('profiles')
    .select('id, email, family_name, display_name, notification_prefs');

  // For profiles missing email, backfill from auth.users
  let users = allProfiles ?? [];
  const missingEmail = users.filter(u => !u.email).map(u => u.id);
  if (missingEmail.length > 0) {
    const { data: authList } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    if (authList?.users) {
      const authEmailMap: Record<string, string> = {};
      for (const au of authList.users) { if (au.email) authEmailMap[au.id] = au.email; }
      users = users.map(u => (!u.email && authEmailMap[u.id]) ? { ...u, email: authEmailMap[u.id] } : u);
    }
  }
  users = users.filter(u => u.email);

  if (!users?.length) return NextResponse.json({ ok: true, sent: 0 });

  const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
  let sent = 0;

  for (const user of users) {
    const prefs = user.notification_prefs ?? {};
    if (prefs.email_digest === false) continue;

    const { data: notifs } = await supabase
      .from('notifications')
      .select('id, type, title, body, created_at')
      .eq('user_id', user.id)
      .is('digested_at', null)
      .order('created_at', { ascending: false });

    if (!notifs?.length) continue;

    const groups: Record<string, number> = {};
    for (const n of notifs) {
      const key = typeLabel(n.type);
      groups[key] = (groups[key] ?? 0) + 1;
    }

    const summaryLines = Object.entries(groups)
      .map(([label, count]) => `<li style="margin:4px 0;color:#374151">${count} ${label}</li>`)
      .join('');

    const name = user.family_name || user.display_name || 'there';

    if (resend) {
      const result = await resend.emails.send({
        from: FROM,
        to: user.email,
        subject: `Your Haven update`,
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
            <h2 style="color:#059669;margin-bottom:8px">Here's what's new, ${name}</h2>
            <ul style="padding-left:20px;margin:12px 0">
              ${summaryLines}
            </ul>
            <a href="${BASE_URL}/notifications" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#059669;color:#fff;border-radius:10px;text-decoration:none;font-weight:600">
              View all
            </a>
            <p style="color:#9ca3af;font-size:11px;margin-top:24px">
              You're receiving this daily summary because you have digest emails enabled.
              <a href="${BASE_URL}/settings" style="color:#9ca3af">Manage preferences</a>
            </p>
          </div>
        `,
      });
      if (result.error) {
        console.error(`[digest] Failed to send to ${user.email}:`, result.error);
        continue;
      }
    } else {
      console.warn('[digest] RESEND_API_KEY not set — skipping email send');
    }

    await supabase
      .from('notifications')
      .update({ digested_at: new Date().toISOString() })
      .in('id', notifs.map((n: any) => n.id));

    await supabase
      .from('profiles')
      .update({ last_digest_sent_at: new Date().toISOString() })
      .eq('id', user.id);

    sent++;
  }

  return NextResponse.json({ ok: true, sent });
}

function typeLabel(type: string): string {
  if (type?.includes('message')) return 'new messages';
  if (type?.includes('connection')) return 'connection requests';
  if (type?.includes('event')) return 'event updates';
  if (type?.includes('circle')) return 'circle invitations';
  if (type?.includes('rsvp')) return 'new RSVPs';
  return 'notifications';
}
