import { Resend } from 'resend';

const getResend = () => new Resend(process.env.RESEND_API_KEY ?? 'placeholder');
const FROM = 'Haven <cane@familyhaven.app>';
const BASE_URL = 'https://familyhaven.app';

// ---------------------------------------------------------------------------
// Shared template
// ---------------------------------------------------------------------------
function layout(body: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Haven</title>
</head>
<body style="margin:0;padding:0;background:#f0fdf4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">

          <!-- Header -->
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <a href="${BASE_URL}" style="text-decoration:none;">
                <span style="font-size:28px;font-weight:800;color:#059669;letter-spacing:-0.5px;">Haven</span>
              </a>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:#ffffff;border-radius:16px;padding:32px;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
              ${body}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top:24px;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                Haven &middot; Find your community &middot;
                <a href="${BASE_URL}/settings" style="color:#9ca3af;text-decoration:underline;">Manage preferences</a>
                &middot;
                <a href="${BASE_URL}" style="color:#9ca3af;text-decoration:underline;">familyhaven.app</a>
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

function button(text: string, href: string) {
  return `<a href="${href}" style="display:inline-block;margin-top:24px;padding:13px 28px;background:#059669;color:#ffffff;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px;">${text}</a>`;
}

function heading(text: string) {
  return `<h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#111827;">${text}</h1>`;
}

function body(text: string) {
  return `<p style="margin:0;font-size:15px;line-height:1.6;color:#374151;">${text}</p>`;
}

function divider() {
  return `<hr style="border:none;border-top:1px solid #f3f4f6;margin:24px 0;" />`;
}

// ---------------------------------------------------------------------------
// Emails
// ---------------------------------------------------------------------------

export async function sendWelcomeEmail(to: string, name: string) {
  if (!process.env.RESEND_API_KEY) return;
  await getResend().emails.send({
    from: FROM,
    to,
    subject: `Welcome to Haven, ${name}`,
    html: layout(`
      ${heading(`Welcome, ${name}`)}
      ${body(`You're now part of Haven — a place for homeschool families to find each other, share resources, and build local community.`)}
      ${divider()}
      ${body(`Start by exploring families near you, or complete your profile so others can find you.`)}
      ${button('Go to Haven', `${BASE_URL}/discover`)}
    `),
  });
}

export async function sendConnectionRequestEmail(to: string, fromName: string) {
  if (!process.env.RESEND_API_KEY) return;
  await getResend().emails.send({
    from: FROM,
    to,
    subject: `${fromName} wants to connect on Haven`,
    html: layout(`
      ${heading('New connection request')}
      ${body(`<strong>${fromName}</strong> wants to connect with your family on Haven.`)}
      ${button('View request', `${BASE_URL}/connections`)}
    `),
  });
}

export async function sendRsvpEmail(to: string, eventTitle: string, eventDate: string, attendeeName: string) {
  if (!process.env.RESEND_API_KEY) return;
  await getResend().emails.send({
    from: FROM,
    to,
    subject: `${attendeeName} is going to "${eventTitle}"`,
    html: layout(`
      ${heading('New RSVP')}
      ${body(`<strong>${attendeeName}</strong> has RSVP'd to your event <strong>${eventTitle}</strong> on ${eventDate}.`)}
      ${button('View event', `${BASE_URL}/events`)}
    `),
  });
}

export async function sendCircleInviteEmail(to: string, fromName: string, circleName: string, circleId: string) {
  if (!process.env.RESEND_API_KEY) return;
  await getResend().emails.send({
    from: FROM,
    to,
    subject: `${fromName} invited you to join "${circleName}"`,
    html: layout(`
      ${heading('Circle invitation')}
      ${body(`<strong>${fromName}</strong> has invited you to join the circle <strong>${circleName}</strong> on Haven.`)}
      ${button('View invitation', `${BASE_URL}/circles/invitations`)}
    `),
  });
}

export async function sendExternalInviteEmail(
  to: string,
  fromName: string,
  type: 'event' | 'circle',
  targetName: string,
  token: string
) {
  if (!process.env.RESEND_API_KEY) return;
  const typeLabel = type === 'event' ? 'event' : 'circle';
  const joinUrl = `${BASE_URL}/invite/${token}`;
  await getResend().emails.send({
    from: FROM,
    to,
    subject: `${fromName} invited you to "${targetName}" on Haven`,
    html: layout(`
      ${heading(`You've been invited`)}
      ${body(`<strong>${fromName}</strong> has invited you to join the ${typeLabel} <strong>${targetName}</strong> on Haven — a community app for homeschool families.`)}
      ${divider()}
      <p style="margin:0;font-size:13px;color:#6b7280;">This invite link expires in 7 days.</p>
      ${button('Create account to join', joinUrl)}
    `),
  });
}
