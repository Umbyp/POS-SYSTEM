-- AlterTable
ALTER TABLE "Inventory" ADD COLUMN "lowAlertLevel" INTEGER NOT NULL DEFAULT 0;

-- Items already low/out when this ships are treated as already announced (no alert flood on deploy)
UPDATE "Inventory" SET "lowAlertLevel" = CASE WHEN "quantity" <= 0 THEN 2 WHEN "quantity" <= "lowStockAt" THEN 1 ELSE 0 END;
