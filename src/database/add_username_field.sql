-- Add username field to profiles table
-- Run this in your Supabase SQL Editor

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS username VARCHAR(50) UNIQUE;

-- Add constraint to ensure usernames are unique and not null
ALTER TABLE profiles 
ADD CONSTRAINT profiles_username_unique UNIQUE (username);

-- Add comment for clarity
COMMENT ON COLUMN profiles.username IS 'Unique username for the user (no duplicates)';

-- Create index for faster username lookups
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);