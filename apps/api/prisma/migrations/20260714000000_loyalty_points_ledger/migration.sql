-- CreateEnum
CREATE TYPE "PointTxType" AS ENUM ('EARN', 'REDEEM', 'REFUND_REVERSAL', 'MANUAL_ADJUST');

-- AlterTable: store-level loyalty config
ALTER TABLE "Store" ADD COLUMN     "minRedeemPoints" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pointValue" DECIMAL(10,2) NOT NULL DEFAULT 1,
ADD COLUMN     "pointsEarnBaht" INTEGER NOT NULL DEFAULT 100;

-- CreateTable: points ledger (source of truth for point history)
CREATE TABLE "PointTransaction" (
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

-- CreateIndex
CREATE INDEX "PointTransaction_customerId_createdAt_idx" ON "PointTransaction"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "PointTransaction_storeId_type_idx" ON "PointTransaction"("storeId", "type");

-- CreateIndex
CREATE INDEX "PointTransaction_orderId_idx" ON "PointTransaction"("orderId");

-- AddForeignKey
ALTER TABLE "PointTransaction" ADD CONSTRAINT "PointTransaction_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
