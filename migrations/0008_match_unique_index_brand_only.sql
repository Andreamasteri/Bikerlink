-- Migration: replace 4-column unique index with 3-column (pair + brand) on biker_biker_matches
-- Removes motorcycle_model from the uniqueness constraint so that any two bikers can only
-- have one match record per brand, regardless of model value.

-- Step 1: deduplicate existing rows that differ only by motorcycle_model.
-- For each (LEAST, GREATEST, brand) group, keep the row with the earliest created_at
-- (or lowest id as tiebreaker) and delete the rest.
-- Uses ROW_NUMBER() CTE instead of NOT IN to be NULL-safe and performant.
WITH dupes AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY LEAST(biker1_id, biker2_id),
                        GREATEST(biker1_id, biker2_id),
                        motorcycle_brand
           ORDER BY created_at ASC, id ASC
         ) AS rn
  FROM biker_biker_matches
)
DELETE FROM biker_biker_matches
WHERE id IN (SELECT id FROM dupes WHERE rn > 1);

--> statement-breakpoint

-- Step 2: drop the old 4-column unique index.
DROP INDEX IF EXISTS biker_biker_symmetric_idx;

--> statement-breakpoint

-- Step 3: create the new 3-column unique index.
CREATE UNIQUE INDEX IF NOT EXISTS biker_biker_symmetric_idx
  ON biker_biker_matches (
    LEAST(biker1_id, biker2_id),
    GREATEST(biker1_id, biker2_id),
    motorcycle_brand
  );
