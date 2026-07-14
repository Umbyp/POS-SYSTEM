-- AlterEnum: stamp-card transaction types
ALTER TYPE "PointTxType" ADD VALUE 'STAMP_EARN';
ALTER TYPE "PointTxType" ADD VALUE 'STAMP_REDEEM';
ALTER TYPE "PointTxType" ADD VALUE 'STAMP_ADJUST';

-- AlterTable: unredeemed stamp count on the customer
ALTER TABLE "Customer" ADD COLUMN     "stamps" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: per-order stamp accounting (for refund reversal)
ALTER TABLE "Order" ADD COLUMN     "stampsEarned" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "stampsRedeemed" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: store-level loyalty mode + stamp-card config
ALTER TABLE "Store" ADD COLUMN     "loyaltyMode" TEXT NOT NULL DEFAULT 'BOTH',
ADD COLUMN     "stampRewardName" TEXT,
ADD COLUMN     "stampRewardValue" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "stampsPerReward" INTEGER NOT NULL DEFAULT 10;
