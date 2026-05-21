-- เพิ่ม revenue targets ใน Store
ALTER TABLE "Store"
  ADD COLUMN IF NOT EXISTS "dailyTarget"   DECIMAL(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "monthlyTarget" DECIMAL(12, 2) NOT NULL DEFAULT 0;
