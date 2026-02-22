-- Community board posts table
-- Run this in the Supabase SQL editor

create table if not exists community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  content text not null,
  tag text not null default 'general',  -- general | curriculum | local | events | question
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists community_posts_author_id_idx on community_posts(author_id);
create index if not exists community_posts_created_at_idx on community_posts(created_at desc);

alter table community_posts enable row level security;

-- Anyone authenticated can read posts
create policy "Authenticated users can read community posts"
  on community_posts for select
  using (auth.uid() is not null);

-- Authenticated users can create posts
create policy "Authenticated users can create community posts"
  on community_posts for insert
  with check (auth.uid() = author_id);

-- Authors can update their own posts
create policy "Authors can update own posts"
  on community_posts for update
  using (auth.uid() = author_id);

-- Authors can delete their own posts
create policy "Authors can delete own posts"
  on community_posts for delete
  using (auth.uid() = author_id);
