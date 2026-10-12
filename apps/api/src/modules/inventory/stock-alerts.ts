import type { Server } from 'socket.io';
import { prisma } from '../../config/prisma';

/**
 * Menu availability + low-stock alerts.
 *
 * A menu item is "sold out" when it tracks stock and is at 0, or when any tracked recipe
 * ingredient can't cover one serving. Alerts fire once per downward crossing (low → out);
 * Inventory.lowAlertLevel remembers what was already announced and resets when restocked.
 */

export async function soldOutProductIds(storeId: string, productIds?: string[]): Promise<Set<string>> {
  const products = await prisma.product.findMany({
    where: { storeId, isActive: true, isIngredient: false, ...(productIds ? { id: { in: productIds } } : {}) },
    select: {
      id: true,
      trackStock: true,
      inventory: { select: { quantity: true } },
      recipe: {
        select: {
          quantity: true,
          ingredient: { select: { trackStock: true, inventory: { select: { quantity: true } } } },
        },
      },
    },
  });
  const out = new Set<string>();
  for (const p of products) {
    if (p.trackStock && p.inventory && p.inventory.quantity <= 0) { out.add(p.id); continue; }
    const short = p.recipe.some(
      (r) => r.ingredient.trackStock && r.ingredient.inventory && r.ingredient.inventory.quantity < Math.ceil(Number(r.quantity)),
    );
    if (short) out.add(p.id);
  }
  return out;
}

export interface StockAlertItem {
  inventoryId: string;
  productId: string;
  name: string;
  quantity: number;
  lowStockAt: number;
  level: 1 | 2; // 1 = low, 2 = out
  isIngredient: boolean;
}

/** Re-evaluate the store's tracked inventories; returns (and emits) only newly worsened items. */
export async function syncStockAlerts(io: Server | undefined, storeId: string): Promise<StockAlertItem[]> {
  const rows = await prisma.inventory.findMany({
    where: { product: { storeId, isActive: true, trackStock: true } },
    select: {
      id: true, quantity: true, lowStockAt: true, lowAlertLevel: true,
      product: { select: { id: true, name: true, isIngredient: true } },
    },
  });
  const alerts: StockAlertItem[] = [];
  for (const r of rows) {
    const want = r.quantity <= 0 ? 2 : r.quantity <= r.lowStockAt ? 1 : 0;
    if (want === r.lowAlertLevel) continue;
    // compare-and-set so two concurrent sales can't announce the same crossing twice
    const { count } = await prisma.inventory.updateMany({
      where: { id: r.id, lowAlertLevel: r.lowAlertLevel },
      data: { lowAlertLevel: want },
    });
    if (count === 1 && want > r.lowAlertLevel) {
      alerts.push({
        inventoryId: r.id, productId: r.product.id, name: r.product.name, quantity: r.quantity,
        lowStockAt: r.lowStockAt, level: want as 1 | 2, isIngredient: r.product.isIngredient,
      });
    }
  }
  if (alerts.length && io) io.to(`store:${storeId}`).emit('stock:low', { items: alerts });
  return alerts;
}

/** Single place that announces a stock change: refresh product lists, then raise any low-stock alerts. */
export function emitStockUpdated(io: Server, storeId: string, productIds: string[]) {
  io.to(`store:${storeId}`).emit('stock:updated', { productIds });
  syncStockAlerts(io, storeId).catch((e) => console.error('[stock-alerts]', e));
}
