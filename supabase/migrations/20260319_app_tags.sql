CREATE TABLE IF NOT EXISTS app_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  value text NOT NULL,
  label text NOT NULL,
  sort_order integer DEFAULT 0,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(category, value)
);

-- Public read access (no auth required)
ALTER TABLE app_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read active tags" ON app_tags FOR SELECT USING (active = true);

-- Seed data
INSERT INTO app_tags (category, value, label, sort_order) VALUES
  ('homeschool_approach', 'Unschooling', 'Unschooling', 1),
  ('homeschool_approach', 'Eclectic', 'Eclectic', 2),
  ('homeschool_approach', 'Montessori', 'Montessori', 3),
  ('homeschool_approach', 'Waldorf/Steiner', 'Waldorf/Steiner', 4),
  ('homeschool_approach', 'Charlotte Mason', 'Charlotte Mason', 5),
  ('homeschool_approach', 'Relaxed', 'Relaxed', 6),
  ('homeschool_approach', 'Classical', 'Classical', 7),
  ('homeschool_approach', 'Other', 'Other', 99)
ON CONFLICT (category, value) DO NOTHING;
