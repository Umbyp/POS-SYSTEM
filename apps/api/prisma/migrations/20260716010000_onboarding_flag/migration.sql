-- AlterTable: tracks whether a store has been through (or explicitly
-- skipped) the setup wizard — null triggers it automatically on next login.
ALTER TABLE "Store" ADD COLUMN     "onboardingCompletedAt" TIMESTAMP(3);

-- Backfill: any store that already has at least one product is clearly
-- already set up (created before this feature existed, or seeded) — mark it
-- as onboarded so the wizard doesn't unexpectedly pop up for existing shops.
-- Stores with zero products (genuinely fresh) stay NULL and see the wizard.
UPDATE "Store" SET "onboardingCompletedAt" = "createdAt"
WHERE "id" IN (SELECT DISTINCT "storeId" FROM "Product");
