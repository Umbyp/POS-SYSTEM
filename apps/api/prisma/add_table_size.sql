-- Add size column to Table for SMALL/MEDIUM/LARGE categorization
ALTER TABLE "Table"
  ADD COLUMN IF NOT EXISTS "size" TEXT NOT NULL DEFAULT 'MEDIUM';

-- Backfill: derive size from capacity for existing rows
UPDATE "Table" SET "size" = 'SMALL'  WHERE capacity <= 2 AND "size" = 'MEDIUM';
UPDATE "Table" SET "size" = 'LARGE'  WHERE capacity >= 6 AND "size" = 'MEDIUM';
-- (capacity 3-5 stays MEDIUM by default)
