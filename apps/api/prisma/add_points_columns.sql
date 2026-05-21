-- เพิ่ม pointsRedeemed + pointsEarned ใน Order
ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "pointsRedeemed" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "pointsEarned"   INTEGER NOT NULL DEFAULT 0;
