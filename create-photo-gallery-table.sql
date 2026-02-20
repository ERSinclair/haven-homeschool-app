-- Create profile_photos table for photo gallery functionality
CREATE TABLE IF NOT EXISTS profile_photos (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  thumbnail_url TEXT,
  file_name TEXT NOT NULL,
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster queries by user
CREATE INDEX IF NOT EXISTS profile_photos_user_id_idx ON profile_photos(user_id);
CREATE INDEX IF NOT EXISTS profile_photos_uploaded_at_idx ON profile_photos(uploaded_at DESC);

-- Enable RLS (Row Level Security)
ALTER TABLE profile_photos ENABLE ROW LEVEL SECURITY;

-- Create policies for profile_photos
CREATE POLICY "Users can view their own photos" ON profile_photos
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own photos" ON profile_photos
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own photos" ON profile_photos
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own photos" ON profile_photos
  FOR DELETE USING (user_id = auth.uid());

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_profile_photos_updated_at 
  BEFORE UPDATE ON profile_photos 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();