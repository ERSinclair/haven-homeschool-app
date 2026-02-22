-- Push notification subscriptions table
-- Run this in the Supabase SQL editor

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  subscription jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

-- Index for fast lookups by user
create index if not exists push_subscriptions_user_id_idx on push_subscriptions(user_id);

-- RLS
alter table push_subscriptions enable row level security;

-- Users can manage their own subscriptions
create policy "Users can insert own push subscriptions"
  on push_subscriptions for insert
  with check (auth.uid() = user_id);

create policy "Users can update own push subscriptions"
  on push_subscriptions for update
  using (auth.uid() = user_id);

create policy "Users can delete own push subscriptions"
  on push_subscriptions for delete
  using (auth.uid() = user_id);

-- Authenticated users can read subscriptions (needed to send pushes to others)
create policy "Authenticated users can read push subscriptions"
  on push_subscriptions for select
  using (auth.role() = 'authenticated');
