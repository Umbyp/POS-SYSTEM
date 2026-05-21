-- เพิ่มคอลัมน์ cashSales ในตาราง Shift (idempotent)
ALTER TABLE "Shift"
  ADD COLUMN IF NOT EXISTS "cashSales" DECIMAL(10, 2) NOT NULL DEFAULT 0;
