-- AlterTable
ALTER TABLE "Order" ADD COLUMN "refundedAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN "refundedAt" TIMESTAMP(3);

-- Backfill: fully refunded bills → whole total; partially refunded → sum of logged partial refunds
UPDATE "Order" SET "refundedAmount" = "total" WHERE "status" = 'REFUNDED';

UPDATE "Order" o
SET "refundedAmount" = LEAST(o."total", s.amt)
FROM (
  SELECT ("metadata"->>'orderId') AS oid, SUM(COALESCE(("metadata"->>'refundedAmount')::numeric, 0)) AS amt
  FROM "ActivityLog"
  WHERE "action" = 'PARTIAL_REFUND'
  GROUP BY 1
) s
WHERE o."id" = s.oid AND o."status" <> 'REFUNDED';

UPDATE "Order" o
SET "refundedAt" = s.at
FROM (
  SELECT ("metadata"->>'orderId') AS oid, MAX("createdAt") AS at
  FROM "ActivityLog"
  WHERE "action" IN ('REFUND', 'PARTIAL_REFUND')
  GROUP BY 1
) s
WHERE o."id" = s.oid AND o."refundedAmount" > 0;

UPDATE "Order" SET "refundedAt" = COALESCE("completedAt", "createdAt") WHERE "status" = 'REFUNDED' AND "refundedAt" IS NULL;
