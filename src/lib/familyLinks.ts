import { getStoredSession } from './session';
import { createNotification } from './notifications';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const RELATIONSHIPS = [
  { value: 'partner',      label: 'Partner' },
  { value: 'co_parent',    label: 'Co-parent' },
  { value: 'grandparent',  label: 'Grandparent' },
  { value: 'aunt_uncle',   label: 'Aunt / Uncle' },
  { value: 'sibling',      label: 'Sibling' },
  { value: 'close_friend', label: 'Close Friend' },
  { value: 'other',        label: 'Other' },
] as const;

export type RelationshipValue = typeof RELATIONSHIPS[number]['value'];

export async function sendFamilyLinkRequest(
  receiverId: string,
  relationship: RelationshipValue,
  senderName: string,
  customLabel?: string,
): Promise<{ ok: boolean; alreadyExists?: boolean }> {
  const session = getStoredSession();
  if (!session?.user) return { ok: false };

  const h = {
    'apikey': supabaseKey!,
    'Authorization': `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal',
  };

  // Check for existing link (either direction)
  const checkRes = await fetch(
    `${supabaseUrl}/rest/v1/family_links?or=(and(requester_id.eq.${session.user.id},receiver_id.eq.${receiverId}),and(requester_id.eq.${receiverId},receiver_id.eq.${session.user.id}))&select=id,status&limit=1`,
    { headers: { 'apikey': supabaseKey!, 'Authorization': `Bearer ${session.access_token}` } }
  );
  if (checkRes.ok) {
    const existing = await checkRes.json();
    if (existing?.length > 0) return { ok: false, alreadyExists: true };
  }

  const res = await fetch(`${supabaseUrl}/rest/v1/family_links`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({
      requester_id: session.user.id,
      receiver_id: receiverId,
      relationship,
      relationship_label: customLabel || null,
      status: 'pending',
    }),
  });

  if (!res.ok) return { ok: false };

  // Notify the receiver
  createNotification({
    userId: receiverId,
    actorId: session.user.id,
    type: 'family_link_request',
    title: `${senderName} wants to link as family`,
    body: 'Tap to accept or decline',
    link: '/family',
    referenceId: session.user.id,
    accessToken: session.access_token,
  });

  return { ok: true };
}

export async function getFamilyLinks(userId: string, accessToken: string) {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/family_links?or=(requester_id.eq.${userId},receiver_id.eq.${userId})&status=eq.accepted&select=*`,
    { headers: { 'apikey': supabaseKey!, 'Authorization': `Bearer ${accessToken}` } }
  );
  return res.ok ? (await res.json()) : [];
}
