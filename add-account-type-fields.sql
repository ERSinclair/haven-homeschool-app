-- Account type-specific profile fields
-- Run this in the Supabase SQL editor

-- Teacher fields
alter table profiles add column if not exists subjects text[] default null;
alter table profiles add column if not exists age_groups_taught text[] default null;

-- Business fields
alter table profiles add column if not exists services text default null;
alter table profiles add column if not exists contact_info text default null;
