/**
 * Integration: low-stock alerts fire once per downward crossing and reset on restock;
 * sold-out covers own stock and short recipe ingredients. Real local Postgres, self-cleaning.
 */
import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../config/prisma';
import { syncStockAlerts, soldOutProductIds, emitStockUpdated } from './stock-alerts';

const stamp = Date.now();

describe('stock alerts & sold-out (integration)', () => {
  let storeId: string, categoryId: string, otherStoreId: string;
  let drink: { id: string; inv: string }, bean: { id: string; inv: string };
  const events: any[] = [];
  const io: any = { to: () => ({ emit: (name: string, payload: any) => events.push({ name, payload }) }) };
  const setQty = (inv: string, quantity: number) => prisma.inventory.update({ where: { id: inv }, data: { quantity } });

  async function mkProduct(name: string, qty: number, extra: any = {}) {
    const p = await prisma.product.create({
      data: { name, sku: `T-SA-${name}-${stamp}`, costPrice: 1, sellingPrice: 10, categoryId, storeId, trackStock: true, ...extra },
    });
    const inv = await prisma.inventory.create({ data: { productId: p.id, quantity: qty, lowStockAt: 10 } });
    return { id: p.id, inv: inv.id };
  }

  beforeAll(async () => {
    storeId = (await prisma.store.create({ data: { name: `TEST_sa_${stamp}` } })).id;
    otherStoreId = (await prisma.store.create({ data: { name: `TEST_sa2_${stamp}` } })).id;
    categoryId = (await prisma.category.create({ data: { name: 'C', storeId } })).id;
    drink = await mkProduct('Drink', 50);
    bean = await mkProduct('Bean', 50, { isIngredient: true });
    await prisma.recipeItem.create({ data: { productId: drink.id, ingredientId: bean.id, quantity: 2, unit: 'g' } });
  });

  afterAll(async () => {
    await prisma.recipeItem.deleteMany({ where: { productId: drink.id } });
    await prisma.inventory.deleteMany({ where: { id: { in: [drink.inv, bean.inv] } } });
    await prisma.product.deleteMany({ where: { storeId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.store.deleteMany({ where: { id: { in: [storeId, otherStoreId] } } });
    await prisma.$disconnect();
  });

  it('alerts once when crossing low, again when out, never repeats, and re-arms after restock', async () => {
    expect(await syncStockAlerts(io, storeId)).toEqual([]);          // healthy

    await setQty(drink.inv, 9);
    const low = await syncStockAlerts(io, storeId);
    expect(low).toHaveLength(1);
    expect(low[0]).toMatchObject({ productId: drink.id, level: 1, quantity: 9 });
    expect(events.at(-1)).toMatchObject({ name: 'stock:low' });
    expect(await syncStockAlerts(io, storeId)).toEqual([]);          // same state → no repeat

    await setQty(drink.inv, 0);
    const out = await syncStockAlerts(io, storeId);
    expect(out).toHaveLength(1);
    expect(out[0].level).toBe(2);
    expect(await syncStockAlerts(io, storeId)).toEqual([]);

    await setQty(drink.inv, 40);                                      // restocked
    expect(await syncStockAlerts(io, storeId)).toEqual([]);          // silent reset
    await setQty(drink.inv, 5);
    expect(await syncStockAlerts(io, storeId)).toHaveLength(1);      // re-armed
    await setQty(drink.inv, 50);
    await syncStockAlerts(io, storeId);
  });

  it('concurrent syncs announce a crossing only once', async () => {
    await setQty(bean.inv, 3);
    const results = await Promise.all([1, 2, 3, 4].map(() => syncStockAlerts(io, storeId)));
    expect(results.flat().filter((a) => a.productId === bean.id)).toHaveLength(1);
    await setQty(bean.inv, 50);
    await syncStockAlerts(io, storeId);
  });

  it('is tenant-scoped: another store sees nothing', async () => {
    await setQty(drink.inv, 1);
    expect(await syncStockAlerts(io, otherStoreId)).toEqual([]);
    await setQty(drink.inv, 50);
    await syncStockAlerts(io, storeId);
  });

  it('sold-out: own stock at 0, or a recipe ingredient that cannot cover one serving', async () => {
    expect((await soldOutProductIds(storeId)).has(drink.id)).toBe(false);
    await setQty(drink.inv, 0);
    expect((await soldOutProductIds(storeId)).has(drink.id)).toBe(true);
    await setQty(drink.inv, 50);
    await setQty(bean.inv, 1);                                         // recipe needs 2 per drink
    expect((await soldOutProductIds(storeId)).has(drink.id)).toBe(true);
    expect((await soldOutProductIds(storeId)).has(bean.id)).toBe(false); // ingredients are not menu items
    await setQty(bean.inv, 50);
    expect((await soldOutProductIds(storeId)).has(drink.id)).toBe(false);
  });

  it('emitStockUpdated announces the change and raises the alert', async () => {
    events.length = 0;
    await setQty(drink.inv, 2);
    emitStockUpdated(io, storeId, [drink.id]);
    await new Promise((r) => setTimeout(r, 300));
    expect(events.map((e) => e.name)).toEqual(expect.arrayContaining(['stock:updated', 'stock:low']));
  });
});
