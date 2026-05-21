-- เพิ่ม slip verification fields ใน Payment
ALTER TABLE "Payment"
  ADD COLUMN IF NOT EXISTS "slipVerified"   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "slipTransRef"   TEXT,
  ADD COLUMN IF NOT EXISTS "slipVerifiedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "slipPayload"    TEXT;

-- Unique constraint บน slipTransRef เพื่อกัน slip ซ้ำ
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'Payment_slipTransRef_key'
  ) THEN
    CREATE UNIQUE INDEX "Payment_slipTransRef_key" ON "Payment"("slipTransRef")
      WHERE "slipTransRef" IS NOT NULL;
  END IF;
END $$;
