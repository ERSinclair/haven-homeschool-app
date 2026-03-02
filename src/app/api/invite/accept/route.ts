import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  const supabase = supabaseAdmin();
  await supabase
    .from('pending_invites')
    .update({ accepted_at: new Date().toISOString() })
    .eq('token', token);

  return NextResponse.json({ ok: true });
}
