-- ============================================================================
-- ONE-SHOT PRODUCTION FIX — paste this whole file into Supabase → SQL Editor → Run
-- ============================================================================
-- Fixes the 500s on /auth/me, /products, /stores/me and menu options:
-- production is missing columns/tables added by migrations that were never
-- applied (prod DB drifted behind the Prisma schema again — same class of
-- issue as before; each new migration since the last baseline needs to be
-- re-appended here until `prisma migrate deploy` is confirmed to run
-- reliably on every Render deploy).
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

-- ---------- migration 20260716000000_receipt_customization ----------

ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "receiptFooterText" TEXT,
  ADD COLUMN IF NOT EXISTS "receiptPointsTerms" TEXT,
  ADD COLUMN IF NOT EXISTS "receiptShowPointsQr" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "receiptShowSignupQr" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "receiptSignupHeadline" TEXT;

-- ---------- migration 20260716010000_onboarding_flag ----------

ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "onboardingCompletedAt" TIMESTAMP(3);

UPDATE "Store" SET "onboardingCompletedAt" = "createdAt"
WHERE "onboardingCompletedAt" IS NULL
  AND "id" IN (SELECT DISTINCT "storeId" FROM "Product");

-- ---------- migration 20260721000000_self_order_request_order_link ----------

ALTER TABLE "SelfOrderRequest" ADD COLUMN IF NOT EXISTS "orderId" TEXT;
CREATE INDEX IF NOT EXISTS "SelfOrderRequest_orderId_idx" ON "SelfOrderRequest"("orderId");
DO $$ BEGIN
  ALTER TABLE "SelfOrderRequest" ADD CONSTRAINT "SelfOrderRequest_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- migration 20260722000000_add_missing_fk_indexes ----------

CREATE INDEX IF NOT EXISTS "User_storeId_idx" ON "User"("storeId");
CREATE INDEX IF NOT EXISTS "Category_storeId_idx" ON "Category"("storeId");
CREATE INDEX IF NOT EXISTS "ProductVariant_productId_idx" ON "ProductVariant"("productId");
CREATE INDEX IF NOT EXISTS "StockMovement_inventoryId_idx" ON "StockMovement"("inventoryId");
CREATE INDEX IF NOT EXISTS "StockMovement_orderId_idx" ON "StockMovement"("orderId");
CREATE INDEX IF NOT EXISTS "Order_storeId_status_createdAt_idx" ON "Order"("storeId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "Order_cashierId_idx" ON "Order"("cashierId");
CREATE INDEX IF NOT EXISTS "Order_tableId_idx" ON "Order"("tableId");
CREATE INDEX IF NOT EXISTS "Order_promotionId_idx" ON "Order"("promotionId");
CREATE INDEX IF NOT EXISTS "OrderItem_orderId_idx" ON "OrderItem"("orderId");
CREATE INDEX IF NOT EXISTS "OrderItem_productId_idx" ON "OrderItem"("productId");
CREATE INDEX IF NOT EXISTS "Payment_orderId_idx" ON "Payment"("orderId");
CREATE INDEX IF NOT EXISTS "Table_storeId_idx" ON "Table"("storeId");
CREATE INDEX IF NOT EXISTS "BillCallRequest_tableId_idx" ON "BillCallRequest"("tableId");
CREATE INDEX IF NOT EXISTS "Shift_userId_idx" ON "Shift"("userId");

-- ---------- migration 20260723000000_stamps_earn_baht ----------

ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "stampsEarnBaht" INTEGER NOT NULL DEFAULT 0;

-- ---------- migration 20260723010000_self_order_request_customer_link ----------
-- schema.prisma gained SelfOrderRequest.customerId in the member-portal work but
-- a migration file was never generated for it, so it never made it into this
-- script either — caught live via a P2022 on prisma.selfOrderRequest.create().

ALTER TABLE "SelfOrderRequest" ADD COLUMN IF NOT EXISTS "customerId" TEXT;
CREATE INDEX IF NOT EXISTS "SelfOrderRequest_customerId_idx" ON "SelfOrderRequest"("customerId");
DO $$ BEGIN
  ALTER TABLE "SelfOrderRequest" ADD CONSTRAINT "SelfOrderRequest_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- Record migration history (baseline 0_init + everything above) ----------
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
  ('0_init',                                        '174f2667c6020e679c38d23b0ed4e8aa5d8ed93a6f8bb0516054937d9ad18827'),
  ('20260714000000_loyalty_points_ledger',          '5bc981e54c76b4660c009c38b9a0090af84097209b6025bfcc4c2d54e3e60ef4'),
  ('20260714010000_loyalty_stamp_card',              '6c9d22e24ff06e85851fca647b212656a8e8af307b1e1278703c7c174b70a255'),
  ('20260714020000_menu_option_groups',              '1629e49a7552bf1ed42214e094bdffb8359a3c7e9357fc357804d1834e0b0052'),
  ('20260716000000_receipt_customization',           'deff7672264707cb25885205356862f19122f7873d7ce68b951726fabca4f33e'),
  ('20260716010000_onboarding_flag',                 '2bdaaf72ee6158f094dfe22000bd6ec33e68b9c56911175399f6a51855e2efb6'),
  ('20260721000000_self_order_request_order_link',   '86ad3afc3f5887906f3429ea4f84a2df5cd58977d8f2699d9b909eb388b5a5c2'),
  ('20260722000000_add_missing_fk_indexes',          '5568c431e3f71b312a1d8265eee650aaea17cb13f6fa9b8ac88025877041225b'),
  ('20260723000000_stamps_earn_baht',                '42dac82fb5cd943f421dcf5bcb2677707be1a066fb3874ebca880d3d54c29b64'),
  ('20260723010000_self_order_request_customer_link', 'afee45ad3f99be69d94cd87c3e47d0fefb027aa12a9b6def17b9655a859ff9f1')
) AS v(name, checksum)
WHERE NOT EXISTS (
  SELECT 1 FROM "_prisma_migrations" m WHERE m.migration_name = v.name
);
