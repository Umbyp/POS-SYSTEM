-- Phase 7 migrations: Promotions + Combo + LINE notify

-- 1. เพิ่ม lineNotifyToken + isCombo
ALTER TABLE "Store"   ADD COLUMN IF NOT EXISTS "lineNotifyToken" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "isCombo" BOOLEAN NOT NULL DEFAULT false;

-- 2. เพิ่มฟิลด์ promotion ใน Order
ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "promotionId" TEXT,
  ADD COLUMN IF NOT EXISTS "promotionName" TEXT,
  ADD COLUMN IF NOT EXISTS "promotionDiscount" DECIMAL(10, 2) NOT NULL DEFAULT 0;

-- 3. สร้าง Promotion table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PromotionType') THEN
    CREATE TYPE "PromotionType" AS ENUM ('PERCENT_OFF', 'FIXED_OFF', 'BUY_X_GET_Y', 'FIXED_PRICE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PromotionScope') THEN
    CREATE TYPE "PromotionScope" AS ENUM ('ALL_ORDER', 'CATEGORY', 'PRODUCT');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "Promotion" (
  "id"          TEXT PRIMARY KEY,
  "storeId"     TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "code"        TEXT,
  "type"        "PromotionType" NOT NULL,
  "scope"       "PromotionScope" NOT NULL DEFAULT 'ALL_ORDER',
  "value"       DECIMAL(10, 2) NOT NULL DEFAULT 0,
  "buyQty"      INTEGER,
  "getQty"      INTEGER,
  "productIds"  TEXT[] NOT NULL DEFAULT '{}',
  "categoryIds" TEXT[] NOT NULL DEFAULT '{}',
  "minSpend"    DECIMAL(10, 2),
  "startAt"     TIMESTAMP(3),
  "endAt"       TIMESTAMP(3),
  "daysOfWeek"  INTEGER[] NOT NULL DEFAULT '{}',
  "hourStart"   INTEGER,
  "hourEnd"     INTEGER,
  "memberOnly"  BOOLEAN NOT NULL DEFAULT false,
  "isActive"    BOOLEAN NOT NULL DEFAULT true,
  "usageLimit"  INTEGER,
  "usageCount"  INTEGER NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Promotion_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Promotion_storeId_isActive_idx" ON "Promotion"("storeId", "isActive");
CREATE INDEX IF NOT EXISTS "Promotion_code_idx" ON "Promotion"("code");
