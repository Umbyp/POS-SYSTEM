-- AlterTable
ALTER TABLE "SelfOrderRequest" ADD COLUMN     "orderId" TEXT;

-- CreateIndex
CREATE INDEX "SelfOrderRequest_orderId_idx" ON "SelfOrderRequest"("orderId");

-- AddForeignKey
ALTER TABLE "SelfOrderRequest" ADD CONSTRAINT "SelfOrderRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
