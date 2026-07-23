-- AlterTable: store-level rate for baht-based stamp earning (0 = legacy flat 1 stamp/bill)
ALTER TABLE "Store" ADD COLUMN     "stampsEarnBaht" INTEGER NOT NULL DEFAULT 0;
