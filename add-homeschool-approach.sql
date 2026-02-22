-- Add homeschool approach field to profiles
-- Run this in the Supabase SQL editor

alter table profiles
  add column if not exists homeschool_approaches text[] default '{}';
