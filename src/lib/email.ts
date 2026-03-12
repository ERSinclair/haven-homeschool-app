import { Resend } from 'resend';

const getResend = () => new Resend(process.env.RESEND_API_KEY ?? 'placeholder');
const FROM = 'Haven <hello@familyhaven.app>';
const BASE_URL = 'https://familyhaven.app';

export async function sendConnectionRequestEmail(to: string, fromName: string) {
  if (!process.env.RESEND_API_KEY) return;
  await getResend().emails.send({
    from: FROM,
    to,
    subject: `${fromName} wants to connect on Haven`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#059669;margin-bottom:8px">New connection request</h2>
        <p style="color:#374151"><strong>${fromName}</strong> wants to connect with your family on Haven.</p>
        <a href="${BASE_URL}/connections" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#059669;color:#fff;border-radius:10px;text-decoration:none;font-weight:600">
          View request
        </a>
        <p style="color:#9ca3af;font-size:12px;margin-top:24px">Haven · Find your community · <a href="${BASE_URL}" style="color:#9ca3af">familyhaven.app</a></p>
      </div>
    `,
  });
}

export async function sendRsvpEmail(to: string, eventTitle: string, eventDate: string, attendeeName: string) {
  if (!process.env.RESEND_API_KEY) return;
  await getResend().emails.send({
    from: FROM,
    to,
    subject: `${attendeeName} is going to "${eventTitle}"`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#059669;margin-bottom:8px">New RSVP</h2>
        <p style="color:#374151"><strong>${attendeeName}</strong> has RSVP'd to your event <strong>${eventTitle}</strong> on ${eventDate}.</p>
        <a href="${BASE_URL}/events" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#059669;color:#fff;border-radius:10px;text-decoration:none;font-weight:600">
          View event
        </a>
        <p style="color:#9ca3af;font-size:12px;margin-top:24px">Haven · Find your community · <a href="${BASE_URL}" style="color:#9ca3af">familyhaven.app</a></p>
      </div>
    `,
  });
}

export async function sendCircleInviteEmail(to: string, fromName: string, circleName: string, circleId: string) {
  if (!process.env.RESEND_API_KEY) return;
  await getResend().emails.send({
    from: FROM,
    to,
    subject: `${fromName} invited you to join "${circleName}" on Haven`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#059669;margin-bottom:8px">Circle invitation</h2>
        <p style="color:#374151"><strong>${fromName}</strong> has invited you to join the circle <strong>${circleName}</strong> on Haven.</p>
        <a href="${BASE_URL}/circles/invitations" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#059669;color:#fff;border-radius:10px;text-decoration:none;font-weight:600">
          View invitation
        </a>
        <p style="color:#9ca3af;font-size:12px;margin-top:24px">Haven · Find your community · <a href="${BASE_URL}" style="color:#9ca3af">familyhaven.app</a></p>
      </div>
    `,
  });
}

export async function sendWelcomeEmail(to: string, name: string) {
  if (!process.env.RESEND_API_KEY) return;
  await getResend().emails.send({
    from: FROM,
    to,
    subject: `Welcome to Haven, ${name}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#059669;margin-bottom:8px">Welcome to Haven</h2>
        <p style="color:#374151">Hi ${name}, your account is ready. Start by completing your profile so other local families can find you.</p>
        <a href="${BASE_URL}/onboarding" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#059669;color:#fff;border-radius:10px;text-decoration:none;font-weight:600">
          Set up my profile
        </a>
        <p style="color:#9ca3af;font-size:12px;margin-top:24px">Haven · Find your community · <a href="${BASE_URL}" style="color:#9ca3af">familyhaven.app</a></p>
      </div>
    `,
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
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#059669;margin-bottom:8px">You've been invited!</h2>
        <p style="color:#374151"><strong>${fromName}</strong> has invited you to join the ${typeLabel} <strong>${targetName}</strong> on Haven — a community app for families.</p>
        <a href="${joinUrl}" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#059669;color:#fff;border-radius:10px;text-decoration:none;font-weight:600">
          Create account to join
        </a>
        <p style="color:#6b7280;font-size:13px;margin-top:16px">This invite link expires in 7 days.</p>
        <p style="color:#9ca3af;font-size:12px;margin-top:24px">Haven · Find your community · <a href="${BASE_URL}" style="color:#9ca3af">familyhaven.app</a></p>
      </div>
    `,
  });
}
