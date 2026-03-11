-- Add relationship_label to sub_profiles for 'other' type descriptions
alter table sub_profiles
  add column if not exists relationship_label text;
