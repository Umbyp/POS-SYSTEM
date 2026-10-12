-- AlterTable
ALTER TABLE "Store" ADD COLUMN "branchName" TEXT,
ADD COLUMN "taxInvoiceCounter" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "customerBranch" TEXT,
ADD COLUMN "taxInvoiceNo" TEXT,
ADD COLUMN "taxInvoiceIssuedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Order_storeId_taxInvoiceNo_key" ON "Order"("storeId", "taxInvoiceNo");
