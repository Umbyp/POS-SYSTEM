/**
 * A store must not hold two tables with the same number: staff pick a table by
 * its number in the POS, so duplicates are indistinguishable there and a party's
 * bill ends up split across both rows. Nothing enforced it until the
 * 20260813000000_unique_table_number_per_store migration.
 *
 * Runs against the real local dev Postgres with self-cleaning fixtures (same
 * pattern as order-tab.integration.test.ts). Requires the local Docker Postgres.
 */
import 'dotenv/config'; // must run before ../../config/prisma is imported below
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';

describe('table numbers are unique per store (integration)', () => {
  let storeId: string;
  let otherStoreId: string;

  beforeAll(async () => {
    const store = await prisma.store.create({ data: { name: 'TEST_STORE_table-unique' } });
    storeId = store.id;
    const other = await prisma.store.create({ data: { name: 'TEST_STORE_table-unique-other' } });
    otherStoreId = other.id;
  });

  afterAll(async () => {
    await prisma.table.deleteMany({ where: { storeId: { in: [storeId, otherStoreId] } } });
    await prisma.store.deleteMany({ where: { id: { in: [storeId, otherStoreId] } } });
    await prisma.$disconnect();
  });

  it('rejects a second table with the same number in one store', async () => {
    await prisma.table.create({ data: { number: 'A1', storeId } });
    await expect(prisma.table.create({ data: { number: 'A1', storeId } })).rejects.toSatisfy(
      (e: unknown) =>
        e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002',
      'expected a P2002 unique-constraint violation',
    );
  });

  it('lets a different store use the same number', async () => {
    const t = await prisma.table.create({ data: { number: 'A1', storeId: otherStoreId } });
    expect(t.number).toBe('A1');
  });

  it('frees the number again once the table is deleted (deletes are hard, not soft)', async () => {
    const t = await prisma.table.create({ data: { number: 'Z9', storeId } });
    await prisma.table.delete({ where: { id: t.id } });
    const again = await prisma.table.create({ data: { number: 'Z9', storeId } });
    expect(again.id).not.toBe(t.id);
  });
});
