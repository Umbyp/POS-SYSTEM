-- StoreMember junction table สำหรับ multi-store support
CREATE TABLE IF NOT EXISTS "StoreMember" (
  "id"        TEXT PRIMARY KEY,
  "userId"    TEXT NOT NULL,
  "storeId"   TEXT NOT NULL,
  "role"      "Role" NOT NULL DEFAULT 'ADMIN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StoreMember_userId_fkey"  FOREIGN KEY ("userId")  REFERENCES "User"("id")  ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StoreMember_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "StoreMember_userId_storeId_key" ON "StoreMember"("userId", "storeId");
CREATE INDEX IF NOT EXISTS "StoreMember_userId_idx"  ON "StoreMember"("userId");
CREATE INDEX IF NOT EXISTS "StoreMember_storeId_idx" ON "StoreMember"("storeId");

-- Backfill: ทุก user ที่มี storeId อยู่แล้ว → ใส่ใน StoreMember
INSERT INTO "StoreMember" ("id", "userId", "storeId", "role")
SELECT
  CONCAT('sm_', u.id) AS id,
  u.id AS "userId",
  u."storeId",
  u.role
FROM "User" u
ON CONFLICT ("userId", "storeId") DO NOTHING;
