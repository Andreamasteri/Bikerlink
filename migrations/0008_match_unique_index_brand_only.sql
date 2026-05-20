-- Migration: replace 4-column unique index with 3-column (pair + brand) on biker_biker_matches
-- Removes motorcycle_model from the uniqueness constraint so that any two bikers can only
-- have one match record per brand, regardless of model value.

-- Step 1: deduplicate existing rows that differ only by motorcycle_model.
-- For each (LEAST, GREATEST, brand) group, keep the row with the earliest created_at
-- (or lowest id as tiebreaker) and delete the rest.
DELETE FROM biker_biker_matches
WHERE id NOT IN (
  SELECT DISTINCT ON (
    LEAST(biker1_id, biker2_id),
    GREATEST(biker1_id, biker2_id),
    motorcycle_brand
  ) id
  FROM biker_biker_matches
  ORDER BY
    LEAST(biker1_id, biker2_id),
    GREATEST(biker1_id, biker2_id),
    motorcycle_brand,
    created_at ASC,
    id ASC
);

-- Step 2: drop the old 4-column unique index.
DROP INDEX IF EXISTS biker_biker_symmetric_idx;

-- Step 3: create the new 3-column unique index.
CREATE UNIQUE INDEX biker_biker_symmetric_idx
  ON biker_biker_matches (
    LEAST(biker1_id, biker2_id),
    GREATEST(biker1_id, biker2_id),
    motorcycle_brand
  );
