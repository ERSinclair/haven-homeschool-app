import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Shared logic: pick next prompt and post it to community board
async function postNextPrompt(supabase: ReturnType<typeof supabaseAdmin>) {
  // Get settings
  const { data: settings } = await supabase
    .from('thread_prompt_settings')
    .select('*')
    .eq('id', 1)
    .single();

  if (!settings?.admin_poster_id) {
    return { ok: false, error: 'No admin poster configured. Set one in Admin > Prompts.' };
  }

  // Pick next unused prompt (lowest display_order, no used_at)
  // If all are used, reset and cycle from beginning
  let { data: prompt } = await supabase
    .from('thread_prompts')
    .select('*')
    .is('used_at', null)
    .order('display_order', { ascending: true })
    .limit(1)
    .single();

  if (!prompt) {
    // All used — reset and start again
    await supabase
      .from('thread_prompts')
      .update({ used_at: null })
      .neq('id', '00000000-0000-0000-0000-000000000000'); // update all

    const { data: resetPrompt } = await supabase
      .from('thread_prompts')
      .select('*')
      .order('display_order', { ascending: true })
      .limit(1)
      .single();

    prompt = resetPrompt;
  }

  if (!prompt) {
    return { ok: false, error: 'No prompts found. Add some in Admin > Prompts.' };
  }

  // Post to community board as a Questions post
  const { error: postError } = await supabase
    .from('community_posts')
    .insert({
      author_id: settings.admin_poster_id,
      title: prompt.prompt_text,
      content: 'Weekly community thread — share your thoughts below.',
      tag: 'questions',
    });

  if (postError) {
    return { ok: false, error: postError.message };
  }

  // Mark prompt as used
  await supabase
    .from('thread_prompts')
    .update({ used_at: new Date().toISOString() })
    .eq('id', prompt.id);

  // Update last_posted_at
  await supabase
    .from('thread_prompt_settings')
    .update({ last_posted_at: new Date().toISOString() })
    .eq('id', 1);

  return { ok: true, prompt: prompt.prompt_text };
}

// GET — called by Vercel cron (auto mode only)
export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = supabaseAdmin();

  // Check mode — only proceed if auto
  const { data: settings } = await supabase
    .from('thread_prompt_settings')
    .select('mode')
    .eq('id', 1)
    .single();

  if (settings?.mode !== 'auto') {
    return NextResponse.json({ ok: true, skipped: true, reason: 'Manual mode — cron skipped' });
  }

  const result = await postNextPrompt(supabase);
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

// POST — called from admin "Post Now" button (manual or auto)
export async function POST(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = supabaseAdmin();
  const result = await postNextPrompt(supabase);
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
