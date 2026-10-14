-- CreateTable
CREATE TABLE "WorldConfig" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorldConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorldConfig_storeId_key" ON "WorldConfig"("storeId");

-- AddForeignKey
ALTER TABLE "WorldConfig" ADD CONSTRAINT "WorldConfig_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
