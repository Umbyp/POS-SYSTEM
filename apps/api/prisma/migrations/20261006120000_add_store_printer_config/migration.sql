-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "printerIp" TEXT,
ADD COLUMN     "printerPort" INTEGER NOT NULL DEFAULT 9100;
