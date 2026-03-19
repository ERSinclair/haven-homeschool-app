import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const BASE_URL = 'https://familyhaven.app';
const FROM = 'Haven <cane@familyhaven.app>';

function digestLayout(name: string, summaryLines: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your Haven update</title>
</head>
<body style="margin:0;padding:0;background:#f0fdf4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <a href="${BASE_URL}" style="text-decoration:none;">
                <span style="font-size:28px;font-weight:800;color:#059669;letter-spacing:-0.5px;">Haven</span>
              </a>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;border-radius:16px;padding:32px;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
              <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">Here's what's new, ${name}</h1>
              <p style="margin:0 0 20px;font-size:14px;color:#6b7280;">Your Haven activity summary</p>
              <hr style="border:none;border-top:1px solid #f3f4f6;margin:0 0 20px;" />
              <ul style="margin:0;padding-left:20px;">
                ${summaryLines}
              </ul>
              <a href="${BASE_URL}/notifications" style="display:inline-block;margin-top:24px;padding:13px 28px;background:#059669;color:#ffffff;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px;">View all activity</a>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-top:24px;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                You're receiving this because you have digest emails enabled &middot;
                <a href="${BASE_URL}/settings" style="color:#9ca3af;text-decoration:underline;">Manage preferences</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

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
        html: digestLayout(name, summaryLines),
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
