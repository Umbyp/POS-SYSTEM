-- One table number per store.
--
-- Staff choose a table by its number in the POS, so two rows sharing a number
-- inside one store are indistinguishable: an order can land on either, and a
-- party's bill ends up split across both. Nothing stopped a duplicate before —
-- Table only carried @@index([storeId]).
--
-- If this migration fails with a unique-violation, the store really does have
-- duplicates. Find them first, renumber or delete the extras, then re-run:
--
--   SELECT "storeId", number, count(*), array_agg(id)
--   FROM "Table" GROUP BY 1, 2 HAVING count(*) > 1;

CREATE UNIQUE INDEX "Table_storeId_number_key" ON "Table"("storeId", "number");
