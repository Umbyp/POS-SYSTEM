import { prisma } from '../../config/prisma';
import { NotFound } from '../../utils/errors';

/**
 * Orders the kitchen has finished and are waiting to be handed over (dine-in
 * table service or takeaway/delivery pickup) — powers the public ready-board
 * display. Deliberately minimal: no prices, no customer/cashier info, just
 * enough for a customer or runner to recognize the order.
 */
export async function getReadyBoard(storeId: string) {
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true } });
  if (!store) throw NotFound('Store not found');

  return prisma.order.findMany({
    where: { storeId, status: 'READY' },
    select: {
      id: true,
      orderNumber: true,
      type: true,
      createdAt: true,
      table: { select: { number: true } },
      items: { select: { quantity: true, product: { select: { name: true } } } },
    },
    orderBy: { createdAt: 'asc' },
  });
}
