ALTER TABLE conversations ADD COLUMN IF NOT EXISTS listing_id uuid REFERENCES market_listings(id) ON DELETE SET NULL;
