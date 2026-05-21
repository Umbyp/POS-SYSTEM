-- เพิ่ม isIngredient ใน Product
ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS "isIngredient" BOOLEAN NOT NULL DEFAULT false;

-- สร้าง RecipeItem table
CREATE TABLE IF NOT EXISTS "RecipeItem" (
  "id"           TEXT PRIMARY KEY,
  "productId"    TEXT NOT NULL,
  "ingredientId" TEXT NOT NULL,
  "quantity"     DECIMAL(10, 3) NOT NULL,
  "unit"         TEXT,
  "notes"        TEXT,
  CONSTRAINT "RecipeItem_productId_fkey"    FOREIGN KEY ("productId")    REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RecipeItem_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "RecipeItem_productId_idx"    ON "RecipeItem"("productId");
CREATE INDEX IF NOT EXISTS "RecipeItem_ingredientId_idx" ON "RecipeItem"("ingredientId");
