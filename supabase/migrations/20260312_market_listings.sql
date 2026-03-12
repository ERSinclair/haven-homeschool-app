-- Market listings for Haven Exchange
CREATE TABLE IF NOT EXISTS market_listings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title         text NOT NULL,
  description   text,
  price         numeric(10, 2),           -- NULL = free/swap (check listing_type)
  listing_type  text NOT NULL DEFAULT 'sell' CHECK (listing_type IN ('sell', 'swap', 'free')),
  category      text NOT NULL DEFAULT 'other' CHECK (category IN ('curriculum', 'books', 'gear', 'clothing', 'toys', 'other')),
  images        text[] DEFAULT '{}',
  location_name text,
  location_lat  double precision,
  location_lng  double precision,
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'sold', 'removed')),
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE market_listings ENABLE ROW LEVEL SECURITY;

-- Anyone logged in can view active listings
CREATE POLICY "view_active_listings" ON market_listings
  FOR SELECT USING (status = 'active');

-- Sellers can manage their own listings
CREATE POLICY "manage_own_listings" ON market_listings
  FOR ALL USING (auth.uid() = seller_id);

-- Index for radius queries and seller lookups
CREATE INDEX IF NOT EXISTS idx_market_listings_seller   ON market_listings (seller_id);
CREATE INDEX IF NOT EXISTS idx_market_listings_status   ON market_listings (status);
CREATE INDEX IF NOT EXISTS idx_market_listings_category ON market_listings (category);
