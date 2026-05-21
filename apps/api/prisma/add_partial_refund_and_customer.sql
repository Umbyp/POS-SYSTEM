-- 1. เพิ่ม refundedQty + refundReason ใน OrderItem
ALTER TABLE "OrderItem"
  ADD COLUMN IF NOT EXISTS "refundedQty" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "refundReason" TEXT;

-- 2. สร้าง Customer table
CREATE TABLE IF NOT EXISTS "Customer" (
  "id"          TEXT PRIMARY KEY,
  "storeId"     TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "phone"       TEXT,
  "email"       TEXT,
  "taxId"       TEXT,
  "address"     TEXT,
  "points"      INTEGER NOT NULL DEFAULT 0,
  "totalSpent"  DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "visitCount"  INTEGER NOT NULL DEFAULT 0,
  "lastVisitAt" TIMESTAMP(3),
  "notes"       TEXT,
  "isActive"    BOOLEAN NOT NULL DEFAULT true,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Customer_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Customer_storeId_phone_idx" ON "Customer"("storeId", "phone");
CREATE INDEX IF NOT EXISTS "Customer_storeId_name_idx" ON "Customer"("storeId", "name");

-- 3. เพิ่ม customerId ใน Order
ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "customerId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Order_customerId_fkey'
  ) THEN
    ALTER TABLE "Order"
      ADD CONSTRAINT "Order_customerId_fkey"
      FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Order_customerId_idx" ON "Order"("customerId");
