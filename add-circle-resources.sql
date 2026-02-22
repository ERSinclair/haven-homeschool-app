-- Circle resources (pinboard) table
-- Run this in the Supabase SQL editor

create table if not exists circle_resources (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references circles(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  title text not null,
  url text,
  description text,
  created_at timestamptz not null default now()
);

create index if not exists circle_resources_circle_id_idx on circle_resources(circle_id);

alter table circle_resources enable row level security;

-- Circle members can view resources
create policy "Members can view circle resources"
  on circle_resources for select
  using (
    exists (
      select 1 from circle_members
      where circle_members.circle_id = circle_resources.circle_id
        and circle_members.member_id = auth.uid()
        and circle_members.is_active = true
    )
  );

-- Circle members can add resources
create policy "Members can add circle resources"
  on circle_resources for insert
  with check (
    auth.uid() = created_by and
    exists (
      select 1 from circle_members
      where circle_members.circle_id = circle_resources.circle_id
        and circle_members.member_id = auth.uid()
        and circle_members.is_active = true
    )
  );

-- Owners and admins can delete resources
create policy "Owners and admins can delete circle resources"
  on circle_resources for delete
  using (
    auth.uid() = created_by or
    exists (
      select 1 from circle_members
      where circle_members.circle_id = circle_resources.circle_id
        and circle_members.member_id = auth.uid()
        and circle_members.role = 'admin'
        and circle_members.is_active = true
    )
  );
