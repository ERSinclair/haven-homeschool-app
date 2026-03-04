-- Add date of birth and birthday visibility to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS dob DATE,
  ADD COLUMN IF NOT EXISTS show_birthday BOOLEAN NOT NULL DEFAULT false;
