-- Thread prompts: weekly auto-posted community questions
create table if not exists thread_prompts (
  id uuid primary key default gen_random_uuid(),
  prompt_text text not null,
  display_order int default 0,
  used_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists thread_prompt_settings (
  id int primary key default 1,
  mode text not null default 'manual', -- 'auto' | 'manual'
  admin_poster_id uuid references profiles(id) on delete set null,
  last_posted_at timestamptz,
  constraint thread_prompt_settings_singleton check (id = 1)
);

insert into thread_prompt_settings (id, mode) values (1, 'manual') on conflict do nothing;

-- RLS (service role key bypasses, anon reads blocked)
alter table thread_prompts enable row level security;
alter table thread_prompt_settings enable row level security;

create policy "Service role only" on thread_prompts using (false);
create policy "Service role only" on thread_prompt_settings using (false);

-- Seed with some starter prompts
insert into thread_prompts (prompt_text, display_order) values
  ('What are you studying this week?', 1),
  ('Best resource you''ve discovered lately — book, website, curriculum, anything?', 2),
  ('What''s your biggest homeschool challenge right now?', 3),
  ('Share a win from this week, big or small.', 4),
  ('What does a typical day look like in your home?', 5),
  ('Any field trips or outings coming up?', 6),
  ('What subject does your child surprise you with the most?', 7),
  ('What''s one thing you wish you knew before starting homeschool?', 8);
