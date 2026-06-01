-- Payment notifications received via SMS webhook (one row per inbound bank SMS)
CREATE TABLE IF NOT EXISTS "PaymentNotification" (
  "id"            TEXT PRIMARY KEY,
  "storeId"       TEXT NOT NULL REFERENCES "Store"("id") ON DELETE CASCADE,
  "amount"        DECIMAL(12,2) NOT NULL,
  "bank"          TEXT,
  "senderName"    TEXT,
  "rawMessage"    TEXT NOT NULL,
  "matchedOrderId" TEXT REFERENCES "Order"("id") ON DELETE SET NULL,
  "matched"       BOOLEAN NOT NULL DEFAULT false,
  "receivedAt"    TIMESTAMP NOT NULL DEFAULT NOW(),
  "createdAt"     TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "PaymentNotification_storeId_receivedAt_idx"
  ON "PaymentNotification" ("storeId", "receivedAt" DESC);
CREATE INDEX IF NOT EXISTS "PaymentNotification_matched_idx"
  ON "PaymentNotification" ("storeId", "matched");

-- Add storeSmsToken to Store for webhook authentication (each store has its own token)
ALTER TABLE "Store"
  ADD COLUMN IF NOT EXISTS "smsWebhookToken" TEXT;
