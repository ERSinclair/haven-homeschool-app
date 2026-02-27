-- Add 'playgroup' as a valid user_type in the profiles check constraint
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_user_type_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_user_type_check 
  CHECK (user_type IN ('family', 'teacher', 'business', 'playgroup'));
