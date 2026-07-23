-- AlterTable
ALTER TABLE "SelfOrderRequest" ADD COLUMN     "customerId" TEXT;

-- CreateIndex
CREATE INDEX "SelfOrderRequest_customerId_idx" ON "SelfOrderRequest"("customerId");

-- AddForeignKey
ALTER TABLE "SelfOrderRequest" ADD CONSTRAINT "SelfOrderRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
