-- AlterTable: DB-backed print-job claim lease (replaces the old in-process `leases` Map)
ALTER TABLE "PrintJob" ADD COLUMN     "leasedUntil" TIMESTAMP(3);

-- CreateTable: process-independent PIN-login brute-force lockout
CREATE TABLE "PinLockout" (
    "userId" TEXT NOT NULL,
    "fails" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PinLockout_pkey" PRIMARY KEY ("userId")
);

-- CreateTable: process-independent login-attempt rate limiting
CREATE TABLE "RateLimitCounter" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "resetAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitCounter_pkey" PRIMARY KEY ("key")
);
