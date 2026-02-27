-- Search insights table
-- Tracks what users type into "other" filter boxes on Discover
-- Used in admin/stats to surface what categories are missing from the filter options

create table if not exists public.search_insights (
  id uuid default gen_random_uuid() primary key,
  context text not null,           -- e.g. 'family-other', 'teacher-type-other'
  term text not null,
  count integer default 1,
  last_seen_at timestamptz default now(),
  unique(context, term)
);

alter table public.search_insights enable row level security;

-- Admins can read all insights
create policy "Admins can read insights"
  on public.search_insights for select using (true);

-- Authenticated users can write insights (discover page logs searches)
create policy "App can write insights"
  on public.search_insights for all using (auth.role() = 'authenticated');
