-- CreateIndex
-- Foreign key indexes that were missing from the initial migration.
-- These eliminate sequential scans on every order fetch, report query,
-- and dashboard lookup.

-- User.storeId
CREATE INDEX "User_storeId_idx" ON "User"("storeId");

-- Category.storeId
CREATE INDEX "Category_storeId_idx" ON "Category"("storeId");

-- ProductVariant.productId
CREATE INDEX "ProductVariant_productId_idx" ON "ProductVariant"("productId");

-- StockMovement.inventoryId
CREATE INDEX "StockMovement_inventoryId_idx" ON "StockMovement"("inventoryId");

-- StockMovement.orderId
CREATE INDEX "StockMovement_orderId_idx" ON "StockMovement"("orderId");

-- Order: composite index for dashboard/report queries filtering by store + status + date
CREATE INDEX "Order_storeId_status_createdAt_idx" ON "Order"("storeId", "status", "createdAt");

-- Order.cashierId
CREATE INDEX "Order_cashierId_idx" ON "Order"("cashierId");

-- Order.tableId
CREATE INDEX "Order_tableId_idx" ON "Order"("tableId");

-- Order.promotionId
CREATE INDEX "Order_promotionId_idx" ON "Order"("promotionId");

-- OrderItem.orderId — critical: every order fetch joins on this
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- OrderItem.productId — used by reports groupBy
CREATE INDEX "OrderItem_productId_idx" ON "OrderItem"("productId");

-- Payment.orderId — every order includes payments
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");

-- Table.storeId
CREATE INDEX "Table_storeId_idx" ON "Table"("storeId");

-- BillCallRequest.tableId
CREATE INDEX "BillCallRequest_tableId_idx" ON "BillCallRequest"("tableId");

-- Shift.userId
CREATE INDEX "Shift_userId_idx" ON "Shift"("userId");
