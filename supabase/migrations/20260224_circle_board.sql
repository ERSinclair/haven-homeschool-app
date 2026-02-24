-- Add circle_id to community_posts so posts can be scoped to a circle
ALTER TABLE community_posts
  ADD COLUMN IF NOT EXISTS circle_id UUID REFERENCES circles(id) ON DELETE CASCADE;

-- Index for fast circle board queries
CREATE INDEX IF NOT EXISTS community_posts_circle_id_idx ON community_posts(circle_id);

-- Circle board posts visible to circle members only
-- (global board posts have circle_id = NULL and remain publicly readable)
CREATE POLICY "Circle members can view circle posts"
  ON community_posts FOR SELECT
  USING (
    circle_id IS NULL
    OR EXISTS (
      SELECT 1 FROM circle_members
      WHERE circle_members.circle_id = community_posts.circle_id
      AND circle_members.member_id = auth.uid()
    )
  );

CREATE POLICY "Circle members can post to circle board"
  ON community_posts FOR INSERT
  WITH CHECK (
    circle_id IS NULL
    OR EXISTS (
      SELECT 1 FROM circle_members
      WHERE circle_members.circle_id = community_posts.circle_id
      AND circle_members.member_id = auth.uid()
    )
  );

CREATE POLICY "Authors can delete own posts"
  ON community_posts FOR DELETE
  USING (author_id = auth.uid());
