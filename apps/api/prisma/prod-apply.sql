-- ============================================================================
-- ONE-SHOT PRODUCTION FIX — paste this whole file into Supabase → SQL Editor → Run
-- ============================================================================
-- Fixes the 500s on /products, /stores/me and menu options: production is
-- missing the loyalty / stamp-card / menu-option-group tables & columns because
-- the migrations were never applied (prod was never baselined for Prisma).
--
-- Safe to run once. It is idempotent (IF NOT EXISTS / guards) and also records
-- the migrations in _prisma_migrations so future Render deploys stay consistent.
-- It does NOT touch or delete any existing data.
-- ============================================================================

-- ---------- migration 20260714000000_loyalty_points_ledger ----------

-- Enum with all values (base + stamp) so no in-transaction ADD VALUE is needed.
DO $$ BEGIN
  CREATE TYPE "PointTxType" AS ENUM
    ('EARN','REDEEM','REFUND_REVERSAL','MANUAL_ADJUST','STAMP_EARN','STAMP_REDEEM','STAMP_ADJUST');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "Store"
  ADD COLUMN IF NOT EXISTS "minRedeemPoints" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "pointValue" DECIMAL(10,2) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "pointsEarnBaht" INTEGER NOT NULL DEFAULT 100;

CREATE TABLE IF NOT EXISTS "PointTransaction" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" "PointTxType" NOT NULL,
    "points" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "orderId" TEXT,
    "note" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PointTransaction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PointTransaction_customerId_createdAt_idx" ON "PointTransaction"("customerId","createdAt");
CREATE INDEX IF NOT EXISTS "PointTransaction_storeId_type_idx" ON "PointTransaction"("storeId","type");
CREATE INDEX IF NOT EXISTS "PointTransaction_orderId_idx" ON "PointTransaction"("orderId");
DO $$ BEGIN
  ALTER TABLE "PointTransaction" ADD CONSTRAINT "PointTransaction_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- migration 20260714010000_loyalty_stamp_card ----------

ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "stamps" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "stampsEarned" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "stampsRedeemed" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Store"
  ADD COLUMN IF NOT EXISTS "loyaltyMode" TEXT NOT NULL DEFAULT 'BOTH',
  ADD COLUMN IF NOT EXISTS "stampRewardName" TEXT,
  ADD COLUMN IF NOT EXISTS "stampRewardValue" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "stampsPerReward" INTEGER NOT NULL DEFAULT 10;

-- ---------- migration 20260714020000_menu_option_groups ----------

CREATE TABLE IF NOT EXISTS "OptionGroup" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minSelect" INTEGER NOT NULL DEFAULT 0,
    "maxSelect" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OptionGroup_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "Option" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceDelta" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Option_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "ProductOptionGroup" (
    "productId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ProductOptionGroup_pkey" PRIMARY KEY ("productId","groupId")
);
CREATE INDEX IF NOT EXISTS "OptionGroup_storeId_isActive_idx" ON "OptionGroup"("storeId","isActive");
CREATE INDEX IF NOT EXISTS "Option_groupId_idx" ON "Option"("groupId");
CREATE INDEX IF NOT EXISTS "ProductOptionGroup_groupId_idx" ON "ProductOptionGroup"("groupId");
DO $$ BEGIN
  ALTER TABLE "OptionGroup" ADD CONSTRAINT "OptionGroup_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Option" ADD CONSTRAINT "Option_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "OptionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ProductOptionGroup" ADD CONSTRAINT "ProductOptionGroup_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ProductOptionGroup" ADD CONSTRAINT "ProductOptionGroup_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "OptionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- Record migration history (baseline 0_init + the 3 above) ----------
-- So Prisma's `migrate deploy` on future Render builds sees these as applied
-- and never tries to re-create them.

CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id" VARCHAR(36) NOT NULL,
    "checksum" VARCHAR(64) NOT NULL,
    "finished_at" TIMESTAMPTZ,
    "migration_name" VARCHAR(255) NOT NULL,
    "logs" TEXT,
    "rolled_back_at" TIMESTAMPTZ,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "applied_steps_count" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "_prisma_migrations_pkey" PRIMARY KEY ("id")
);

INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, started_at, applied_steps_count)
SELECT gen_random_uuid()::text, v.checksum, now(), v.name, now(), 1
FROM (VALUES
  ('0_init',                              '174f2667c6020e679c38d23b0ed4e8aa5d8ed93a6f8bb0516054937d9ad18827'),
  ('20260714000000_loyalty_points_ledger','5bc981e54c76b4660c009c38b9a0090af84097209b6025bfcc4c2d54e3e60ef4'),
  ('20260714010000_loyalty_stamp_card',   '6c9d22e24ff06e85851fca647b212656a8e8af307b1e1278703c7c174b70a255'),
  ('20260714020000_menu_option_groups',   '1629e49a7552bf1ed42214e094bdffb8359a3c7e9357fc357804d1834e0b0052')
) AS v(name, checksum)
WHERE NOT EXISTS (
  SELECT 1 FROM "_prisma_migrations" m WHERE m.migration_name = v.name
);
