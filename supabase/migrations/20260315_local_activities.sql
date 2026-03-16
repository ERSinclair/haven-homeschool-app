-- Local Activities table
create table if not exists local_activities (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  description text,
  activity_date date,
  location_name text,
  location_lat double precision,
  location_lng double precision,
  image_url text,
  external_link text,
  created_at timestamptz default now() not null
);

-- RLS
alter table local_activities enable row level security;

-- Anyone logged in can read
create policy "local_activities_select" on local_activities
  for select using (auth.role() = 'authenticated');

-- Author can insert
create policy "local_activities_insert" on local_activities
  for insert with check (auth.uid() = author_id);

-- Author can delete their own
create policy "local_activities_delete" on local_activities
  for delete using (auth.uid() = author_id);
