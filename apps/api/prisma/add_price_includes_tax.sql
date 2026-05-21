-- เพิ่มคอลัมน์ priceIncludesTax ในตาราง Store (idempotent — รันซ้ำได้)
ALTER TABLE "Store"
  ADD COLUMN IF NOT EXISTS "priceIncludesTax" BOOLEAN NOT NULL DEFAULT true;
