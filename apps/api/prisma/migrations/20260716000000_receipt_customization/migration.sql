-- AlterTable: per-store receipt customization (footer text, signup/points QR toggles + copy)
ALTER TABLE "Store" ADD COLUMN     "receiptFooterText" TEXT,
ADD COLUMN     "receiptPointsTerms" TEXT,
ADD COLUMN     "receiptShowPointsQr" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "receiptShowSignupQr" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "receiptSignupHeadline" TEXT;
