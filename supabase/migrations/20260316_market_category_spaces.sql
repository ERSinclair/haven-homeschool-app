-- Fix market_listings category constraint to include 'spaces' and rename 'gear' to match UI
-- Add 'spaces' category, keep 'gear' for backwards compat, drop old constraint

ALTER TABLE market_listings
  DROP CONSTRAINT IF EXISTS market_listings_category_check;

ALTER TABLE market_listings
  ADD CONSTRAINT market_listings_category_check
    CHECK (category IN ('curriculum', 'books', 'gear', 'clothing', 'toys', 'spaces', 'other'));
